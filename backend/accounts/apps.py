from django.apps import AppConfig
from django.conf import settings


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'

    def ready(self):
        # Import signal connections
        try:
            from . import signals  # noqa: F401
            # Ensure signal connection happens on app ready
            if hasattr(signals, 'connect_user_profile_signal'):
                if getattr(settings, 'ENABLE_PROFILE_AUTO_CREATE', True):
                    signals.connect_user_profile_signal()
        except Exception:
            # Avoid import-time crashes; Django will surface errors at runtime
            pass
