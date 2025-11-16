from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from integrations.models import (
    IntegrationConnection,
    IntegrationJob,
    IntegrationProvider,
    IntegrationRule,
    IntegrationSetting,
)
from integrations.tasks import integration_rule_planner, run_integration_rule


class IntegrationTaskTests(TestCase):
    def setUp(self):
        self.provider = IntegrationProvider.objects.create(
            key='bqe',
            display_name='BQE',
            metadata={},
            schema_version='1.0.0',
        )
        self.connection = IntegrationConnection.objects.create(
            provider=self.provider,
            company_id='acme',
            environment='sandbox',
        )
        self.rule = IntegrationRule.objects.create(
            connection=self.connection,
            object_key='projects',
            config={
                'objectKey': 'projects',
                'fields': ['name'],
                'filters': {},
                'intervalMinutes': 5,
                'syncBehavior': 'delta',
                'conflictPolicy': 'upsert',
                'deletionPolicy': 'mark_inactive_keep_link',
                'includeSubprojects': False,
                'initialSyncMode': 'full_once',
                'clientSyncPolicy': 'preserve_local',
                'dryRun': True,
            },
            is_enabled=True,
            next_run_at=timezone.now() - timedelta(minutes=10),
        )

    @mock.patch('integrations.tasks.scheduler_health', return_value={'healthy': True, 'workersAvailable': True, 'cacheAvailable': True})
    @mock.patch('integrations.tasks.run_integration_rule.apply_async')
    def test_planner_enqueues_due_rules(self, apply_async, scheduler_health):
        integration_rule_planner()
        apply_async.assert_called_once()
        call_kwargs = apply_async.call_args.kwargs
        self.assertEqual(call_kwargs['args'][0], self.rule.id)
        self.assertEqual(call_kwargs['kwargs']['expected_revision'], self.rule.revision)
        self.rule.refresh_from_db()
        self.assertIsNone(self.rule.next_run_at)

        # Resync required rules are skipped
        self.rule.resync_required = True
        self.rule.next_run_at = timezone.now() - timedelta(minutes=5)
        self.rule.save(update_fields=['resync_required', 'next_run_at'])
        apply_async.reset_mock()
        integration_rule_planner()
        apply_async.assert_not_called()

    @mock.patch('integrations.tasks.acquire_rule_lock', return_value=True)
    def test_run_rule_creates_job_and_state(self, acquire_lock):
        run_integration_rule.run(self.rule.id, expected_revision=self.rule.revision)
        jobs = IntegrationJob.objects.filter(connection=self.connection)
        self.assertEqual(jobs.count(), 1)
        job = jobs.first()
        self.assertEqual(job.status, 'succeeded')
        self.rule.refresh_from_db()
        self.assertIsNotNone(self.rule.last_run_at)
        self.assertIsNotNone(self.rule.last_success_at)
        self.assertIsNotNone(self.rule.next_run_at)
        setting = IntegrationSetting.objects.filter(connection=self.connection, key='state.projects').first()
        self.assertIsNotNone(setting)
        self.assertEqual(setting.data.get('lastRuleRevision'), self.rule.revision)

    def test_run_rule_skips_on_revision_mismatch(self):
        run_integration_rule.run(self.rule.id, expected_revision=self.rule.revision + 1)
        self.assertEqual(IntegrationJob.objects.count(), 0)

    @mock.patch('integrations.tasks.acquire_rule_lock', return_value=False)
    def test_run_rule_skips_when_locked(self, acquire_lock):
        run_integration_rule.run(self.rule.id, expected_revision=self.rule.revision)
        self.assertEqual(IntegrationJob.objects.count(), 0)
