from __future__ import annotations

from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandParser
from django.db import connection
from django.utils import timezone

from assignments.snapshot_service import backfill_weekly_assignment_snapshots
from core.models import NetworkGraphSettings
from core.week_utils import sunday_of_week


LOCK_KEY = 'network_graph_initial_backfill'


def _try_acquire_lock() -> bool:
    if connection.vendor != 'postgresql':
        return True
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_try_advisory_lock(hashtext(%s))', [LOCK_KEY])
        row = cursor.fetchone()
    return bool(row and row[0])


def _release_lock() -> None:
    if connection.vendor != 'postgresql':
        return
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_unlock(hashtext(%s))', [LOCK_KEY])


class Command(BaseCommand):
    help = 'Run one-time weekly assignment snapshot backfill for network graph analytics.'

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument('--weeks', type=int, default=104, help='Number of Sundays to backfill (default: 104).')
        parser.add_argument('--emit-events', type=int, default=0, help='0|1 emit membership events during backfill.')
        parser.add_argument('--force', type=int, default=0, help='0|1 ignore completion marker and rerun.')

    def handle(self, *args, **options):
        weeks = max(1, int(options.get('weeks') or 104))
        emit_events = int(options.get('emit-events') or 0) == 1
        force = int(options.get('force') or 0) == 1

        if not _try_acquire_lock():
            self.stdout.write(self.style.WARNING('Skipped: another process is already running the initial backfill.'))
            return

        try:
            settings_obj = NetworkGraphSettings.get_active()
            if settings_obj.initial_backfill_completed_at and not force:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Skipped: initial backfill already completed at {settings_obj.initial_backfill_completed_at.isoformat()}."
                    )
                )
                return

            most_recent_sunday = sunday_of_week(date.today())
            sundays = [most_recent_sunday - timedelta(days=7 * i) for i in range(weeks)]

            inserted_total = 0
            updated_total = 0
            events_total = 0
            for week_start in sundays:
                result = backfill_weekly_assignment_snapshots(week_start, emit_events=emit_events, force=force)
                if not result.get('lock_acquired', True):
                    self.stdout.write(self.style.WARNING(f'Skipped {week_start}: week lock not acquired'))
                    continue
                inserted_total += int(result.get('inserted', 0))
                updated_total += int(result.get('updated', 0))
                events_total += int(result.get('events_inserted', 0))

            settings_obj.initial_backfill_completed_at = timezone.now()
            settings_obj.initial_backfill_weeks = weeks
            if settings_obj.last_snapshot_week_start is None or settings_obj.last_snapshot_week_start < most_recent_sunday:
                settings_obj.last_snapshot_week_start = most_recent_sunday
            settings_obj.save(
                update_fields=[
                    'initial_backfill_completed_at',
                    'initial_backfill_weeks',
                    'last_snapshot_week_start',
                    'updated_at',
                ]
            )

            self.stdout.write(
                self.style.SUCCESS(
                    'Initial network snapshot backfill complete: '
                    f'weeks={weeks}, inserted={inserted_total}, updated={updated_total}, events={events_total}, '
                    f'last_snapshot_week_start={most_recent_sunday.isoformat()}'
                )
            )
        finally:
            _release_lock()
