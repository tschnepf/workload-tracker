"""
Deliverable and pre-deliverable signals.

Existing default deliverable creation retained; add generation/update hooks for pre-items.
"""

from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from projects.models import Project, ProjectPreDeliverableSettings
from core.models import PreDeliverableGlobalSettings
from .models import Deliverable
from .services import PreDeliverableService


@receiver(post_save, sender=Project)
def create_default_deliverables(sender, instance, created, **kwargs):
    """Automatically create default deliverables on project creation."""
    if created and not instance.deliverables.exists():
        default_deliverables = [
            {'percentage': 35, 'description': 'SD', 'sort_order': 10},
            {'percentage': 75, 'description': 'DD', 'sort_order': 20},
            {'percentage': 95, 'description': 'IFP', 'sort_order': 30},
            {'percentage': 100, 'description': 'IFC', 'sort_order': 40},
        ]
        for data in default_deliverables:
            Deliverable.objects.create(project=instance, **data)


@receiver(pre_save, sender=Deliverable)
def _capture_old_date(sender, instance: Deliverable, **kwargs):
    if instance.id:
        try:
            prev = Deliverable.objects.only('date').get(id=instance.id)
            instance._old_date = prev.date  # type: ignore[attr-defined]
        except Deliverable.DoesNotExist:
            instance._old_date = None  # type: ignore[attr-defined]
    else:
        instance._old_date = None  # type: ignore[attr-defined]


@receiver(post_save, sender=Deliverable)
def handle_deliverable_change(sender, instance: Deliverable, created, **kwargs):
    """Generate or update pre-deliverables when deliverable is created/updated."""
    old_date = getattr(instance, '_old_date', None)
    new_date = instance.date

    def _do():
        if created:
            if new_date:
                PreDeliverableService.generate_pre_deliverables(instance)
            return
        # Updated
        if old_date != new_date:
            PreDeliverableService.update_pre_deliverables(instance, old_date, new_date)

    transaction.on_commit(_do)


@receiver(post_save, sender=ProjectPreDeliverableSettings)
def handle_project_settings_change(sender, instance: ProjectPreDeliverableSettings, created, **kwargs):
    """Regenerate pre-deliverables for affected project's future deliverables."""
    def _do():
        future = instance.project.deliverables.filter(date__gte=timezone.now().date())
        for d in future.select_related('project'):
            PreDeliverableService.regenerate_pre_deliverables(d)
    transaction.on_commit(_do)


@receiver(post_save, sender=PreDeliverableGlobalSettings)
def handle_global_settings_change(sender, instance: PreDeliverableGlobalSettings, created, **kwargs):
    """Regenerate deliverables for projects without custom settings for this type.

    Note: Kept simple (no Celery) and limited scope to future-dated deliverables.
    """
    def _do():
        from projects.models import ProjectPreDeliverableSettings
        # Projects that do NOT have a custom entry for this type
        proj_ids_with_custom = set(
            ProjectPreDeliverableSettings.objects.filter(pre_deliverable_type=instance.pre_deliverable_type)
            .values_list('project_id', flat=True)
        )
        affected = Deliverable.objects.filter(
            date__gte=timezone.now().date(),
        ).exclude(project_id__in=proj_ids_with_custom)
        for d in affected.select_related('project'):
            PreDeliverableService.regenerate_pre_deliverables(d)
    transaction.on_commit(_do)
