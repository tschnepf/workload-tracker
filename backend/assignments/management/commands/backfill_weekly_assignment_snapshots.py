from django.core.management.base import BaseCommand, CommandParser
from datetime import date
from core.week_utils import list_sundays_between
from assignments.snapshot_service import backfill_weekly_assignment_snapshots


class Command(BaseCommand):
    help = "Backfill weekly assignment snapshots for the past N weeks."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument('--weeks', type=int, required=True, help='Number of past Sundays to backfill (including the most recent)')
        parser.add_argument('--emit-events', type=int, default=0, help='0|1 optionally emit membership events')
        parser.add_argument('--force', type=int, default=0, help='0|1 overwrite existing backfilled rows')

    def handle(self, *args, **options):
        weeks = int(options['weeks'])
        emit = int(options.get('emit-events') or 0) == 1
        force = int(options.get('force') or 0) == 1
        today = date.today()
        # Compute Sundays back N weeks
        from core.week_utils import sunday_of_week
        from datetime import timedelta
        most_recent = sunday_of_week(today)
        sundays = [most_recent - timedelta(days=7*i) for i in range(max(1, weeks))]

        total_inserted = 0
        total_updated = 0
        total_events = 0
        for s in sundays:
            res = backfill_weekly_assignment_snapshots(s, emit_events=emit, force=force)
            if not res.get('lock_acquired'):
                self.stdout.write(self.style.WARNING(f"Skipped {s}: lock not acquired"))
                continue
            self.stdout.write(self.style.SUCCESS(
                f"Week {s}: inserted={res.get('inserted',0)}, updated={res.get('updated',0)}, events={res.get('events_inserted',0)}"
            ))
            total_inserted += int(res.get('inserted', 0))
            total_updated += int(res.get('updated', 0))
            total_events += int(res.get('events_inserted', 0))
        self.stdout.write(self.style.SUCCESS(
            f"Backfill done. total_inserted={total_inserted}, total_updated={total_updated}, total_events={total_events}"
        ))
