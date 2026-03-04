from datetime import date
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from core.models import NetworkGraphSettings
from core.week_utils import sunday_of_week


class EnsureNetworkSnapshotBackfillCommandTests(TestCase):
    def test_command_runs_once_and_then_skips(self):
        settings_obj = NetworkGraphSettings.get_active()

        with mock.patch(
            'assignments.management.commands.ensure_network_snapshot_backfill.backfill_weekly_assignment_snapshots',
            return_value={'lock_acquired': True, 'inserted': 2, 'updated': 0, 'events_inserted': 0},
        ) as backfill_mock:
            call_command('ensure_network_snapshot_backfill', weeks=2, emit_events=0, force=0)

        self.assertEqual(backfill_mock.call_count, 2)
        settings_obj.refresh_from_db()
        self.assertIsNotNone(settings_obj.initial_backfill_completed_at)
        self.assertEqual(settings_obj.initial_backfill_weeks, 2)
        self.assertEqual(settings_obj.last_snapshot_week_start, sunday_of_week(date.today()))

        stdout = StringIO()
        with mock.patch(
            'assignments.management.commands.ensure_network_snapshot_backfill.backfill_weekly_assignment_snapshots',
        ) as backfill_mock_2:
            call_command('ensure_network_snapshot_backfill', weeks=2, emit_events=0, force=0, stdout=stdout)

        self.assertEqual(backfill_mock_2.call_count, 0)
        self.assertIn('Skipped: initial backfill already completed', stdout.getvalue())

