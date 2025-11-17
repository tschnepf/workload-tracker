from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from integrations.models import IntegrationProvider, IntegrationConnection, IntegrationRule
from integrations.services import flag_connections_after_restore


class RestoreServiceTests(TestCase):
    def setUp(self):
        self.provider = IntegrationProvider.objects.create(key='bqe', display_name='BQE', metadata={}, schema_version='1.0.0')
        self.connection = IntegrationConnection.objects.create(provider=self.provider, environment='sandbox')
        self.rule = IntegrationRule.objects.create(
            connection=self.connection,
            object_key='projects',
            config={
                'objectKey': 'projects',
                'fields': ['name'],
                'filters': {},
                'intervalMinutes': 60,
                'syncBehavior': 'delta',
                'conflictPolicy': 'upsert',
                'deletionPolicy': 'mark_inactive_keep_link',
                'includeSubprojects': False,
                'initialSyncMode': 'full_once',
                'clientSyncPolicy': 'preserve_local',
                'dryRun': True,
            },
            is_enabled=True,
        )

    @override_settings(INTEGRATIONS_RESTORE_MAX_AGE_DAYS=1)
    def test_flag_connections_after_restore_marks_records(self):
        meta = {'finishedAt': (timezone.now() - timedelta(days=2)).isoformat()}
        updated = flag_connections_after_restore(meta)
        self.assertTrue(updated)
        self.connection.refresh_from_db()
        self.rule.refresh_from_db()
        self.assertTrue(self.connection.needs_reauth)
        self.assertTrue(self.rule.resync_required)
        self.assertIsNone(self.rule.next_run_at)
