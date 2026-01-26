from django.apps import AppConfig


class RolesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'roles'

    def ready(self):  # pragma: no cover
        try:
            from . import signals  # noqa: F401
        except Exception:  # nosec B110
            pass
