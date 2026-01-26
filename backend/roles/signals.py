from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from roles.models import Role


@receiver(post_save, sender=Role)
def sync_overhead_assignments_on_role_save(sender, instance: Role, **kwargs):
    try:
        from assignments.overhead import sync_overhead_assignments_for_roles
    except Exception:  # nosec B110
        return

    transaction.on_commit(lambda: sync_overhead_assignments_for_roles([instance.id]))
