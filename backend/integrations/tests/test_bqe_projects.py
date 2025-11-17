from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest import mock

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from django.utils import timezone

from requests import HTTPError

from integrations.models import (
    EncryptedSecret,
    IntegrationConnection,
    IntegrationExternalLink,
    IntegrationProvider,
    IntegrationRule,
    IntegrationSecretKey,
)
from integrations.providers.bqe.projects_client import BQEProjectsClient
from integrations.providers.bqe.projects_sync import sync_projects
from integrations.matching import suggest_project_matches, confirm_project_matches
from projects.models import Project
from integrations.encryption import reset_key_cache
from integrations.exceptions import IntegrationProviderError

TEST_SECRET_KEY = 'XvDOvRMNzSVskLFaPrEMHcKXqswNyptPVJ0cDIe8x5g='


def _seed_connection_token(connection):
    reset_key_cache()
    IntegrationSecretKey.set_plaintext(TEST_SECRET_KEY)
    reset_key_cache()
    expires_at = (timezone.now() + timedelta(hours=1)).isoformat()
    EncryptedSecret.store(connection, {
        'kind': 'oauth_token',
        'access_token': 'test-token',
        'refresh_token': 'refresh',
        'expires_at': expires_at,
        'endpoint': 'https://tenant.example.com/api',
    })


