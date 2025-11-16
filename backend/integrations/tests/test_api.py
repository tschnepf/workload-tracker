from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from unittest import mock
from cryptography.fernet import Fernet

from integrations.registry import get_registry
from integrations.models import IntegrationRule, IntegrationJob, IntegrationSecretKey
from integrations.encryption import reset_key_cache


class IntegrationsApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(username='admin', email='admin@example.com', password='pass1234')
        self.client.force_authenticate(self.user)
        reset_key_cache()
        IntegrationSecretKey.objects.all().delete()

    def tearDown(self):
        reset_key_cache()
        IntegrationSecretKey.objects.all().delete()

    def _create_connection(self):
        payload = {
            'providerKey': 'bqe',
            'company_id': 'acme-co',
            'environment': 'sandbox',
            'extra_headers': {'X-Custom': 'foo'},
        }
        resp = self.client.post('/api/integrations/connections/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp.json()['id']

    def test_provider_list(self):
        resp = self.client.get('/api/integrations/providers/')
        self.assertEqual(resp.status_code, 200)
        keys = [p['key'] for p in resp.json()]
        self.assertIn('bqe', keys)

    def test_create_connection(self):
        connection_id = self._create_connection()
        self.assertIsInstance(connection_id, int)

    def test_catalog_endpoint(self):
        resp = self.client.get('/api/integrations/providers/bqe/catalog/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['key'], 'bqe')
        self.assertGreater(len(data['objects']), 0)
        self.assertIn('fieldSignatureHash', data['objects'][0])

    def test_mapping_defaults_and_overrides(self):
        connection_id = self._create_connection()
        resp = self.client.get(f'/api/integrations/providers/bqe/projects/mapping/defaults/?connectionId={connection_id}')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNone(data['overrides'])
        self.assertFalse(data['stale'])
        payload = {
            'connectionId': connection_id,
            'version': data['schemaVersion'],
            'mappings': [{'source': 'name', 'target': 'project.name', 'behavior': 'follow_bqe'}],
        }
        resp = self.client.post('/api/integrations/providers/bqe/projects/mapping/defaults/', payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        resp = self.client.get(f'/api/integrations/providers/bqe/projects/mapping/defaults/?connectionId={connection_id}')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.json()['overrides'])

    def test_rule_creation(self):
        connection_id = self._create_connection()
        payload = {
            'connection_id': connection_id,
            'object_key': 'projects',
            'config': {
                'objectKey': 'projects',
                'fields': ['name', 'status'],
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
            'is_enabled': True,
        }
        resp = self.client.post('/api/integrations/rules/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_rule_resync_endpoint(self):
        connection_id = self._create_connection()
        payload = {
            'connection_id': connection_id,
            'object_key': 'projects',
            'config': {
                'objectKey': 'projects',
                'fields': ['name'],
                'filters': {},
                'intervalMinutes': 30,
                'syncBehavior': 'delta',
                'conflictPolicy': 'upsert',
                'deletionPolicy': 'mark_inactive_keep_link',
                'includeSubprojects': False,
                'initialSyncMode': 'full_once',
                'clientSyncPolicy': 'preserve_local',
                'dryRun': True,
            },
            'is_enabled': True,
        }
        resp = self.client.post('/api/integrations/rules/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        rule_id = resp.json()['id']
        rule = IntegrationRule.objects.get(id=rule_id)
        rule.resync_required = True
        rule.save(update_fields=['resync_required'])
        resp = self.client.post(f'/api/integrations/rules/{rule_id}/resync/', {'scope': 'full'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertFalse(data['rule']['resync_required'])

    def test_job_list_endpoint(self):
        connection_id = self._create_connection()
        rule = IntegrationRule.objects.create(
            connection_id=connection_id,
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
        job = IntegrationJob.objects.create(
            connection=rule.connection,
            provider=rule.connection.provider,
            object_key='projects',
            payload={'rule_id': rule.id},
            status='succeeded',
        )
        resp = self.client.get('/api/integrations/providers/bqe/jobs/')
        self.assertEqual(resp.status_code, 200, resp.content)
        items = resp.json().get('items') or []
        self.assertTrue(any(it['id'] == job.id for it in items))

    @mock.patch('integrations.views.scheduler_health', return_value={'healthy': False, 'workersAvailable': False, 'cacheAvailable': True, 'message': 'error'})
    def test_health_endpoint_unhealthy(self, scheduler_mock):
        resp = self.client.get('/api/integrations/health/')
        self.assertEqual(resp.status_code, 503)
        self.assertFalse(resp.json()['healthy'])

    def test_secret_key_configuration_flow(self):
        resp = self.client.get('/api/integrations/secret-key/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()['configured'])
        key = Fernet.generate_key().decode('utf-8')
        resp = self.client.post('/api/integrations/secret-key/', {'secretKey': key}, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.json()['configured'])
        resp = self.client.get('/api/integrations/secret-key/')
        self.assertTrue(resp.json()['configured'])

    def test_secret_key_validation(self):
        resp = self.client.post('/api/integrations/secret-key/', {'secretKey': 'invalid'}, format='json')
        self.assertEqual(resp.status_code, 400)
