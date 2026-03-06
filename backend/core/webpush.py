from __future__ import annotations

import base64
import json
import logging
from collections import defaultdict
from datetime import timedelta
from typing import Iterable
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.cache import cache
from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone

from core.models import (
    NotificationPreference,
    WebPushDeferredNotification,
    WebPushGlobalSettings,
    WebPushProjectMute,
    WebPushSubscription,
    WebPushVapidKeys,
)

logger = logging.getLogger(__name__)

DEFAULT_PUSH_RATE_LIMIT_PER_HOUR = 3
DEFAULT_MORNING_DIGEST_HOUR = 8
DEFAULT_EVENING_DIGEST_HOUR = 18


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')


def generate_vapid_keypair() -> tuple[str, str]:
    """Generate RFC8292-compatible VAPID key material."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    private_key = ec.generate_private_key(ec.SECP256R1())
    private_raw = private_key.private_numbers().private_value.to_bytes(32, 'big')
    public_raw = private_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return _b64url_encode(public_raw), _b64url_encode(private_raw)


def _mask_key(value: str | None) -> str | None:
    raw = str(value or '').strip()
    if not raw:
        return None
    if len(raw) <= 10:
        return '*' * len(raw)
    return f"{raw[:6]}...{raw[-4:]}"


def get_web_push_vapid_credentials() -> dict:
    """Return active VAPID credentials from DB first, env fallback second."""
    try:
        obj = WebPushVapidKeys.get_active()
        public_key = obj.get_public_key().strip()
        private_key = obj.get_private_key().strip()
        subject = str(obj.subject or '').strip()
        if public_key and private_key and subject:
            return {
                'publicKey': public_key,
                'privateKey': private_key,
                'subject': subject,
                'source': 'database',
                'updatedAt': getattr(obj, 'updated_at', None),
            }
    except (ProgrammingError, OperationalError):
        pass
    except Exception:
        pass

    env_public = str(getattr(settings, 'WEB_PUSH_VAPID_PUBLIC_KEY', '') or '').strip()
    env_private = str(getattr(settings, 'WEB_PUSH_VAPID_PRIVATE_KEY', '') or '').strip()
    env_subject = str(getattr(settings, 'WEB_PUSH_SUBJECT', '') or '').strip()
    if env_public and env_private and env_subject:
        return {
            'publicKey': env_public,
            'privateKey': env_private,
            'subject': env_subject,
            'source': 'environment',
            'updatedAt': None,
        }

    return {
        'publicKey': '',
        'privateKey': '',
        'subject': '',
        'source': 'none',
        'updatedAt': None,
    }


def web_push_vapid_status() -> dict:
    creds = get_web_push_vapid_credentials()
    configured = bool(creds.get('publicKey') and creds.get('privateKey') and creds.get('subject'))
    return {
        'configured': configured,
        'source': creds.get('source') or 'none',
        'subject': creds.get('subject') or None,
        'publicKeyMasked': _mask_key(creds.get('publicKey')),
        'privateKeyMasked': _mask_key(creds.get('privateKey')),
        'updatedAt': creds.get('updatedAt'),
    }


def web_push_public_key() -> str | None:
    return (get_web_push_vapid_credentials().get('publicKey') or None)


def web_push_keys_configured() -> bool:
    creds = get_web_push_vapid_credentials()
    return bool(creds.get('publicKey') and creds.get('privateKey') and creds.get('subject'))


def web_push_globally_enabled() -> bool:
    try:
        return bool(WebPushGlobalSettings.get_active().enabled)
    except (ProgrammingError, OperationalError):
        return bool(getattr(settings, 'WEB_PUSH_ENABLED', True))
    except Exception:
        return bool(getattr(settings, 'WEB_PUSH_ENABLED', True))


def web_push_rate_limit_per_hour() -> int:
    try:
        cfg = WebPushGlobalSettings.get_active()
        value = int(getattr(cfg, 'push_rate_limit_per_hour', DEFAULT_PUSH_RATE_LIMIT_PER_HOUR) or DEFAULT_PUSH_RATE_LIMIT_PER_HOUR)
    except (ProgrammingError, OperationalError):
        value = int(getattr(settings, 'WEB_PUSH_RATE_LIMIT_PER_HOUR', DEFAULT_PUSH_RATE_LIMIT_PER_HOUR) or DEFAULT_PUSH_RATE_LIMIT_PER_HOUR)
    except Exception:
        value = int(getattr(settings, 'WEB_PUSH_RATE_LIMIT_PER_HOUR', DEFAULT_PUSH_RATE_LIMIT_PER_HOUR) or DEFAULT_PUSH_RATE_LIMIT_PER_HOUR)
    return max(1, min(50, value))


def web_push_feature_toggles() -> dict[str, bool]:
    defaults = {
        'push_rate_limit_enabled': bool(getattr(settings, 'WEB_PUSH_RATE_LIMIT_ENABLED', True)),
        'push_weekend_mute_enabled': bool(getattr(settings, 'WEB_PUSH_WEEKEND_MUTE_ENABLED', True)),
        'push_quiet_hours_enabled': bool(getattr(settings, 'WEB_PUSH_QUIET_HOURS_ENABLED', True)),
        'push_snooze_enabled': bool(getattr(settings, 'WEB_PUSH_SNOOZE_ENABLED', True)),
        'push_digest_window_enabled': bool(getattr(settings, 'WEB_PUSH_DIGEST_WINDOW_ENABLED', True)),
        'push_actions_enabled': bool(getattr(settings, 'WEB_PUSH_ACTIONS_ENABLED', True)),
        'push_deep_links_enabled': bool(getattr(settings, 'WEB_PUSH_DEEP_LINKS_ENABLED', True)),
        'push_subscription_healthcheck_enabled': bool(getattr(settings, 'WEB_PUSH_SUBSCRIPTION_HEALTHCHECK_ENABLED', True)),
    }
    try:
        cfg = WebPushGlobalSettings.get_active()
        defaults = {
            'push_rate_limit_enabled': bool(getattr(cfg, 'push_rate_limit_enabled', True)),
            'push_weekend_mute_enabled': bool(getattr(cfg, 'push_weekend_mute_enabled', True)),
            'push_quiet_hours_enabled': bool(getattr(cfg, 'push_quiet_hours_enabled', True)),
            'push_snooze_enabled': bool(getattr(cfg, 'push_snooze_enabled', True)),
            'push_digest_window_enabled': bool(getattr(cfg, 'push_digest_window_enabled', True)),
            'push_actions_enabled': bool(getattr(cfg, 'push_actions_enabled', True)),
            'push_deep_links_enabled': bool(getattr(cfg, 'push_deep_links_enabled', True)),
            'push_subscription_healthcheck_enabled': bool(getattr(cfg, 'push_subscription_healthcheck_enabled', True)),
        }
    except (ProgrammingError, OperationalError):
        pass
    except Exception:
        pass
    return defaults


def web_push_feature_enabled(feature_field: str | None) -> bool:
    if not feature_field:
        return True
    toggles = web_push_feature_toggles()
    return bool(toggles.get(feature_field, True))


def web_push_event_toggles() -> dict[str, bool]:
    deliverable_options = web_push_deliverable_date_change_options()
    defaults = {
        'push_pre_deliverable_reminders': bool(getattr(settings, 'WEB_PUSH_REMINDER_EVENTS_ENABLED', True)),
        'push_daily_digest': bool(getattr(settings, 'WEB_PUSH_REMINDER_EVENTS_ENABLED', True)),
        'push_assignment_changes': bool(getattr(settings, 'WEB_PUSH_ASSIGNMENT_EVENTS_ENABLED', True)),
        'push_deliverable_date_changes': bool(deliverable_options.get('enabled', True)),
    }
    try:
        cfg = WebPushGlobalSettings.get_active()
        defaults = {
            'push_pre_deliverable_reminders': bool(cfg.push_pre_deliverable_reminders_enabled),
            'push_daily_digest': bool(cfg.push_daily_digest_enabled),
            'push_assignment_changes': bool(cfg.push_assignment_changes_enabled),
            'push_deliverable_date_changes': bool(cfg.push_deliverable_date_changes_enabled),
        }
    except (ProgrammingError, OperationalError):
        pass
    except Exception:
        pass

    # Env switches remain hard kill-switches.
    if not bool(getattr(settings, 'WEB_PUSH_REMINDER_EVENTS_ENABLED', True)):
        defaults['push_pre_deliverable_reminders'] = False
        defaults['push_daily_digest'] = False
    if not bool(getattr(settings, 'WEB_PUSH_ASSIGNMENT_EVENTS_ENABLED', True)):
        defaults['push_assignment_changes'] = False
    if not bool(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_EVENTS_ENABLED', True)):
        defaults['push_deliverable_date_changes'] = False
    return defaults


def web_push_event_enabled(preference_field: str | None) -> bool:
    if not preference_field:
        return True
    toggles = web_push_event_toggles()
    return bool(toggles.get(preference_field, True))


def web_push_event_capabilities() -> dict[str, bool]:
    toggles = web_push_event_toggles()
    return {
        'preDeliverableReminders': bool(toggles.get('push_pre_deliverable_reminders', True)),
        'dailyDigest': bool(toggles.get('push_daily_digest', True)),
        'assignmentChanges': bool(toggles.get('push_assignment_changes', True)),
        'deliverableDateChanges': bool(toggles.get('push_deliverable_date_changes', True)),
    }


def web_push_feature_capabilities() -> dict[str, bool]:
    toggles = web_push_feature_toggles()
    return {
        'rateLimit': bool(toggles.get('push_rate_limit_enabled', True)),
        'weekendMute': bool(toggles.get('push_weekend_mute_enabled', True)),
        'quietHours': bool(toggles.get('push_quiet_hours_enabled', True)),
        'snooze': bool(toggles.get('push_snooze_enabled', True)),
        'digestWindow': bool(toggles.get('push_digest_window_enabled', True)),
        'actions': bool(toggles.get('push_actions_enabled', True)),
        'deepLinks': bool(toggles.get('push_deep_links_enabled', True)),
        'subscriptionHealthcheck': bool(toggles.get('push_subscription_healthcheck_enabled', True)),
    }


def web_push_deliverable_date_change_options() -> dict[str, object]:
    scope_default = getattr(
        WebPushGlobalSettings,
        'DELIVERABLE_SCOPE_NEXT_UPCOMING',
        'next_upcoming',
    )
    valid_scopes = {
        getattr(WebPushGlobalSettings, 'DELIVERABLE_SCOPE_NEXT_UPCOMING', 'next_upcoming'),
        getattr(WebPushGlobalSettings, 'DELIVERABLE_SCOPE_ALL_UPCOMING', 'all_upcoming'),
    }
    options = {
        'enabled': bool(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_EVENTS_ENABLED', True)),
        'scope': str(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_SCOPE', scope_default) or scope_default),
        'withinTwoWeeksOnly': bool(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_WITHIN_TWO_WEEKS_ONLY', False)),
    }
    try:
        cfg = WebPushGlobalSettings.get_active()
        options = {
            'enabled': bool(cfg.push_deliverable_date_changes_enabled),
            'scope': str(cfg.push_deliverable_date_change_scope or scope_default),
            'withinTwoWeeksOnly': bool(cfg.push_deliverable_date_change_within_two_weeks_only),
        }
    except (ProgrammingError, OperationalError):
        pass
    except Exception:
        pass

    if str(options.get('scope') or '') not in valid_scopes:
        options['scope'] = scope_default
    if not bool(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_EVENTS_ENABLED', True)):
        options['enabled'] = False
    return options


def web_push_configured() -> bool:
    return bool(web_push_globally_enabled() and web_push_keys_configured())


def build_push_payload(
    *,
    event_type: str,
    title: str,
    body: str,
    url: str,
    tag: str | None = None,
    timestamp: str | None = None,
    priority: str | None = 'normal',
    project_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actions: list[dict[str, str]] | None = None,
) -> dict:
    payload = {
        'type': event_type,
        'title': title,
        'body': body,
        'url': url,
        'tag': tag or event_type,
        'timestamp': timestamp or timezone.now().isoformat(),
        'priority': str(priority or 'normal'),
        'projectId': int(project_id) if project_id is not None else None,
        'entityType': entity_type or None,
        'entityId': int(entity_id) if entity_id is not None else None,
        'actions': actions or [],
    }
    if payload['projectId'] is None:
        payload.pop('projectId', None)
    if payload['entityType'] is None:
        payload.pop('entityType', None)
    if payload['entityId'] is None:
        payload.pop('entityId', None)
    return payload


def _deactivate_status_code(status_code: int | None) -> bool:
    return status_code in (401, 403, 404, 410)


def send_payload_to_subscription(subscription: WebPushSubscription, payload: dict) -> bool:
    creds = get_web_push_vapid_credentials()
    if not web_push_globally_enabled():
        return False
    if not (creds.get('privateKey') and creds.get('subject')):
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
            vapid_private_key=str(creds.get('privateKey') or ''),
            vapid_claims={'sub': str(creds.get('subject') or '')},
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


def _payload_project_id(payload: dict) -> int | None:
    raw = payload.get('projectId')
    if raw is None:
        return None
    try:
        return int(raw)
    except Exception:
        return None


def _payload_priority(payload: dict) -> str:
    return str(payload.get('priority') or 'normal').strip().lower() or 'normal'


def _is_non_urgent_payload(payload: dict) -> bool:
    return _payload_priority(payload) != 'critical'


def _resolve_timezone(pref: NotificationPreference):
    tz_name = str(getattr(pref, 'push_timezone', '') or '').strip()
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    try:
        return timezone.get_current_timezone()
    except Exception:
        return ZoneInfo('UTC')


def _in_quiet_hours(local_now, pref: NotificationPreference) -> bool:
    if not bool(getattr(pref, 'push_quiet_hours_enabled', False)):
        return False
    start = int(getattr(pref, 'push_quiet_hours_start', 22) or 22) % 24
    end = int(getattr(pref, 'push_quiet_hours_end', 7) or 7) % 24
    hour = int(local_now.hour)
    if start == end:
        return True
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end


def _next_quiet_hours_end(local_now, pref: NotificationPreference):
    end = int(getattr(pref, 'push_quiet_hours_end', 7) or 7) % 24
    candidate = local_now.replace(hour=end, minute=0, second=0, microsecond=0)
    if _in_quiet_hours(local_now, pref):
        start = int(getattr(pref, 'push_quiet_hours_start', 22) or 22) % 24
        if start > end and local_now.hour >= start:
            candidate = candidate + timedelta(days=1)
        elif candidate <= local_now:
            candidate = candidate + timedelta(days=1)
    elif candidate <= local_now:
        candidate = candidate + timedelta(days=1)
    return candidate


def _next_digest_window(local_now, pref: NotificationPreference):
    digest_window = str(getattr(pref, 'push_digest_window', NotificationPreference.PUSH_DIGEST_WINDOW_INSTANT) or NotificationPreference.PUSH_DIGEST_WINDOW_INSTANT)
    if digest_window == NotificationPreference.PUSH_DIGEST_WINDOW_MORNING:
        hour = int(getattr(settings, 'WEB_PUSH_MORNING_DIGEST_HOUR', DEFAULT_MORNING_DIGEST_HOUR) or DEFAULT_MORNING_DIGEST_HOUR)
    elif digest_window == NotificationPreference.PUSH_DIGEST_WINDOW_EVENING:
        hour = int(getattr(settings, 'WEB_PUSH_EVENING_DIGEST_HOUR', DEFAULT_EVENING_DIGEST_HOUR) or DEFAULT_EVENING_DIGEST_HOUR)
    else:
        return local_now
    hour = max(0, min(23, hour))
    candidate = local_now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if candidate <= local_now:
        candidate = candidate + timedelta(days=1)
    return candidate


def _next_weekday_resume(local_now):
    weekday = int(local_now.weekday())
    if weekday < 5:
        return local_now
    days_until_monday = 7 - weekday
    hour = int(getattr(settings, 'WEB_PUSH_MORNING_DIGEST_HOUR', DEFAULT_MORNING_DIGEST_HOUR) or DEFAULT_MORNING_DIGEST_HOUR)
    hour = max(0, min(23, hour))
    return (local_now + timedelta(days=days_until_monday)).replace(
        hour=hour,
        minute=0,
        second=0,
        microsecond=0,
    )


def _rate_limit_cache_key(user_id: int, now_ts) -> str:
    bucket = now_ts.replace(minute=0, second=0, microsecond=0)
    return f"push:rate:{user_id}:{bucket.strftime('%Y%m%d%H')}"


def _rate_limit_count(user_id: int, now_ts) -> int:
    key = _rate_limit_cache_key(user_id, now_ts)
    try:
        return int(cache.get(key, 0) or 0)
    except Exception:
        return 0


def _rate_limit_increment(user_id: int, now_ts) -> None:
    key = _rate_limit_cache_key(user_id, now_ts)
    next_hour = now_ts.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    timeout = max(60, int((next_hour - now_ts).total_seconds()) + 60)
    try:
        cache.add(key, 0, timeout=timeout)
        cache.incr(key)
    except Exception:
        try:
            current = int(cache.get(key, 0) or 0) + 1
            cache.set(key, current, timeout=timeout)
        except Exception:
            pass


def _next_hour_boundary(now_ts):
    return now_ts.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)


def _default_push_actions(payload: dict) -> list[dict[str, str]]:
    actions = [
        {'action': 'open', 'title': 'Open'},
        {'action': 'acknowledge', 'title': 'Acknowledge'},
    ]
    if _payload_project_id(payload) is not None:
        actions.append({'action': 'mute_project_24h', 'title': 'Mute Project 24h'})
    return actions


def _normalize_payload(payload: dict) -> dict:
    normalized = dict(payload or {})
    normalized.setdefault('type', 'generic')
    normalized.setdefault('title', 'Workload Tracker')
    normalized.setdefault('body', 'You have new updates.')
    normalized.setdefault('url', '/my-work')
    normalized.setdefault('tag', str(normalized.get('type') or 'generic'))
    normalized.setdefault('timestamp', timezone.now().isoformat())
    normalized['priority'] = _payload_priority(normalized)
    if not isinstance(normalized.get('actions'), list) or not normalized.get('actions'):
        normalized['actions'] = _default_push_actions(normalized)
    return normalized


def _apply_payload_preferences(
    payload: dict,
    pref: NotificationPreference,
    feature_toggles: dict[str, bool],
) -> dict:
    normalized = dict(payload or {})
    actions_enabled = bool(feature_toggles.get('push_actions_enabled', True)) and bool(
        getattr(pref, 'push_actions_enabled', True)
    )
    deep_links_enabled = bool(feature_toggles.get('push_deep_links_enabled', True)) and bool(
        getattr(pref, 'push_deep_links_enabled', True)
    )

    if not actions_enabled:
        normalized['actions'] = []
    if not deep_links_enabled:
        normalized['url'] = '/my-work'
    return normalized


def _is_project_muted(user_id: int, project_id: int | None, now_ts) -> bool:
    if project_id is None:
        return False
    return WebPushProjectMute.objects.filter(
        user_id=user_id,
        project_id=project_id,
        muted_until__gt=now_ts,
    ).exists()


def _defer_payload_for_user(
    *,
    user_id: int,
    payload: dict,
    reason: str,
    deliver_after,
) -> None:
    event_type = str(payload.get('type') or '')
    project_id = _payload_project_id(payload)
    WebPushDeferredNotification.objects.create(
        user_id=user_id,
        event_type=event_type,
        project_id=project_id,
        reason=reason,
        payload=payload,
        deliver_after=deliver_after or (timezone.now() + timedelta(minutes=15)),
    )


def _delivery_decision(
    *,
    user_id: int,
    pref: NotificationPreference,
    payload: dict,
    now_ts,
    rate_limit_per_hour: int,
    feature_toggles: dict[str, bool],
    ignore_digest_window: bool = False,
) -> tuple[str, str | None, object | None]:
    project_id = _payload_project_id(payload)
    if _is_project_muted(user_id, project_id, now_ts):
        return 'drop', None, None

    snooze_until = getattr(pref, 'push_snooze_until', None)
    if (
        bool(feature_toggles.get('push_snooze_enabled', True))
        and bool(getattr(pref, 'push_snooze_enabled', True))
        and snooze_until
        and now_ts < snooze_until
    ):
        return 'defer', WebPushDeferredNotification.REASON_SNOOZE, snooze_until

    tzinfo = _resolve_timezone(pref)
    local_now = now_ts.astimezone(tzinfo)
    non_urgent = _is_non_urgent_payload(payload)
    digest_window_enabled = bool(feature_toggles.get('push_digest_window_enabled', True)) and bool(
        getattr(pref, 'push_digest_window_enabled', True)
    )
    quiet_hours_enabled = bool(feature_toggles.get('push_quiet_hours_enabled', True)) and bool(
        getattr(pref, 'push_quiet_hours_enabled', False)
    )
    weekend_mute_enabled = bool(feature_toggles.get('push_weekend_mute_enabled', True)) and bool(
        getattr(pref, 'push_weekend_mute', False)
    )
    rate_limit_enabled = bool(feature_toggles.get('push_rate_limit_enabled', True)) and bool(
        getattr(pref, 'push_rate_limit_enabled', True)
    )

    if weekend_mute_enabled and int(local_now.weekday()) >= 5:
        deliver_after = _next_weekday_resume(local_now)
        if (
            digest_window_enabled
            and non_urgent
            and not ignore_digest_window
            and str(getattr(pref, 'push_digest_window', 'instant')) != NotificationPreference.PUSH_DIGEST_WINDOW_INSTANT
        ):
            deliver_after = max(deliver_after, _next_digest_window(local_now, pref))
        return 'defer', WebPushDeferredNotification.REASON_WEEKEND, deliver_after

    if quiet_hours_enabled and _in_quiet_hours(local_now, pref):
        deliver_after = _next_quiet_hours_end(local_now, pref)
        if (
            digest_window_enabled
            and non_urgent
            and not ignore_digest_window
            and str(getattr(pref, 'push_digest_window', 'instant')) != NotificationPreference.PUSH_DIGEST_WINDOW_INSTANT
        ):
            deliver_after = max(deliver_after, _next_digest_window(local_now, pref))
        return 'defer', WebPushDeferredNotification.REASON_QUIET_HOURS, deliver_after

    if digest_window_enabled and non_urgent and not ignore_digest_window:
        digest_window = str(getattr(pref, 'push_digest_window', NotificationPreference.PUSH_DIGEST_WINDOW_INSTANT) or NotificationPreference.PUSH_DIGEST_WINDOW_INSTANT)
        if digest_window in {
            NotificationPreference.PUSH_DIGEST_WINDOW_MORNING,
            NotificationPreference.PUSH_DIGEST_WINDOW_EVENING,
        }:
            return 'defer', WebPushDeferredNotification.REASON_DIGEST_WINDOW, _next_digest_window(local_now, pref)

    if rate_limit_enabled and _rate_limit_count(user_id, now_ts) >= max(1, int(rate_limit_per_hour or DEFAULT_PUSH_RATE_LIMIT_PER_HOUR)):
        return 'defer', WebPushDeferredNotification.REASON_RATE_LIMIT, _next_hour_boundary(now_ts)

    return 'send', None, None


def _send_payload_to_user(user_id: int, payload: dict, now_ts) -> int:
    subscriptions = WebPushSubscription.objects.filter(user_id=user_id, is_active=True)
    sent = 0
    for subscription in subscriptions.iterator():
        if send_payload_to_subscription(subscription, payload):
            sent += 1
    if sent > 0:
        _rate_limit_increment(user_id, now_ts)
    return sent


def _bundle_payload_for_rows(rows: list[WebPushDeferredNotification]) -> dict:
    latest = rows[-1]
    latest_payload = dict(latest.payload or {})
    type_counts: dict[str, int] = defaultdict(int)
    for row in rows:
        type_counts[str(row.event_type or 'update')] += 1

    detail = ', '.join(
        f"{event_type}: {count}"
        for event_type, count in sorted(type_counts.items(), key=lambda item: (-item[1], item[0]))[:3]
    )
    if not detail:
        detail = 'updates available'

    target_url = str(latest_payload.get('url') or '/my-work')
    project_ids = sorted({int(r.project_id) for r in rows if r.project_id is not None})
    project_id = project_ids[0] if len(project_ids) == 1 else None

    return build_push_payload(
        event_type='push.bundle',
        title='Workload Tracker Updates',
        body=f"{len(rows)} new update(s): {detail}",
        url=target_url,
        tag=f"push.bundle.{latest.user_id}",
        priority='normal',
        project_id=project_id,
    )


def flush_due_deferred_push_notifications(*, max_rows: int = 1000) -> dict[str, int]:
    now_ts = timezone.now()
    rows = list(
        WebPushDeferredNotification.objects
        .filter(deliver_after__lte=now_ts)
        .order_by('user_id', 'created_at')[: max(1, int(max_rows))]
    )
    if not rows:
        return {'processedRows': 0, 'sent': 0, 'deferred': 0, 'dropped': 0}

    grouped: dict[int, list[WebPushDeferredNotification]] = defaultdict(list)
    for row in rows:
        grouped[int(row.user_id)].append(row)

    pref_map = NotificationPreference.objects.filter(
        user_id__in=list(grouped.keys()),
    ).in_bulk(field_name='user_id')
    rate_limit = web_push_rate_limit_per_hour()
    feature_toggles = web_push_feature_toggles()

    sent = 0
    deferred = 0
    dropped = 0
    for user_id, user_rows in grouped.items():
        row_ids = [int(row.id) for row in user_rows]
        pref = pref_map.get(user_id)
        if pref is None or not bool(getattr(pref, 'web_push_enabled', False)):
            WebPushDeferredNotification.objects.filter(id__in=row_ids).delete()
            dropped += len(row_ids)
            continue

        bundle_payload = _apply_payload_preferences(
            _normalize_payload(_bundle_payload_for_rows(user_rows)),
            pref,
            feature_toggles,
        )
        decision, reason, deliver_after = _delivery_decision(
            user_id=user_id,
            pref=pref,
            payload=bundle_payload,
            now_ts=now_ts,
            rate_limit_per_hour=rate_limit,
            feature_toggles=feature_toggles,
            ignore_digest_window=True,
        )
        if decision == 'drop':
            WebPushDeferredNotification.objects.filter(id__in=row_ids).delete()
            dropped += len(row_ids)
            continue
        if decision == 'defer':
            WebPushDeferredNotification.objects.filter(id__in=row_ids).update(
                deliver_after=deliver_after or (now_ts + timedelta(minutes=30)),
                updated_at=now_ts,
                reason=reason or WebPushDeferredNotification.REASON_RATE_LIMIT,
            )
            deferred += len(row_ids)
            continue

        has_active_subscriptions = WebPushSubscription.objects.filter(user_id=user_id, is_active=True).exists()
        if not has_active_subscriptions:
            WebPushDeferredNotification.objects.filter(id__in=row_ids).delete()
            dropped += len(row_ids)
            continue

        sent_count = _send_payload_to_user(user_id, bundle_payload, now_ts)
        if sent_count > 0:
            WebPushDeferredNotification.objects.filter(id__in=row_ids).delete()
            sent += sent_count
        else:
            WebPushDeferredNotification.objects.filter(id__in=row_ids).update(
                deliver_after=now_ts + timedelta(minutes=30),
                updated_at=now_ts,
            )
            deferred += len(row_ids)

    return {
        'processedRows': len(rows),
        'sent': sent,
        'deferred': deferred,
        'dropped': dropped,
    }


def run_web_push_subscription_health_check() -> dict[str, int]:
    if not web_push_feature_enabled('push_subscription_healthcheck_enabled'):
        return {
            'deactivated': 0,
            'deleted': 0,
            'expiredMutesDeleted': 0,
        }

    now_ts = timezone.now()
    stale_days = max(1, int(getattr(settings, 'WEB_PUSH_SUBSCRIPTION_STALE_DAYS', 45) or 45))
    delete_days = max(stale_days, int(getattr(settings, 'WEB_PUSH_SUBSCRIPTION_DELETE_INACTIVE_DAYS', 90) or 90))
    stale_cutoff = now_ts - timedelta(days=stale_days)
    delete_cutoff = now_ts - timedelta(days=delete_days)

    disabled_cleanup_user_ids = NotificationPreference.objects.filter(
        push_subscription_cleanup_enabled=False,
    ).values_list('user_id', flat=True)

    subscriptions_qs = WebPushSubscription.objects.exclude(user_id__in=disabled_cleanup_user_ids)

    deactivated = subscriptions_qs.filter(
        is_active=True,
        last_seen_at__lt=stale_cutoff,
    ).update(
        is_active=False,
        last_error='stale_subscription',
        updated_at=now_ts,
    )
    deleted, _ = subscriptions_qs.filter(
        is_active=False,
        updated_at__lt=delete_cutoff,
    ).delete()
    muted_deleted, _ = WebPushProjectMute.objects.filter(muted_until__lte=now_ts).delete()

    return {
        'deactivated': int(deactivated or 0),
        'deleted': int(deleted or 0),
        'expiredMutesDeleted': int(muted_deleted or 0),
    }


def send_push_to_users(user_ids: Iterable[int], payload: dict, *, preference_field: str | None = None) -> int:
    if not web_push_configured():
        return 0
    if not web_push_event_enabled(preference_field):
        return 0

    eligible_user_ids = _eligible_user_ids(user_ids, preference_field=preference_field)
    if not eligible_user_ids:
        return 0

    now_ts = timezone.now()
    normalized_payload = _normalize_payload(payload)
    pref_map = NotificationPreference.objects.filter(
        user_id__in=eligible_user_ids,
    ).in_bulk(field_name='user_id')
    rate_limit = web_push_rate_limit_per_hour()
    feature_toggles = web_push_feature_toggles()

    sent = 0
    for user_id in eligible_user_ids:
        pref = pref_map.get(int(user_id))
        if pref is None:
            continue
        user_payload = _apply_payload_preferences(normalized_payload, pref, feature_toggles)
        decision, reason, deliver_after = _delivery_decision(
            user_id=int(user_id),
            pref=pref,
            payload=user_payload,
            now_ts=now_ts,
            rate_limit_per_hour=rate_limit,
            feature_toggles=feature_toggles,
        )
        if decision == 'drop':
            continue
        if decision == 'defer':
            _defer_payload_for_user(
                user_id=int(user_id),
                payload=user_payload,
                reason=reason or WebPushDeferredNotification.REASON_RATE_LIMIT,
                deliver_after=deliver_after,
            )
            continue
        sent += _send_payload_to_user(int(user_id), user_payload, now_ts)
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
