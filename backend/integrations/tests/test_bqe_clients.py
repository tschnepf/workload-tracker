from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest import mock

from django.test import TestCase

from django.utils import timezone

from integrations.models import (
    EncryptedSecret,
    IntegrationClient,
    IntegrationConnection,
    IntegrationProvider,
    IntegrationRule,
    IntegrationSecretKey,
)
from integrations.encryption import reset_key_cache
from integrations.providers.bqe.clients_client import BQEClientsClient
from integrations.providers.bqe.clients_sync import sync_clients


class DummyResponse:
    def __init__(self, status_code=200, payload=None, headers=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


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


class BQEClientsClientTests(TestCase):
    def setUp(self):
        self.provider = IntegrationProvider.objects.create(key='bqe', display_name='BQE', metadata={}, schema_version='1.0.0')
        self.connection = IntegrationConnection.objects.create(
            provider=self.provider,
            environment='sandbox',
        )
        _seed_connection_token(self.connection)

    def test_fetch_handles_retry(self):
        responses = [
            DummyResponse(429, headers={'Retry-After': '1'}),
            DummyResponse(200, {'items': [{'clientId': 1}], 'page': 1, 'totalPages': 1}),
        ]
        http = SimpleNamespace(request=mock.Mock(side_effect=responses))
        sleeps = []

        def fake_sleep(seconds):
            sleeps.append(seconds)

        client = BQEClientsClient(self.connection, integration_registry_provider(), http_client=http, sleep_fn=fake_sleep)
        batches = list(client.fetch())
        self.assertEqual(len(batches), 1)
        self.assertEqual(len(batches[0]), 1)
        self.assertEqual(sleeps, [1])


class BQEClientsSyncTests(TestCase):
    def setUp(self):
        self.provider = IntegrationProvider.objects.create(key='bqe', display_name='BQE', metadata={}, schema_version='1.0.0')
        self.connection = IntegrationConnection.objects.create(
            provider=self.provider,
            environment='sandbox',
        )
        _seed_connection_token(self.connection)
        self.rule = IntegrationRule.objects.create(
            connection=self.connection,
            object_key='clients',
            config={
                'objectKey': 'clients',
                'fields': ['name'],
                'filters': {},
                'intervalMinutes': 30,
                'syncBehavior': 'delta',
                'conflictPolicy': 'upsert',
                'deletionPolicy': 'ignore',
                'includeSubprojects': False,
                'initialSyncMode': 'delta_only_from_now',
                'clientSyncPolicy': 'preserve_local',
                'dryRun': False,
            },
            is_enabled=True,
        )

    def test_sync_creates_records(self):
        payloads = [[{'clientId': '77', 'name': 'Client A', 'number': 'C-1', 'status': 'Active', 'updatedOn': '2025-02-01T00:00:00Z'}]]

        class DummyClient:
            def __init__(self, *_args, **_kwargs):
                self.payloads = payloads

            def fetch(self, updated_since=None):
                yield from self.payloads

        result = sync_clients(self.rule, state={}, dry_run=False, client_factory=DummyClient)
        self.assertEqual(result.metrics['inserted'], 1)
        client = IntegrationClient.objects.get(connection=self.connection, external_id='77')
        self.assertEqual(client.name, 'Client A')
        self.assertEqual(client.client_number, 'C-1')
        self.assertEqual(client.status, 'Active')
        self.assertIsNotNone(result.cursor)

    def test_dry_run_skips_writes(self):
        class DummyClient:
            def __init__(self, *_args, **_kwargs):
                pass

            def fetch(self, updated_since=None):
                yield [{'clientId': '1', 'name': 'Example'}]

        result = sync_clients(self.rule, state={}, dry_run=True, client_factory=DummyClient)
        self.assertEqual(IntegrationClient.objects.count(), 0)
        self.assertEqual(result.metrics['fetched'], 1)


def integration_registry_provider():
    from integrations.registry import get_registry

    provider = get_registry().get_provider('bqe')
    if not provider:
        raise RuntimeError('Provider metadata missing for tests')
    return provider
