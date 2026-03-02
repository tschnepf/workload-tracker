from __future__ import annotations

import json
import logging
from typing import Iterable

from django.conf import settings
from django.utils import timezone

from core.models import NotificationPreference, WebPushSubscription

logger = logging.getLogger(__name__)


def web_push_configured() -> bool:
    return bool(
        getattr(settings, 'WEB_PUSH_ENABLED', False)
        and getattr(settings, 'WEB_PUSH_VAPID_PUBLIC_KEY', '')
        and getattr(settings, 'WEB_PUSH_VAPID_PRIVATE_KEY', '')
        and getattr(settings, 'WEB_PUSH_SUBJECT', '')
    )


def build_push_payload(
    *,
    event_type: str,
    title: str,
    body: str,
    url: str,
    tag: str | None = None,
    timestamp: str | None = None,
) -> dict:
    return {
        'type': event_type,
        'title': title,
        'body': body,
        'url': url,
        'tag': tag or event_type,
        'timestamp': timestamp or timezone.now().isoformat(),
    }


def _deactivate_status_code(status_code: int | None) -> bool:
    return status_code in (401, 403, 404, 410)


def send_payload_to_subscription(subscription: WebPushSubscription, payload: dict) -> bool:
    if not web_push_configured():
        return False

    try:
        from pywebpush import WebPushException, webpush  # type: ignore
    except Exception:
        logger.warning('web_push_library_missing')
        return False

    try:
        webpush(
            subscription_info={
                'endpoint': subscription.endpoint,
                'keys': {
                    'p256dh': subscription.p256dh,
                    'auth': subscription.auth,
                },
            },
            data=json.dumps(payload),
            vapid_private_key=getattr(settings, 'WEB_PUSH_VAPID_PRIVATE_KEY', ''),
            vapid_claims={'sub': getattr(settings, 'WEB_PUSH_SUBJECT', '')},
        )
        subscription.is_active = True
        subscription.last_success_at = timezone.now()
        subscription.last_error = ''
        subscription.save(update_fields=['is_active', 'last_success_at', 'last_error', 'last_seen_at', 'updated_at'])
        return True
    except WebPushException as exc:
        status_code = None
        try:
            status_code = getattr(exc.response, 'status_code', None)
        except Exception:
            status_code = None
        subscription.last_error = str(exc)[:1000]
        if _deactivate_status_code(status_code):
            subscription.is_active = False
            subscription.save(update_fields=['is_active', 'last_error', 'last_seen_at', 'updated_at'])
        else:
            subscription.save(update_fields=['last_error', 'last_seen_at', 'updated_at'])
        logger.warning('web_push_failed status=%s subscription_id=%s', status_code, subscription.id)
        return False
    except Exception as exc:
        subscription.last_error = str(exc)[:1000]
        subscription.save(update_fields=['last_error', 'last_seen_at', 'updated_at'])
        logger.warning('web_push_failed_generic subscription_id=%s', subscription.id)
        return False


def _eligible_user_ids(user_ids: Iterable[int], preference_field: str | None = None) -> list[int]:
    normalized = sorted({int(uid) for uid in user_ids if uid is not None})
    if not normalized:
        return []

    filters: dict[str, object] = {
        'user_id__in': normalized,
        'web_push_enabled': True,
    }
    if preference_field:
        filters[preference_field] = True

    return list(
        NotificationPreference.objects.filter(**filters).values_list('user_id', flat=True)
    )


def send_push_to_users(user_ids: Iterable[int], payload: dict, *, preference_field: str | None = None) -> int:
    if not web_push_configured():
        return 0

    eligible_user_ids = _eligible_user_ids(user_ids, preference_field=preference_field)
    if not eligible_user_ids:
        return 0

    subscriptions = WebPushSubscription.objects.filter(user_id__in=eligible_user_ids, is_active=True)
    sent = 0
    for subscription in subscriptions.iterator():
        if send_payload_to_subscription(subscription, payload):
            sent += 1
    return sent


def queue_push_to_users(user_ids: Iterable[int], payload: dict, *, preference_field: str | None = None) -> None:
    normalized = sorted({int(uid) for uid in user_ids if uid is not None})
    if not normalized:
        return

    try:
        from core.tasks import send_push_to_users_task

        send_push_to_users_task.delay(normalized, payload, preference_field)
    except Exception:
        # Fallback for local/dev/test flows where Celery broker may be unavailable.
        send_push_to_users(normalized, payload, preference_field=preference_field)
