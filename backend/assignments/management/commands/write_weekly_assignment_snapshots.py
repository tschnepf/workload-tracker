from django.core.management.base import BaseCommand, CommandParser
from datetime import date
from core.week_utils import sunday_of_week, list_sundays_between
from assignments.snapshot_service import write_weekly_assignment_snapshots


class Command(BaseCommand):
    help = "Write weekly assignment snapshots for a given week or range."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument('--week', type=str, help='Sunday week YYYY-MM-DD')
        parser.add_argument('--start', type=str, help='Start date (any day), inclusive')
        parser.add_argument('--end', type=str, help='End date (any day), inclusive')

    def handle(self, *args, **options):
        week = options.get('week')
        start = options.get('start')
        end = options.get('end')

        weeks: list[str]
        if week:
            d = date.fromisoformat(week)
            weeks = [sunday_of_week(d).isoformat()]
        elif start and end:
            d0 = date.fromisoformat(start)
            d1 = date.fromisoformat(end)
            weeks = list_sundays_between(d0, d1, inclusive=True)
        else:
            self.stderr.write('Provide either --week or both --start and --end')
            return

        total_inserted = 0
        total_updated = 0
        total_events = 0
        for wk in weeks:
            res = write_weekly_assignment_snapshots(wk)
            if not res.get('lock_acquired'):
                self.stdout.write(self.style.WARNING(f"Skipped {wk}: lock not acquired"))
                continue
            self.stdout.write(self.style.SUCCESS(
                f"Week {wk}: inserted={res.get('inserted',0)}, updated={res.get('updated',0)}, events={res.get('events_inserted',0)}"
            ))
            total_inserted += int(res.get('inserted', 0))
            total_updated += int(res.get('updated', 0))
            total_events += int(res.get('events_inserted', 0))

        self.stdout.write(self.style.SUCCESS(
            f"Done. total_inserted={total_inserted}, total_updated={total_updated}, total_events={total_events}"
        ))

