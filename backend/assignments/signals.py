from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache
from django.utils import timezone

from assignments.models import Assignment
from deliverables.models import DeliverableAssignment, DeliverableTask
from deliverables.services import DeliverableQATaskService
from core.choices import DeliverableTaskCompletionStatus
from assignments.utils.project_membership import is_current_project_assignee


def _bump_analytics_cache_version():
    key = 'analytics_cache_version'
    try:
        cache.incr(key)
    except Exception:
        # If key doesn't exist or backend lacks incr, set a new version marker
        current = cache.get(key, 1)
        cache.set(key, current + 1, None)


@receiver([post_save, post_delete], sender=Assignment)
def invalidate_on_assignment_change(sender, instance, **kwargs):
    _bump_analytics_cache_version()


@receiver([post_save, post_delete], sender=DeliverableAssignment)
def invalidate_on_deliverable_assignment_change(sender, instance, **kwargs):
    _bump_analytics_cache_version()


@receiver([post_save, post_delete], sender=Assignment)
def unassign_tasks_on_assignment_change(sender, instance, **kwargs):
    """When a person is no longer assigned to a project, unassign incomplete tasks."""
    if not instance.project_id or not instance.person_id:
        return
    # If assignment still current, keep tasks assigned
    if is_current_project_assignee(instance.person_id, instance.project_id):
        return
    DeliverableTask.objects.filter(
        deliverable__project_id=instance.project_id,
        assigned_to_id=instance.person_id,
    ).exclude(
        completion_status=DeliverableTaskCompletionStatus.COMPLETE
    ).update(
        assigned_to=None,
        updated_at=timezone.now(),
    )


@receiver([post_save, post_delete], sender=Assignment)
def ensure_qa_tasks_on_assignment(sender, instance, **kwargs):
    """Ensure QA checklist tasks exist for future deliverables when assignments change."""
    if not instance.project_id:
        return
    try:
        DeliverableQATaskService.ensure_for_project_future_deliverables(instance.project_id)
    except Exception:  # nosec B110
        pass
