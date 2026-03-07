from django.apps import AppConfig
import importlib


class SkillsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'skills'

    def ready(self):
        # Register signals for snapshot/cache invalidation.
        importlib.import_module('skills.signals')
