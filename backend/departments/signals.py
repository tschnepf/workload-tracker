from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache
from .models import Department


def _bump_dept_desc_version():
    try:
        current = cache.get('dept_desc_ver', 1)
        cache.set('dept_desc_ver', int(current) + 1, None)
    except Exception:
        # Fallback: attempt to clear cache on unsupported backends
        try:
            cache.clear()
        except Exception:  # nosec B110
            pass


@receiver(post_save, sender=Department)
def department_saved(sender, instance, **kwargs):
    _bump_dept_desc_version()


@receiver(post_delete, sender=Department)
def department_deleted(sender, instance, **kwargs):
    _bump_dept_desc_version()