class DummyResponse:
    def __init__(self, status_code=200, payload=None, headers=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            error = HTTPError(f"HTTP {self.status_code}")
            error.response = self
            raise error

    def json(self):
        return self._payload


class BQEClientTests(TestCase):
    def setUp(self):
        self.provider = IntegrationProvider.objects.create(
            key='bqe',
            display_name='BQE',
            metadata={},
            schema_version='1.0.0',
        )
        self.connection = IntegrationConnection.objects.create(
            provider=self.provider,
            environment='sandbox',
        )
        _seed_connection_token(self.connection)

    def test_pagination_and_retry(self):
        responses = [
            DummyResponse(429, headers={'Retry-After': '1'}),
            DummyResponse(200, {'items': [{'projectId': 1}, {'projectId': 2}], 'page': 1, 'totalPages': 2}),
            DummyResponse(200, {'items': [{'projectId': 3}]})
        ]
        http = SimpleNamespace(request=mock.Mock(side_effect=responses))
        sleep_calls = []

        def fake_sleep(seconds):
            sleep_calls.append(seconds)

        client = BQEProjectsClient(self.connection, integration_registry_provider(), http_client=http, sleep_fn=fake_sleep)
        batches = list(client.fetch(updated_since=None))
        self.assertEqual(len(batches), 2)
        self.assertEqual(sum(len(b) for b in batches), 3)
        self.assertEqual(sleep_calls, [1])

    def test_permission_error_translated(self):
        payload = {
            'ErrorCode': '000.016',
            'Key': 'MsgPermissions',
            'Message': 'You do not have the security permissions to access this feature.',
        }
        http = SimpleNamespace(request=mock.Mock(return_value=DummyResponse(409, payload)))
        client = BQEProjectsClient(self.connection, integration_registry_provider(), http_client=http)
        iterator = client.fetch(updated_since=None)
        with self.assertRaises(IntegrationProviderError) as ctx:
            next(iterator)
        self.assertIn('security permissions', str(ctx.exception))
        self.assertEqual(ctx.exception.code, 'MsgPermissions')


class BQESyncTests(TestCase):
    def setUp(self):
        self.provider = IntegrationProvider.objects.create(
            key='bqe',
            display_name='BQE CORE',
            metadata={},
            schema_version='1.0.0',
        )
        self.connection = IntegrationConnection.objects.create(
            provider=self.provider,
            environment='sandbox',
        )
        _seed_connection_token(self.connection)
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
                'clientSyncPolicy': 'follow_bqe',
                'dryRun': False,
            },
            is_enabled=True,
        )
        self.project = Project.objects.create(name='Local Project', client='Internal')
        IntegrationExternalLink.objects.create(
            provider=self.provider,
            connection=self.connection,
            object_type='projects',
            external_id='1',
            content_type=ContentType.objects.get_for_model(Project),
            object_id=self.project.id,
        )

    def test_sync_updates_mapped_fields(self):
        payloads = [
            [
                {
                    'projectId': 1,
                    'name': 'Remote Project',
                    'status': 'Archived',
                    'clientName': 'Remote Client',
                    'clientId': '123',
                    'updatedOn': '2025-01-01T00:00:00Z',
                },
                {
                    'projectId': 999,
                    'parentProjectId': 1,
                    'name': 'Sub project',
                },
            ]
        ]

        class DummyClient:
            def __init__(self, *_args, **_kwargs):
                self.payloads = payloads

            def fetch(self, updated_since=None):
                yield from self.payloads

        state = {}
        result = sync_projects(self.rule, state=state, dry_run=False, client_factory=DummyClient)
        self.project.refresh_from_db()
        self.assertEqual(self.project.name, 'Remote Project')
        self.assertEqual(self.project.client, 'Remote Client')
        self.assertEqual(self.project.status, 'inactive')
        self.assertFalse(self.project.is_active)
        self.assertEqual(self.project.bqe_client_name, 'Remote Client')
        self.assertEqual(self.project.bqe_client_id, '123')
        self.assertGreater(result.metrics['skippedChildren'], 0)
        self.assertEqual(result.metrics['updated'], 1)
        self.assertTrue(result.cursor)

    def test_preserve_local_client_policy(self):
        self.rule.config['clientSyncPolicy'] = 'preserve_local'
        self.project.client = 'Custom Client'
        self.project.bqe_client_name = 'Old Remote'
        self.project.save()

        class DummyClient:
            def __init__(self, *_args, **_kwargs):
                pass

            def fetch(self, updated_since=None):
                yield [{
                    'projectId': 1,
                    'name': 'Remote Project',
                    'clientName': 'Remote Client',
                    'updatedOn': '2025-01-01T00:00:00Z',
                }]

        sync_projects(self.rule, state={}, dry_run=False, client_factory=DummyClient)
        self.project.refresh_from_db()
        self.assertEqual(self.project.client, 'Custom Client')
        self.assertEqual(self.project.bqe_client_name, 'Remote Client')

    @mock.patch('integrations.matching.fetch_bqe_parent_projects')
    def test_suggest_project_matches(self, fetch_mock):
        fetch_mock.return_value = [
            {'projectId': '10', 'name': 'Alpha', 'projectNumber': 'P-100', 'clientName': 'ACME'},
            {'projectId': '11', 'name': 'Beta', 'projectNumber': None, 'clientName': 'Client B'},
        ]
        Project.objects.create(name='Alpha', client='ACME', project_number='P-100')
        Project.objects.create(name='Beta', client='Client B')
        suggestions = suggest_project_matches(self.connection)
        self.assertEqual(suggestions['summary']['matched'], 2)
        self.assertEqual(len(suggestions['items']), 2)

    @mock.patch('integrations.matching.fetch_bqe_parent_projects')
    def test_confirm_project_matches(self, fetch_mock):
        fetch_mock.return_value = []
        project = Project.objects.create(name='Alpha', client='ACME', project_number='P-100')
        summary = confirm_project_matches(
            self.connection,
            matches=[{'externalId': '99', 'projectId': project.id}],
            enable_rule=True,
        )
        self.assertEqual(summary['updated'], 1)
        self.assertTrue(
            IntegrationExternalLink.objects.filter(
                provider=self.provider,
                connection=self.connection,
                external_id='99',
            ).exists()
        )


def integration_registry_provider():
    from integrations.registry import get_registry
    provider = get_registry().get_provider('bqe')
    if not provider:
        raise RuntimeError('Provider metadata missing for tests')
    return provider
