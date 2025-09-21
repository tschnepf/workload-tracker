from __future__ import annotations

from typing import Optional, Dict
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from deliverables.models import Deliverable, ReallocationAudit
from assignments.models import Assignment


class Command(BaseCommand):
    help = "Undo the last auto-reallocation for a deliverable by replaying the stored snapshot."

    def add_arguments(self, parser):
        parser.add_argument('deliverable_id', type=int, help='Deliverable ID to undo last reallocation for')
        parser.add_argument('--revert-date', action='store_true', help='Also revert deliverable.date to old_date in the audit')

    def handle(self, *args, **options):
        deliverable_id: int = options['deliverable_id']
        revert_date: bool = bool(options.get('revert_date'))

        try:
            d = Deliverable.objects.get(pk=deliverable_id)
        except Deliverable.DoesNotExist:
            raise CommandError(f'Deliverable {deliverable_id} not found')

        audit: Optional[ReallocationAudit] = (
            ReallocationAudit.objects.filter(deliverable_id=deliverable_id).order_by('-created_at').first()
        )
        if not audit:
            raise CommandError('No reallocation audit found to undo')

        snapshot: Dict[str, Dict[str, Dict[str, int]]] = audit.snapshot or {}
        if not snapshot:
            raise CommandError('Audit snapshot is empty; nothing to undo')

        with transaction.atomic():
            # Revert weekly_hours for touched assignments
            asn_ids = [int(k) for k in snapshot.keys()]
            for a in Assignment.objects.select_for_update().filter(id__in=asn_ids):
                snap = snapshot.get(str(a.id)) or {}
                prev = snap.get('prev') or {}
                wh = dict(a.weekly_hours or {})
                # Apply prev subset
                # Remove keys present in either prev or next to avoid remnants
                keys_to_consider = set((snap.get('next') or {}).keys()) | set(prev.keys())
                for k in keys_to_consider:
                    if k in prev:
                        wh[k] = int(prev[k] or 0)
                    else:
                        wh.pop(k, None)
                # Drop zeros
                wh = {k: int(v) for k, v in wh.items() if int(v or 0) > 0}
                a.weekly_hours = wh
                a.save(update_fields=['weekly_hours'])

            if revert_date:
                d.date = audit.old_date
                d.save(update_fields=['date'])

        self.stdout.write(self.style.SUCCESS('Undo completed'))

