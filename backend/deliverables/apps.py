from django.apps import AppConfig


class DeliverablesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'deliverables'
    
    def ready(self):
        """Import signals when the app is ready"""
        import deliverables.signals
