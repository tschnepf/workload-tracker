from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from unittest import mock
from cryptography.fernet import Fernet

from integrations.registry import get_registry
from integrations.models import (
    IntegrationRule,
    IntegrationJob,
    IntegrationSecretKey,
    IntegrationConnection,
    IntegrationAuditLog,
    IntegrationProvider,
    IntegrationProviderCredential,
)
from integrations.encryption import reset_key_cache
from integrations.oauth import OAuthError

base_rule_config = {
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
}


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
            'environment': 'sandbox',
        }
        resp = self.client.post('/api/integrations/connections/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp.json()['id']

    def _ensure_credentials(self):
        provider = IntegrationProvider.objects.get(key='bqe')
        credential, _ = IntegrationProviderCredential.objects.get_or_create(
            provider=provider,
            defaults={'client_id': 'client', 'redirect_uri': 'http://testserver/api/integrations/providers/bqe/connect/callback', 'encrypted_client_secret': b''},
        )
        credential.client_id = 'client'
        credential.redirect_uri = 'http://testserver/api/integrations/providers/bqe/connect/callback'
        credential.set_client_secret('super-secret')
        credential.save()
        return credential

    @mock.patch('integrations.views._test_connection', return_value={'sampleCount': 1, 'message': 'ok'})
    def test_connection_test_endpoint(self, test_mock):
        connection_id = self._create_connection()
        resp = self.client.post(f'/api/integrations/connections/{connection_id}/test/')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body['ok'])
        self.assertEqual(body['sampleCount'], 1)
        test_mock.assert_called_once()

    @mock.patch('integrations.views._test_connection')
    def test_connection_test_endpoint_handles_error(self, test_mock):
        test_mock.side_effect = ValueError('unsupported provider')
        connection_id = self._create_connection()
        resp = self.client.post(f'/api/integrations/connections/{connection_id}/test/')
        self.assertEqual(resp.status_code, 400)

    @mock.patch('integrations.views._test_connection')
    def test_connection_test_endpoint_handles_oauth_error(self, test_mock):
        test_mock.side_effect = OAuthError('authorize provider first')
        connection_id = self._create_connection()
        resp = self.client.post(f'/api/integrations/connections/{connection_id}/test/')
        self.assertEqual(resp.status_code, 400)

    def test_oauth_start_requires_credentials(self):
        connection_id = self._create_connection()
        resp = self.client.post(
            '/api/integrations/providers/bqe/connect/start/',
            {'connectionId': connection_id},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    @mock.patch('integrations.oauth.requests.post')
    def test_oauth_callback_stores_tokens(self, mock_post):
        connection_id = self._create_connection()
        self._ensure_credentials()
        start_resp = self.client.post(
            '/api/integrations/providers/bqe/connect/start/',
            {'connectionId': connection_id},
            format='json',
        )
        self.assertEqual(start_resp.status_code, 200)
        state = start_resp.json()['state']

        class Dummy:
            status_code = 200

            def json(self_inner):
                return {
                    'access_token': 'abc',
                    'refresh_token': 'def',
                    'expires_in': 3600,
                    'token_type': 'bearer',
                }

        mock_post.return_value = Dummy()
        callback = self.client.get(f'/api/integrations/providers/bqe/connect/callback/?code=auth&state={state}')
        self.assertEqual(callback.status_code, 200)
        connection = IntegrationConnection.objects.get(id=connection_id)
        self.assertTrue(connection.secrets.exists())

    def test_provider_list(self):
        resp = self.client.get('/api/integrations/providers/')
        self.assertEqual(resp.status_code, 200)
        keys = [p['key'] for p in resp.json()]
        self.assertIn('bqe', keys)

    def test_provider_list_forbidden_for_non_admin(self):
        User = get_user_model()
        basic = User.objects.create_user(username='basic', email='basic@example.com', password='pass1234')
        self.client.force_authenticate(basic)
        resp = self.client.get('/api/integrations/providers/')
        self.assertEqual(resp.status_code, 403)
        self.client.force_authenticate(self.user)

    def test_create_connection(self):
        connection_id = self._create_connection()
        self.assertIsInstance(connection_id, int)

    def test_create_connection_rejects_duplicate_environment(self):
        first_id = self._create_connection()
        self.assertIsInstance(first_id, int)
        payload = {
            'providerKey': 'bqe',
            'environment': 'sandbox',
        }
        resp = self.client.post('/api/integrations/connections/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        body = resp.json()
        self.assertIn('environment', body)
        self.assertIn('Sandbox connection', body['environment'][0])

    def test_connection_detail_omits_headers(self):
        connection_id = self._create_connection()
        resp = self.client.get(f'/api/integrations/connections/{connection_id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn('extra_headers', resp.json())

    def test_connection_create_logged(self):
        connection_id = self._create_connection()
        log = IntegrationAuditLog.objects.filter(action='connection.created', connection_id=connection_id).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.user, self.user)

    def test_provider_credentials_flow(self):
        IntegrationSecretKey.set_plaintext(Fernet.generate_key().decode('utf-8'))
        reset_key_cache()
        resp = self.client.get('/api/integrations/providers/bqe/credentials/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()['configured'])
        payload = {
            'clientId': 'abc123',
            'redirectUri': 'https://example.com/callback',
            'clientSecret': 'topsecret',
        }
        resp = self.client.post('/api/integrations/providers/bqe/credentials/', payload, format='json')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data['configured'])
        resp = self.client.get('/api/integrations/providers/bqe/credentials/')
        self.assertEqual(resp.status_code, 200)
        result = resp.json()
        self.assertEqual(result['clientId'], 'abc123')
        self.assertEqual(result['redirectUri'], 'https://example.com/callback')
        self.assertTrue(result['hasClientSecret'])

    def test_provider_credentials_requires_secret_initially(self):
        IntegrationSecretKey.set_plaintext(Fernet.generate_key().decode('utf-8'))
        reset_key_cache()
        payload = {'clientId': 'abc', 'redirectUri': 'https://example.com/cb'}
        resp = self.client.post('/api/integrations/providers/bqe/credentials/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_provider_credentials_requires_admin(self):
        User = get_user_model()
        user = User.objects.create_user(username='limited', email='limited@example.com', password='pass1234')
        self.client.force_authenticate(user)
        resp = self.client.get('/api/integrations/providers/bqe/credentials/')
        self.assertEqual(resp.status_code, 403)
        self.client.force_authenticate(self.user)

    def test_provider_reset_endpoint(self):
        IntegrationSecretKey.set_plaintext(Fernet.generate_key().decode('utf-8'))
        reset_key_cache()
        provider, _ = IntegrationProvider.objects.get_or_create(
            key='bqe',
            defaults={'display_name': 'BQE CORE', 'metadata': {}, 'schema_version': '1.0.0'},
        )
        cred = IntegrationProviderCredential.objects.create(
            provider=provider,
            client_id='abc',
            redirect_uri='https://example.com/cb',
            encrypted_client_secret=b'',
        )
        cred.set_client_secret('topsecret')
        cred.save(update_fields=['encrypted_client_secret'])
        connection_id = self._create_connection()
        resp = self.client.post('/api/integrations/providers/bqe/reset/', {'confirm': True}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(IntegrationConnection.objects.filter(id=connection_id).exists())
        self.assertFalse(IntegrationProviderCredential.objects.filter(provider=provider).exists())

    def test_provider_reset_requires_confirm(self):
        resp = self.client.post('/api/integrations/providers/bqe/reset/', {}, format='json')
        self.assertEqual(resp.status_code, 400)

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

    def test_rule_update_logged(self):
        connection_id = self._create_connection()
        resp = self.client.post('/api/integrations/rules/', {
            'connection_id': connection_id,
            'object_key': 'projects',
            'config': base_rule_config,
            'is_enabled': True,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        rule_id = resp.json()['id']
        patch_resp = self.client.patch(f'/api/integrations/rules/{rule_id}/', {'is_enabled': False}, format='json')
        self.assertEqual(patch_resp.status_code, 200)
        self.assertTrue(IntegrationAuditLog.objects.filter(action='rule.updated', rule_id=rule_id).exists())

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
        rule_id = resp.json()['id']
        self.assertTrue(IntegrationAuditLog.objects.filter(action='rule.created', rule_id=rule_id).exists())

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
        self.assertTrue(IntegrationAuditLog.objects.filter(action='rule.resync', rule_id=rule_id).exists())

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
            metrics={'updated': 2},
        )
        resp = self.client.get('/api/integrations/providers/bqe/jobs/')
        self.assertEqual(resp.status_code, 200, resp.content)
        items = resp.json().get('items') or []
        self.assertTrue(any(it['id'] == job.id for it in items))
        first = items[0]
        self.assertIn('metrics', first)
        self.assertIn('provider', first)

    def test_job_list_filter_by_status(self):
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
        IntegrationJob.objects.create(
            connection=rule.connection,
            provider=rule.connection.provider,
            object_key='projects',
            payload={'rule_id': rule.id},
            status='succeeded',
        )
        failed_job = IntegrationJob.objects.create(
            connection=rule.connection,
            provider=rule.connection.provider,
            object_key='projects',
            payload={'rule_id': rule.id},
            status='failed',
        )
        resp = self.client.get('/api/integrations/providers/bqe/jobs/?status=failed')
        self.assertEqual(resp.status_code, 200)
        items = resp.json().get('items') or []
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['id'], failed_job.id)

    def test_job_retry_is_logged(self):
        connection_id = self._create_connection()
        rule = IntegrationRule.objects.create(
            connection_id=connection_id,
            object_key='projects',
            config=base_rule_config,
            is_enabled=True,
        )
        job = IntegrationJob.objects.create(
            connection=rule.connection,
            provider=rule.connection.provider,
            object_key='projects',
            payload={'rule_id': rule.id},
            status='failed',
        )
        resp = self.client.post(f'/api/integrations/jobs/{job.id}/retry/')
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(IntegrationAuditLog.objects.filter(action='job.retry', rule_id=rule.id).exists())

    @mock.patch('integrations.views.run_integration_rule.apply_async')
    def test_job_retry_endpoint(self, apply_async):
        connection_id = self._create_connection()
        rule = IntegrationRule.objects.create(
            connection_id=connection_id,
            object_key='projects',
            config=base_rule_config,
            is_enabled=True,
        )
        job = IntegrationJob.objects.create(
            connection=rule.connection,
            provider=rule.connection.provider,
            object_key='projects',
            payload={'rule_id': rule.id},
            status='failed',
        )
        resp = self.client.post(f'/api/integrations/jobs/{job.id}/retry/')
        self.assertEqual(resp.status_code, status.HTTP_202_ACCEPTED)
        apply_async.assert_called_once()

    def test_job_retry_requires_rule_id(self):
        connection_id = self._create_connection()
        IntegrationRule.objects.create(
            connection_id=connection_id,
            object_key='projects',
            config=base_rule_config,
            is_enabled=True,
        )
        job = IntegrationJob.objects.create(
            connection_id=connection_id,
            provider_id=IntegrationConnection.objects.get(id=connection_id).provider_id,
            object_key='projects',
            payload={},
            status='failed',
        )
        resp = self.client.post(f'/api/integrations/jobs/{job.id}/retry/')
        self.assertEqual(resp.status_code, 400)

    @mock.patch('integrations.views.scheduler_health', return_value={'healthy': False, 'workersAvailable': False, 'cacheAvailable': True, 'message': 'error'})
    def test_health_endpoint_unhealthy(self, scheduler_mock):
        resp = self.client.get('/api/integrations/health/')
        self.assertEqual(resp.status_code, 503)
        data = resp.json()
        self.assertFalse(data['healthy'])
        self.assertTrue(data['schedulerPaused'])
        self.assertIn('jobs', data)

    @mock.patch('integrations.views.scheduler_health', return_value={'healthy': True, 'workersAvailable': True, 'cacheAvailable': True, 'message': None})
    def test_health_endpoint_includes_metrics(self, scheduler_mock):
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
            status='running',
        )
        job.mark_finished(True, metrics={'updated': 5})
        resp = self.client.get('/api/integrations/health/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data['schedulerPaused'])
        self.assertEqual(data['jobs']['recent']['total'], 1)
        self.assertEqual(data['jobs']['recent']['itemsProcessed'], 5)

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

    @mock.patch('integrations.views.connection_has_token', return_value=True)
    @mock.patch('integrations.views.suggest_project_matches', return_value={'items': [], 'summary': {'total': 0}})
    def test_matching_suggestions_endpoint(self, suggest_mock, token_mock):
        connection_id = self._create_connection()
        resp = self.client.get(f'/api/integrations/providers/bqe/projects/matching/suggestions/?connectionId={connection_id}')
        self.assertEqual(resp.status_code, 200)
        suggest_mock.assert_called_once()
        token_mock.assert_called_once()
        connection = suggest_mock.call_args[0][0]
        self.assertNotIn('legacy_company_id', (connection.extra_headers or {}))
        self.assertNotIn('X-Company-Id', (connection.extra_headers or {}))

    @mock.patch('integrations.views.connection_has_token', return_value=True)
    @mock.patch('integrations.views.confirm_project_matches', return_value={'updated': 2, 'skipped': 0})
    def test_matching_confirm_endpoint(self, confirm_mock, token_mock):
        connection_id = self._create_connection()
        payload = {
            'connectionId': connection_id,
            'matches': [{'externalId': '1', 'projectId': 1}],
            'enableRule': True,
        }
        resp = self.client.post('/api/integrations/providers/bqe/projects/matching/confirm/', payload, format='json')
        self.assertEqual(resp.status_code, 200)
        confirm_mock.assert_called_once()
        token_mock.assert_called_once()

    def test_matching_suggestions_requires_oauth(self):
        connection_id = self._create_connection()
        resp = self.client.get(f'/api/integrations/providers/bqe/projects/matching/suggestions/?connectionId={connection_id}')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_matching_confirm_requires_oauth(self):
        connection_id = self._create_connection()
        payload = {
            'connectionId': connection_id,
            'matches': [{'externalId': '1', 'projectId': 1}],
            'enableRule': False,
        }
        resp = self.client.post('/api/integrations/providers/bqe/projects/matching/confirm/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
