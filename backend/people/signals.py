from django.db import transaction
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache

from .models import Person


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


@receiver(post_save, sender=Person)
def sync_overhead_assignments_on_person_save(sender, instance: Person, **kwargs):
    if not getattr(instance, 'is_active', True):
        return
    try:
        from assignments.overhead import sync_overhead_assignments_for_people
    except Exception:  # nosec B110
        return
    transaction.on_commit(lambda: sync_overhead_assignments_for_people([instance.id]))
