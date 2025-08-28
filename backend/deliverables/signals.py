"""
Deliverable signals - Auto-create default deliverables on project creation
STANDARDS COMPLIANT: Follows R2-REBUILD-DELIVERABLES.md specifications
"""

from django.db.models.signals import post_save
from django.dispatch import receiver
from projects.models import Project
from .models import Deliverable


@receiver(post_save, sender=Project)
def create_default_deliverables(sender, instance, created, **kwargs):
    """
    Automatically create default deliverables on project creation
    Per proj_deliverables_description.txt: 35% SD, 75% DD, 95% IFP, 100% IFC
    """
    if created and not instance.deliverables.exists():
        # Default deliverables per requirements
        default_deliverables = [
            {'percentage': 35, 'description': 'SD', 'sort_order': 10},
            {'percentage': 75, 'description': 'DD', 'sort_order': 20},
            {'percentage': 95, 'description': 'IFP', 'sort_order': 30},
            {'percentage': 100, 'description': 'IFC', 'sort_order': 40},
        ]
        
        for deliverable_data in default_deliverables:
            Deliverable.objects.create(
                project=instance,
                **deliverable_data
            )