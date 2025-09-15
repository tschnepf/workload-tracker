from django.apps import AppConfig

class PeopleConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'people'

    def ready(self):
        # Connect cache invalidation on person changes
        try:
            from . import signals  # noqa: F401
        except Exception:
            pass
