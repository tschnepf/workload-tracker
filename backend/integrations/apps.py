from django.apps import AppConfig


class IntegrationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'integrations'

    def ready(self):
        # Lazy import to avoid side effects during migrations
        try:
            from . import registry  # noqa: F401
        except Exception:  # nosec B110
            # Avoid crashing when registry can't load (e.g., during tests without files)
            pass
