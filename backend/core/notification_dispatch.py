from __future__ import annotations

from datetime import timedelta
from typing import Iterable, Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from core.models import (
    EmailNotificationDigestItem,
    InAppNotification,
    NotificationPreference,
    WebPushGlobalSettings,
)
from core.notification_matrix import (
    EVENT_KEYS,
    apply_availability,
    effective_channel_availability,
    legacy_global_matrix_from_settings,
    legacy_user_matrix_from_preference,
    normalize_notification_channel_matrix,
)
from core.webpush import build_push_payload, queue_push_to_users


def _normalized_user_ids(user_ids: Iterable[int]) -> list[int]:
    return sorted({int(uid) for uid in user_ids if uid is not None})


def _event_mobile_push_enabled_by_env(event_key: str) -> bool:
    if event_key in {'pred.reminder', 'pred.digest', 'deliverable.reminder'}:
        return bool(getattr(settings, 'WEB_PUSH_REMINDER_EVENTS_ENABLED', True))
    if event_key in {
        'assignment.created',
        'assignment.removed',
        'assignment.bulk_updated',
    }:
        return bool(getattr(settings, 'WEB_PUSH_ASSIGNMENT_EVENTS_ENABLED', True))
    if event_key == 'deliverable.date_changed':
        return bool(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_EVENTS_ENABLED', True))
    return True


def _build_global_availability() -> dict[str, dict[str, bool]]:
    cfg = WebPushGlobalSettings.get_active()
    legacy_matrix = legacy_global_matrix_from_settings(cfg)
    global_matrix = normalize_notification_channel_matrix(
        getattr(cfg, 'notification_channel_matrix', None),
        fallback=legacy_matrix,
    )

    availability = effective_channel_availability(
        global_matrix,
        mobile_push_globally_enabled=bool(getattr(cfg, 'enabled', True)),
    )

    for event_key in EVENT_KEYS:
        if not _event_mobile_push_enabled_by_env(event_key):
            availability[event_key]['mobilePush'] = False

    return availability


def get_effective_channel_availability() -> dict[str, dict[str, bool]]:
    return _build_global_availability()


def ensure_preferences_for_users(user_ids: Iterable[int]) -> dict[int, NotificationPreference]:
    normalized = _normalized_user_ids(user_ids)
    if not normalized:
        return {}

    pref_map = NotificationPreference.objects.filter(user_id__in=normalized).in_bulk(field_name='user_id')
    missing = [uid for uid in normalized if uid not in pref_map]
    if missing:
        NotificationPreference.objects.bulk_create(
            [NotificationPreference(user_id=uid) for uid in missing],
            ignore_conflicts=True,
        )
        pref_map = NotificationPreference.objects.filter(user_id__in=normalized).in_bulk(field_name='user_id')

    return pref_map


def matrix_for_preference(pref: NotificationPreference | None) -> dict[str, dict[str, bool]]:
    legacy_fallback = legacy_user_matrix_from_preference(pref)
    if pref is None:
        return legacy_fallback
    return normalize_notification_channel_matrix(
        getattr(pref, 'notification_channel_matrix', None),
        fallback=legacy_fallback,
    )


def channel_enabled_for_preference(
    pref: NotificationPreference | None,
    *,
    event_key: str,
    channel: str,
    availability: dict[str, dict[str, bool]] | None = None,
) -> bool:
    if event_key not in EVENT_KEYS:
        return False
    if channel not in {'mobilePush', 'email', 'inBrowser'}:
        return False

    effective_availability = availability or _build_global_availability()
    user_matrix = matrix_for_preference(pref)
    effective_user_matrix = apply_availability(user_matrix, effective_availability)
    enabled = bool(effective_user_matrix[event_key][channel])

    if channel == 'mobilePush':
        return bool(enabled and pref is not None and getattr(pref, 'web_push_enabled', False))
    return enabled


def filter_user_ids_for_channel(
    user_ids: Iterable[int],
    *,
    event_key: str,
    channel: str,
    pref_map: dict[int, NotificationPreference] | None = None,
    availability: dict[str, dict[str, bool]] | None = None,
) -> list[int]:
    normalized = _normalized_user_ids(user_ids)
    if not normalized:
        return []

    pref_index = pref_map or ensure_preferences_for_users(normalized)
    effective_availability = availability or _build_global_availability()
    recipients: list[int] = []

    for uid in normalized:
        pref = pref_index.get(uid)
        if channel_enabled_for_preference(
            pref,
            event_key=event_key,
            channel=channel,
            availability=effective_availability,
        ):
            recipients.append(uid)

    return recipients


def dispatch_event_to_users(
    *,
    user_ids: Iterable[int],
    event_key: str,
    title: str,
    body: str,
    url: str,
    tag: str | None = None,
    priority: str | None = 'normal',
    project_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actions: list[dict[str, str]] | None = None,
) -> dict[str, int]:
    normalized_user_ids = _normalized_user_ids(user_ids)
    if not normalized_user_ids:
        return {'pushQueued': 0, 'inAppCreated': 0, 'emailQueued': 0}
    if event_key not in EVENT_KEYS:
        return {'pushQueued': 0, 'inAppCreated': 0, 'emailQueued': 0}

    availability = _build_global_availability()
    pref_map = ensure_preferences_for_users(normalized_user_ids)

    payload = build_push_payload(
        event_type=event_key,
        title=title,
        body=body,
        url=url,
        tag=tag,
        priority=priority,
        project_id=project_id,
        entity_type=entity_type,
        entity_id=entity_id,
        actions=actions,
    )

    push_recipient_ids: list[int] = []
    in_app_rows: list[InAppNotification] = []
    email_rows: list[EmailNotificationDigestItem] = []
    expires_at = timezone.now() + timedelta(days=7)

    for user_id in normalized_user_ids:
        pref = pref_map.get(user_id)

        if channel_enabled_for_preference(
            pref,
            event_key=event_key,
            channel='mobilePush',
            availability=availability,
        ):
            push_recipient_ids.append(user_id)

        if channel_enabled_for_preference(
            pref,
            event_key=event_key,
            channel='inBrowser',
            availability=availability,
        ):
            in_app_rows.append(
                InAppNotification(
                    user_id=user_id,
                    event_key=event_key,
                    title=title,
                    body=body,
                    url=url,
                    payload=payload,
                    expires_at=expires_at,
                )
            )

        if event_key != 'pred.digest' and channel_enabled_for_preference(
            pref,
            event_key=event_key,
            channel='email',
            availability=availability,
        ):
            email_rows.append(
                EmailNotificationDigestItem(
                    user_id=user_id,
                    event_key=event_key,
                    title=title,
                    body=body,
                    url=url,
                    payload=payload,
                )
            )

    with transaction.atomic():
        if in_app_rows:
            InAppNotification.objects.bulk_create(in_app_rows)
        if email_rows:
            EmailNotificationDigestItem.objects.bulk_create(email_rows)

    if push_recipient_ids:
        queue_push_to_users(push_recipient_ids, payload, preference_field=None)

    return {
        'pushQueued': len(push_recipient_ids),
        'inAppCreated': len(in_app_rows),
        'emailQueued': len(email_rows),
    }


def queue_email_digest_items_for_users(
    *,
    user_ids: Iterable[int],
    event_key: str,
    title: str,
    body: str,
    url: str,
    payload: dict[str, Any] | None = None,
) -> int:
    normalized_user_ids = _normalized_user_ids(user_ids)
    if not normalized_user_ids:
        return 0
    if event_key not in EVENT_KEYS:
        return 0

    availability = _build_global_availability()
    pref_map = ensure_preferences_for_users(normalized_user_ids)
    rows: list[EmailNotificationDigestItem] = []

    for user_id in normalized_user_ids:
        pref = pref_map.get(user_id)
        if not channel_enabled_for_preference(
            pref,
            event_key=event_key,
            channel='email',
            availability=availability,
        ):
            continue
        rows.append(
            EmailNotificationDigestItem(
                user_id=user_id,
                event_key=event_key,
                title=title,
                body=body,
                url=url,
                payload=payload or {},
            )
        )

    if not rows:
        return 0

    EmailNotificationDigestItem.objects.bulk_create(rows)
    return len(rows)
