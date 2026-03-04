from datetime import datetime
from unittest import mock
from zoneinfo import ZoneInfo

from django.test import TestCase

from assignments.tasks import network_graph_weekly_snapshot_scheduler_task
from core.models import NetworkGraphSettings
from core.week_utils import sunday_of_week


class NetworkGraphSchedulerTaskTests(TestCase):
    def setUp(self):
        self.settings = NetworkGraphSettings.get_active()
        self.settings.snapshot_scheduler_enabled = True
        self.settings.snapshot_scheduler_timezone = 'America/Phoenix'
        self.settings.snapshot_scheduler_hour = 23
        self.settings.snapshot_scheduler_minute = 55
        self.settings.last_snapshot_week_start = None
        self.settings.save()

    def test_scheduler_runs_once_per_week_and_skips_duplicates(self):
        tz = ZoneInfo('America/Phoenix')
        now_local = datetime(2026, 3, 1, 23, 56, tzinfo=tz)  # Sunday
        self.settings.snapshot_scheduler_day = now_local.weekday()
        self.settings.save(update_fields=['snapshot_scheduler_day', 'updated_at'])

        with mock.patch('assignments.tasks.timezone.now', return_value=now_local), mock.patch(
            'assignments.tasks.write_weekly_assignment_snapshots',
            return_value={'lock_acquired': True, 'rows': 12},
        ) as write_mock:
            first = network_graph_weekly_snapshot_scheduler_task.run()
            second = network_graph_weekly_snapshot_scheduler_task.run()

        self.assertEqual(first['status'], 'ok')
        self.assertEqual(second['status'], 'skipped')
        self.assertEqual(second['reason'], 'already_ran')
        write_mock.assert_called_once()

        self.settings.refresh_from_db()
        self.assertEqual(self.settings.last_snapshot_week_start, sunday_of_week(now_local.date()))

    def test_scheduler_skips_when_disabled(self):
        self.settings.snapshot_scheduler_enabled = False
        self.settings.save(update_fields=['snapshot_scheduler_enabled', 'updated_at'])

        with mock.patch('assignments.tasks.write_weekly_assignment_snapshots') as write_mock:
            result = network_graph_weekly_snapshot_scheduler_task.run()
        self.assertEqual(result['status'], 'skipped')
        self.assertEqual(result['reason'], 'disabled')
        write_mock.assert_not_called()
