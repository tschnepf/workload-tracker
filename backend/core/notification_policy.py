from __future__ import annotations

from django.conf import settings
from django.core.cache import cache
from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone

from core.models import NotificationProjectMute, WebPushGlobalSettings


CHANNEL_MOBILE_PUSH = 'mobilePush'
CHANNEL_EMAIL = 'email'
CHANNEL_IN_BROWSER = 'inBrowser'


def notifications_v2_enabled() -> bool:
    return bool(getattr(settings, 'NOTIFICATIONS_V2_ENABLED', True))


def notifications_template_rendering_enabled() -> bool:
    return bool(getattr(settings, 'NOTIFICATIONS_TEMPLATE_RENDERING_ENABLED', True))


def active_web_suppression_enabled() -> bool:
    if not notifications_v2_enabled():
        return False
    env_enabled = bool(getattr(settings, 'NOTIFICATIONS_ACTIVE_SUPPRESSION_ENABLED', True))
    if not env_enabled:
        return False
    try:
        cfg = WebPushGlobalSettings.get_active()
        return bool(getattr(cfg, 'active_web_suppression_enabled', True))
    except (ProgrammingError, OperationalError):
        return env_enabled
    except Exception:
        return env_enabled


def active_web_window_seconds() -> int:
    fallback = int(getattr(settings, 'NOTIFICATIONS_ACTIVE_WEB_WINDOW_SECONDS', 120) or 120)
    fallback = max(30, min(3600, fallback))
    try:
        cfg = WebPushGlobalSettings.get_active()
        value = int(getattr(cfg, 'active_web_window_seconds', fallback) or fallback)
    except (ProgrammingError, OperationalError):
        value = fallback
    except Exception:
        value = fallback
    return max(30, min(3600, value))


def _active_cache_key(user_id: int) -> str:
    return f"notif:active:{int(user_id)}"


def mark_user_active(user_id: int) -> None:
    timeout = active_web_window_seconds()
    if timeout <= 0:
        return
    try:
        cache.set(_active_cache_key(int(user_id)), int(timezone.now().timestamp()), timeout=timeout)
    except Exception:
        pass


def is_user_active_in_web(user_id: int) -> bool:
    if not active_web_suppression_enabled():
        return False
    try:
        return cache.get(_active_cache_key(int(user_id))) is not None
    except Exception:
        return False


def is_project_channel_muted(user_id: int, project_id: int | None, channel: str, *, now_ts=None) -> bool:
    if not notifications_v2_enabled():
        return False
    if project_id is None:
        return False
    now_val = now_ts or timezone.now()
    qs = NotificationProjectMute.objects.filter(
        user_id=int(user_id),
        project_id=int(project_id),
    )
    if channel == CHANNEL_MOBILE_PUSH:
        qs = qs.filter(mobile_push_muted_until__gt=now_val)
    elif channel == CHANNEL_EMAIL:
        qs = qs.filter(email_muted_until__gt=now_val)
    elif channel == CHANNEL_IN_BROWSER:
        qs = qs.filter(in_browser_muted_until__gt=now_val)
    else:
        return False
    return qs.exists()


def should_suppress_channel_for_active_user(
    *,
    user_id: int,
    channel: str,
    priority: str | None,
) -> tuple[bool, str]:
    if not notifications_v2_enabled():
        return False, ''
    priority_normalized = str(priority or 'normal').strip().lower()
    if priority_normalized == 'critical':
        return False, ''
    if channel == CHANNEL_IN_BROWSER:
        return False, ''
    if not is_user_active_in_web(user_id):
        return False, ''
    return True, 'active_web_prefers_in_browser'
