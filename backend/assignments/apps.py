from django.apps import AppConfig

class AssignmentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'assignments'

    def ready(self):
        # Import signal handlers
        try:
            from . import signals  # noqa: F401
        except Exception:  # nosec B110
            # Avoid crashing app startup if migrations are running without full deps
            pass
