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
        except Exception:
            pass


@receiver([post_save, post_delete], sender=Person)
def invalidate_on_person_change(sender, instance, **kwargs):
    _bump_analytics_cache_version()

