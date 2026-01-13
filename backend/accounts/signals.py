import logging
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import mail_admins
from django.db import IntegrityError, transaction
from django.db.models.signals import post_save
from .models import UserProfile

logger = logging.getLogger(__name__)

try:  # Optional import; only available when django-axes is installed/enabled
    from axes.signals import user_locked_out
except Exception:  # pragma: no cover - defensive import
    user_locked_out = None


def create_user_profile(sender, instance, created, **kwargs):
    """Ensure a UserProfile exists for a newly created User.

    - Idempotent: safe to call multiple times; only one profile is created.
    - Race-safe: handles concurrent creation attempts with a conservative retry.
    - Respects feature flag ENABLE_PROFILE_AUTO_CREATE (defaults to True).
    """
    if not getattr(settings, 'ENABLE_PROFILE_AUTO_CREATE', True):
        return
    if not created:
        # Avoid re-entrant creation for updates or manual invocations
        return

    try:
        with transaction.atomic():
            UserProfile.objects.get_or_create(user=instance)
    except IntegrityError:
        # Another worker/process may have created it between the check and create
        try:
            UserProfile.objects.get(user=instance)
        except UserProfile.DoesNotExist:
            # One conservative retry under atomic transaction
            with transaction.atomic():
                UserProfile.objects.get_or_create(user=instance)


def _handle_user_locked_out(sender=None, request=None, username=None, **kwargs):
    """Basic alerting/logging on account lockout events.

    - Always logs a warning with username and IP if available.
    - Optionally emails ADMINS when settings.AXES_ALERT_ADMINS=True and ADMINS is set.
    """
    ip = None
    try:
        # axes passes ip_address in kwargs; fallback to request META
        ip = kwargs.get('ip_address')
        if not ip and request is not None:
            ip = getattr(request, 'META', {}).get('REMOTE_ADDR')
    except Exception:  # nosec B110
        pass
    msg = f"User locked out: username={username or '<unknown>'}, ip={ip or '<unknown>'}"
    logger.warning(msg)
    try:
        if getattr(settings, 'AXES_ALERT_ADMINS', False) and getattr(settings, 'ADMINS', None):
            mail_admins(subject='[Security] User account locked out', message=msg, fail_silently=True)
    except Exception:
        # Never let alerting crash the request lifecycle
        logger.debug('mail_admins failed for lockout alert', exc_info=True)


def connect_user_profile_signal():
    """Connect the post_save signal for the User model at app ready."""
    User = get_user_model()
    post_save.connect(create_user_profile, sender=User, dispatch_uid='accounts_create_user_profile')
    # Connect lockout alerting if django-axes is available and feature is enabled
    try:
        if user_locked_out is not None and settings.FEATURES.get('LOGIN_PROTECTION'):
            user_locked_out.connect(_handle_user_locked_out, dispatch_uid='accounts_user_locked_out')
    except Exception:
        # Keep startup resilient if axes/settings are misconfigured
        logger.debug('Failed to connect user_locked_out signal', exc_info=True)
