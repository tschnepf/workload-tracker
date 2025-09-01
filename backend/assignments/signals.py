from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache

from assignments.models import Assignment
from deliverables.models import DeliverableAssignment


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

