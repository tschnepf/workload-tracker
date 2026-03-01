from __future__ import annotations

from django.core.management.base import BaseCommand

from assignments.models import Assignment
from assignments.week_hours_service import sync_assignment_week_hours_queryset


class Command(BaseCommand):
    help = "Backfill normalized AssignmentWeekHour rows from Assignment.weekly_hours JSON."

    def add_arguments(self, parser):
        parser.add_argument('--full', action='store_true', help='Sync all assignments.')
        parser.add_argument('--batch-size', type=int, default=500, help='Batch size for queryset iteration.')
        parser.add_argument('--start-id', type=int, default=None, help='Inclusive assignment id lower bound.')
        parser.add_argument('--end-id', type=int, default=None, help='Inclusive assignment id upper bound.')

    def handle(self, *args, **options):
        if not options['full'] and options['start_id'] is None and options['end_id'] is None:
            self.stdout.write(self.style.ERROR('Provide --full or an id range via --start-id/--end-id'))
            return

        qs = Assignment.objects.all().order_by('id')
        if options['start_id'] is not None:
            qs = qs.filter(id__gte=options['start_id'])
        if options['end_id'] is not None:
            qs = qs.filter(id__lte=options['end_id'])

        synced = 0
        batch_size = max(1, int(options['batch_size'] or 500))
        for start in range(0, qs.count(), batch_size):
            batch = list(qs[start:start + batch_size])
            synced += sync_assignment_week_hours_queryset(batch, clear_missing=True)
            self.stdout.write(f"synced={synced}")
        self.stdout.write(self.style.SUCCESS(f"Done. synced={synced}"))
