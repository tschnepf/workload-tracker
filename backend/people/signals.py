from django.db import transaction
from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.core.cache import cache

from .models import Person
from assignments.rollup_service import queue_project_rollup_refresh
from assignments.models import Assignment
from projects.assigned_names import enqueue_assigned_names_rebuild_on_commit


def _bump_analytics_cache_version():
    key = 'analytics_cache_version'
    try:
        cache.incr(key)
    except Exception:
        current = cache.get(key, 1)
        try:
            cache.set(key, int(current) + 1, None)
        except Exception:  # nosec B110
            pass


@receiver([post_save, post_delete], sender=Person)
def invalidate_on_person_change(sender, instance, **kwargs):
    _bump_analytics_cache_version()


@receiver(pre_save, sender=Person)
def capture_person_department(sender, instance: Person, **kwargs):
    if not instance.pk:
        instance._previous_department_id = None
        return
    try:
        instance._previous_department_id = (
            Person.objects.filter(pk=instance.pk)
            .values_list('department_id', flat=True)
            .first()
        )
    except Exception:  # nosec B110
        instance._previous_department_id = None


@receiver(pre_save, sender=Person)
def capture_person_name(sender, instance: Person, **kwargs):
    if not instance.pk:
        instance._previous_name = None
        instance._previous_is_active = None
        return
    try:
        row = (
            Person.objects.filter(pk=instance.pk)
            .values_list('name', 'is_active')
            .first()
        )
        if row:
            instance._previous_name = row[0]
            instance._previous_is_active = row[1]
        else:
            instance._previous_name = None
            instance._previous_is_active = None
    except Exception:  # nosec B110
        instance._previous_name = None
        instance._previous_is_active = None


@receiver(post_save, sender=Person)
def refresh_rollups_on_department_change(sender, instance: Person, **kwargs):
    prev = getattr(instance, '_previous_department_id', None)
    if prev == instance.department_id:
        return
    try:
        project_ids = list(
            Assignment.objects.filter(person_id=instance.id, is_active=True)
            .values_list('project_id', flat=True)
            .distinct()
        )
        project_ids = [pid for pid in project_ids if pid]
        if project_ids:
            queue_project_rollup_refresh(project_ids)
    except Exception:  # nosec B110
        pass


@receiver(post_save, sender=Person)
def refresh_assigned_names_on_name_change(sender, instance: Person, **kwargs):
    prev = getattr(instance, '_previous_name', None)
    prev_active = getattr(instance, '_previous_is_active', None)
    if prev == instance.name and (prev_active is None or prev_active == instance.is_active):
        return
    try:
        project_ids = list(
            Assignment.objects.filter(person_id=instance.id, is_active=True)
            .values_list('project_id', flat=True)
            .distinct()
        )
        project_ids = [pid for pid in project_ids if pid]
        if project_ids:
            enqueue_assigned_names_rebuild_on_commit(project_ids)
    except Exception:  # nosec B110
        pass


@receiver(post_save, sender=Person)
def sync_overhead_assignments_on_person_save(sender, instance: Person, **kwargs):
    if not getattr(instance, 'is_active', True):
        return
    try:
        from assignments.overhead import sync_overhead_assignments_for_people
    except Exception:  # nosec B110
        return
    transaction.on_commit(lambda: sync_overhead_assignments_for_people([instance.id]))
