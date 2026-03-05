from django.db import transaction
from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.core.cache import cache
from django.utils import timezone

from assignments.models import Assignment
from assignments.rollup_service import queue_project_rollup_refresh
from assignments.week_hours_service import sync_assignment_week_hours
from projects.assigned_names import enqueue_assigned_names_rebuild_on_commit
from deliverables.models import DeliverableAssignment
from projects.models import ProjectTask
from core.cache_scopes import bump_snapshot_scopes
from assignments.utils.project_membership import is_current_project_assignee


def _bump_analytics_cache_version():
    key = 'analytics_cache_version'
    try:
        cache.incr(key)
    except Exception:
        # If key doesn't exist or backend lacks incr, set a new version marker
        current = cache.get(key, 1)
        cache.set(key, current + 1, None)


@receiver(pre_save, sender=Assignment)
def capture_assignment_project(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_project_id = None
        return
    try:
        instance._previous_project_id = (
            Assignment.objects.filter(pk=instance.pk)
            .values_list('project_id', flat=True)
            .first()
        )
    except Exception:  # nosec B110
        instance._previous_project_id = None


@receiver([post_save, post_delete], sender=Assignment)
def invalidate_on_assignment_change(sender, instance, **kwargs):
    _bump_analytics_cache_version()
    department_ids = []
    if getattr(instance, 'department_id', None):
        department_ids.append(instance.department_id)
    try:
        if getattr(instance, 'person', None) and instance.person and instance.person.department_id:
            department_ids.append(instance.person.department_id)
    except Exception:  # nosec B110
        pass
    bump_snapshot_scopes(
        project_ids=[instance.project_id] if getattr(instance, 'project_id', None) else [],
        department_ids=department_ids,
    )
    if 'created' in kwargs:
        try:
            transaction.on_commit(lambda: sync_assignment_week_hours(instance, instance.weekly_hours, clear_missing=True))
        except Exception:  # nosec B110
            pass
    try:
        if instance.project_id:
            transaction.on_commit(lambda: queue_project_rollup_refresh([instance.project_id]))
    except Exception:  # nosec B110
        pass
    try:
        project_ids = []
        if instance.project_id:
            project_ids.append(instance.project_id)
        prev = getattr(instance, '_previous_project_id', None)
        if prev and prev != instance.project_id:
            project_ids.append(prev)
        if project_ids:
            enqueue_assigned_names_rebuild_on_commit(project_ids)
    except Exception:  # nosec B110
        pass


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
    for task in ProjectTask.objects.filter(project_id=instance.project_id, assignees__id=instance.person_id).distinct():
        if task.completion_percent >= 100:
            continue
        task.assignees.remove(instance.person_id)
        task.updated_at = timezone.now()
        task.save(update_fields=['updated_at'])
