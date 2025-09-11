from django.apps import AppConfig

class DepartmentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'departments'

    def ready(self):
        # Connect cache invalidation signals for department hierarchy
        try:
            from . import signals  # noqa: F401
        except Exception:
            # Keep startup resilient if cache backend is misconfigured
            pass
