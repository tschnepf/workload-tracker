from __future__ import annotations

from datetime import timedelta
from typing import Iterable, Any

from django.db import transaction
from django.utils import timezone

from core.models import (
    EmailNotificationDigestItem,
    InAppNotification,
    NotificationDeliveryLog,
    NotificationPreference,
    NotificationTemplate,
    WebPushGlobalSettings,
)
from core.notification_policy import (
    CHANNEL_EMAIL,
    CHANNEL_IN_BROWSER,
    CHANNEL_MOBILE_PUSH,
    is_project_channel_muted,
    notifications_template_rendering_enabled,
    should_suppress_channel_for_active_user,
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


class _SafeFormatDict(dict):
    def __missing__(self, key):
        return ''


def _render_template(raw: str | None, context: dict[str, Any]) -> str:
    text = str(raw or '')
    if not text:
        return ''
    try:
        return text.format_map(_SafeFormatDict(context))
    except Exception:
        return text


def _template_for_event(event_key: str) -> NotificationTemplate | None:
    if not notifications_template_rendering_enabled():
        return None
    return NotificationTemplate.objects.filter(event_key=event_key).first()


def _topic_for_mode(*, topic_mode: str, event_key: str, project_id: int | None) -> str | None:
    mode = str(topic_mode or NotificationTemplate.PUSH_TOPIC_EVENT).strip().lower()
    if mode == NotificationTemplate.PUSH_TOPIC_NONE:
        return None
    if mode == NotificationTemplate.PUSH_TOPIC_PROJECT and project_id is not None:
        return f"project.{int(project_id)}"
    return f"event.{event_key}"


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
    template_context: dict[str, Any] | None = None,
) -> dict[str, int]:
    normalized_user_ids = _normalized_user_ids(user_ids)
    if not normalized_user_ids:
        return {'pushQueued': 0, 'inAppCreated': 0, 'emailQueued': 0}
    if event_key not in EVENT_KEYS:
        return {'pushQueued': 0, 'inAppCreated': 0, 'emailQueued': 0}

    availability = _build_global_availability()
    pref_map = ensure_preferences_for_users(normalized_user_ids)
    template_obj = _template_for_event(event_key)
    render_ctx = {
        'event_key': event_key,
        'title': title,
        'body': body,
        'url': url,
        'project_id': project_id or '',
        'entity_type': entity_type or '',
        'entity_id': entity_id or '',
    }
    if isinstance(template_context, dict):
        render_ctx.update(template_context)

    push_title = _render_template(getattr(template_obj, 'push_title_template', ''), render_ctx) or title
    push_body = _render_template(getattr(template_obj, 'push_body_template', ''), render_ctx) or body
    email_subject = _render_template(getattr(template_obj, 'email_subject_template', ''), render_ctx) or title
    email_body = _render_template(getattr(template_obj, 'email_body_template', ''), render_ctx) or body
    in_app_title = _render_template(getattr(template_obj, 'in_app_title_template', ''), render_ctx) or title
    in_app_body = _render_template(getattr(template_obj, 'in_app_body_template', ''), render_ctx) or body

    push_ttl_seconds = int(getattr(template_obj, 'push_ttl_seconds', 3600) or 3600)
    push_urgency = str(getattr(template_obj, 'push_urgency', NotificationTemplate.PUSH_URGENCY_NORMAL) or NotificationTemplate.PUSH_URGENCY_NORMAL)
    push_topic = _topic_for_mode(
        topic_mode=str(getattr(template_obj, 'push_topic_mode', NotificationTemplate.PUSH_TOPIC_EVENT) or NotificationTemplate.PUSH_TOPIC_EVENT),
        event_key=event_key,
        project_id=project_id,
    )

    payload = build_push_payload(
        event_type=event_key,
        title=push_title,
        body=push_body,
        url=url,
        tag=tag,
        priority=priority,
        project_id=project_id,
        entity_type=entity_type,
        entity_id=entity_id,
        actions=actions,
        ttl_seconds=push_ttl_seconds,
        urgency=push_urgency,
        topic=push_topic,
    )

    push_recipient_ids: list[int] = []
    in_app_rows: list[InAppNotification] = []
    email_rows: list[EmailNotificationDigestItem] = []
    delivery_logs: list[NotificationDeliveryLog] = []
    try:
        cfg = WebPushGlobalSettings.get_active()
        in_app_retention_days = max(1, int(getattr(cfg, 'in_app_retention_days', 7) or 7))
    except Exception:
        in_app_retention_days = 7
    expires_at = timezone.now() + timedelta(days=in_app_retention_days)

    for user_id in normalized_user_ids:
        pref = pref_map.get(user_id)

        push_enabled = channel_enabled_for_preference(
            pref,
            event_key=event_key,
            channel=CHANNEL_MOBILE_PUSH,
            availability=availability,
        )
        if push_enabled:
            if is_project_channel_muted(user_id, project_id, CHANNEL_MOBILE_PUSH):
                delivery_logs.append(
                    NotificationDeliveryLog(
                        event_key=event_key,
                        user_id=user_id,
                        channel=CHANNEL_MOBILE_PUSH,
                        status=NotificationDeliveryLog.STATUS_SUPPRESSED,
                        reason='project_mute',
                        project_id=project_id,
                    )
                )
            else:
                suppressed, suppress_reason = should_suppress_channel_for_active_user(
                    user_id=user_id,
                    channel=CHANNEL_MOBILE_PUSH,
                    priority=priority,
                )
                if suppressed:
                    delivery_logs.append(
                        NotificationDeliveryLog(
                            event_key=event_key,
                            user_id=user_id,
                            channel=CHANNEL_MOBILE_PUSH,
                            status=NotificationDeliveryLog.STATUS_SUPPRESSED,
                            reason=suppress_reason,
                            project_id=project_id,
                        )
                    )
                else:
                    push_recipient_ids.append(user_id)
                    delivery_logs.append(
                        NotificationDeliveryLog(
                            event_key=event_key,
                            user_id=user_id,
                            channel=CHANNEL_MOBILE_PUSH,
                            status=NotificationDeliveryLog.STATUS_QUEUED,
                            reason='dispatch',
                            project_id=project_id,
                        )
                    )

        in_browser_enabled = channel_enabled_for_preference(
            pref,
            event_key=event_key,
            channel=CHANNEL_IN_BROWSER,
            availability=availability,
        )
        if in_browser_enabled:
            if is_project_channel_muted(user_id, project_id, CHANNEL_IN_BROWSER):
                delivery_logs.append(
                    NotificationDeliveryLog(
                        event_key=event_key,
                        user_id=user_id,
                        channel=CHANNEL_IN_BROWSER,
                        status=NotificationDeliveryLog.STATUS_SUPPRESSED,
                        reason='project_mute',
                        project_id=project_id,
                    )
                )
            else:
                in_app_rows.append(
                    InAppNotification(
                        user_id=user_id,
                        event_key=event_key,
                        title=in_app_title,
                        body=in_app_body,
                        url=url,
                        payload=payload,
                        project_id=project_id,
                        delivery_reason='dispatch',
                        channel_origin=CHANNEL_IN_BROWSER,
                        expires_at=expires_at,
                    )
                )
                delivery_logs.append(
                    NotificationDeliveryLog(
                        event_key=event_key,
                        user_id=user_id,
                        channel=CHANNEL_IN_BROWSER,
                        status=NotificationDeliveryLog.STATUS_SENT,
                        reason='dispatch',
                        project_id=project_id,
                    )
                )

        email_enabled = channel_enabled_for_preference(
            pref,
            event_key=event_key,
            channel=CHANNEL_EMAIL,
            availability=availability,
        )
        if event_key != 'pred.digest' and email_enabled:
            if is_project_channel_muted(user_id, project_id, CHANNEL_EMAIL):
                delivery_logs.append(
                    NotificationDeliveryLog(
                        event_key=event_key,
                        user_id=user_id,
                        channel=CHANNEL_EMAIL,
                        status=NotificationDeliveryLog.STATUS_SUPPRESSED,
                        reason='project_mute',
                        project_id=project_id,
                    )
                )
            else:
                suppressed, suppress_reason = should_suppress_channel_for_active_user(
                    user_id=user_id,
                    channel=CHANNEL_EMAIL,
                    priority=priority,
                )
                if suppressed:
                    delivery_logs.append(
                        NotificationDeliveryLog(
                            event_key=event_key,
                            user_id=user_id,
                            channel=CHANNEL_EMAIL,
                            status=NotificationDeliveryLog.STATUS_SUPPRESSED,
                            reason=suppress_reason,
                            project_id=project_id,
                        )
                    )
                else:
                    email_rows.append(
                        EmailNotificationDigestItem(
                            user_id=user_id,
                            event_key=event_key,
                            title=email_subject,
                            body=email_body,
                            url=url,
                            payload=payload,
                        )
                    )
                    delivery_logs.append(
                        NotificationDeliveryLog(
                            event_key=event_key,
                            user_id=user_id,
                            channel=CHANNEL_EMAIL,
                            status=NotificationDeliveryLog.STATUS_QUEUED,
                            reason='digest_queue',
                            project_id=project_id,
                        )
                    )

    with transaction.atomic():
        if in_app_rows:
            InAppNotification.objects.bulk_create(in_app_rows)
        if email_rows:
            EmailNotificationDigestItem.objects.bulk_create(email_rows)
        if delivery_logs:
            NotificationDeliveryLog.objects.bulk_create(delivery_logs)

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
