from django.contrib.auth import get_user_model
from django.test import override_settings
from unittest import mock
from rest_framework.test import APITestCase

from integrations.models import (
    AuthMethodPolicy,
    IntegrationConnection,
    IntegrationProviderCredential,
    IntegrationSecretKey,
    IntegrationProvider,
    IntegrationSetting,
)
from integrations.encryption import reset_key_cache
from departments.models import Department
from roles.models import Role


class AzureIntegrationsApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username='azure-admin',
            email='azure-admin@example.com',
            password='pass1234',
        )
        self.client.force_authenticate(self.admin)
        self.provider, _ = IntegrationProvider.objects.get_or_create(
            key='azure',
            defaults={
                'display_name': 'Microsoft Entra ID',
                'metadata': {},
                'schema_version': '1.0.0',
            },
        )
        self.connection = IntegrationConnection.objects.create(
            provider=self.provider,
            environment='production',
            is_active=True,
            is_disabled=False,
        )
        AuthMethodPolicy.objects.all().delete()

    def tearDown(self):
        reset_key_cache()

    def _set_scim_token(self, token='scim-secret-1'):
        token_res = self.client.post(
            '/api/integrations/providers/azure/scim/token/',
            {'token': token},
            format='json',
        )
        self.assertEqual(token_res.status_code, 200)
        return token

    @staticmethod
    def _jwt_with_tid(tid: str) -> str:
        import base64
        import json

        def enc(payload: dict) -> str:
            raw = json.dumps(payload, separators=(',', ':')).encode('utf-8')
            return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')

        return f"{enc({'alg': 'none', 'typ': 'JWT'})}.{enc({'tid': tid})}.sig"

    def test_azure_status_endpoint(self):
        res = self.client.get('/api/integrations/providers/azure/status/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['connected'])
        self.assertEqual(data['connectionId'], self.connection.id)
        self.assertIn('graphPermissionReady', data)
        self.assertIn('tenantEnforced', data)

    def test_department_and_role_mapping_round_trip(self):
        dept = Department.objects.create(name='Architecture')
        role = Role.objects.create(name='Architect')

        dept_res = self.client.post(
            '/api/integrations/providers/azure/mappings/departments/',
            {'sourceValue': 'Architecture', 'departmentId': dept.id},
            format='json',
        )
        self.assertEqual(dept_res.status_code, 200)
        dept_items = dept_res.json().get('items') or []
        self.assertEqual(len(dept_items), 1)
        self.assertEqual(dept_items[0]['departmentId'], dept.id)

        role_res = self.client.post(
            '/api/integrations/providers/azure/mappings/roles/',
            {'sourceValue': 'Architect', 'roleId': role.id},
            format='json',
        )
        self.assertEqual(role_res.status_code, 200)
        role_items = role_res.json().get('items') or []
        self.assertEqual(len(role_items), 1)
        self.assertEqual(role_items[0]['roleId'], role.id)

    def test_reconciliation_refresh_creates_record_from_snapshot(self):
        IntegrationSetting.objects.update_or_create(
            connection=self.connection,
            key='azure.directory_snapshot',
            defaults={
                'data': {
                    'items': [
                        {
                            'tenant_id': 'tenant-1',
                            'azure_oid': 'oid-1',
                            'upn': 'new.user@example.com',
                            'email': 'new.user@example.com',
                            'display_name': 'New User',
                            'department': 'Architecture',
                            'job_title': 'Architect',
                            'active': True,
                            'assigned_to_app': True,
                            'user_type': 'Member',
                        }
                    ]
                }
            },
        )
        refresh = self.client.post('/api/integrations/providers/azure/migration/reconciliation/refresh/', {}, format='json')
        self.assertEqual(refresh.status_code, 200)
        self.assertEqual(refresh.json().get('total'), 1)
        listing = self.client.get('/api/integrations/providers/azure/migration/reconciliation/')
        self.assertEqual(listing.status_code, 200)
        items = listing.json().get('items') or []
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['status'], 'unmatched')

    def test_scim_create_requires_bearer_token(self):
        response = self.client.post(
            '/api/integrations/providers/azure/scim/v2/Users',
            {
                'externalId': 'oid-unauthorized',
                'userName': 'unauthorized@example.com',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 401)
        self.assertTrue(response['Content-Type'].startswith('application/scim+json'))

    @override_settings(AZURE_SSO_TENANT_ID='tenant-allowed')
    def test_scim_create_skips_wrong_tenant(self):
        token = self._set_scim_token()

        response = self.client.post(
            '/api/integrations/providers/azure/scim/v2/Users',
            {
                'externalId': 'oid-wrong-tenant',
                'tenantId': 'tenant-other',
                'userName': 'wrong.tenant@example.com',
                'active': True,
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {token}',
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response['Content-Type'].startswith('application/scim+json'))
        self.assertEqual(response.json().get('scimType'), 'invalidValue')

    def test_scim_discovery_endpoints(self):
        token = self._set_scim_token()
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
        spc = self.client.get('/api/integrations/providers/azure/scim/v2/ServiceProviderConfig', **headers)
        self.assertEqual(spc.status_code, 200)
        self.assertTrue(spc['Content-Type'].startswith('application/scim+json'))
        self.assertIn('patch', spc.json())

        schemas = self.client.get('/api/integrations/providers/azure/scim/v2/Schemas', **headers)
        self.assertEqual(schemas.status_code, 200)
        self.assertTrue(schemas['Content-Type'].startswith('application/scim+json'))
        self.assertEqual(schemas.json().get('schemas'), ['urn:ietf:params:scim:api:messages:2.0:ListResponse'])

        types_res = self.client.get('/api/integrations/providers/azure/scim/v2/ResourceTypes', **headers)
        self.assertEqual(types_res.status_code, 200)
        self.assertTrue(types_res['Content-Type'].startswith('application/scim+json'))
        self.assertEqual(types_res.json().get('Resources')[0].get('id'), 'User')

    @override_settings(AZURE_SSO_TENANT_ID='tenant-allowed')
    def test_scim_create_list_get_delete_flow(self):
        token = self._set_scim_token()
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
        create = self.client.post(
            '/api/integrations/providers/azure/scim/v2/Users',
            {
                'externalId': 'oid-123',
                'tenantId': 'tenant-allowed',
                'userName': 'new.user@example.com',
                'displayName': 'New User',
                'emails': [{'value': 'new.user@example.com', 'primary': True}],
                'active': True,
            },
            format='json',
            **headers,
        )
        self.assertEqual(create.status_code, 201)
        body = create.json()
        self.assertEqual(body.get('id'), 'oid-123')
        self.assertEqual(body.get('userName'), 'new.user@example.com')

        listing = self.client.get('/api/integrations/providers/azure/scim/v2/Users?filter=userName%20eq%20%22new.user@example.com%22', **headers)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json().get('totalResults'), 1)

        detail = self.client.get('/api/integrations/providers/azure/scim/v2/Users/oid-123', **headers)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json().get('id'), 'oid-123')

        deleted = self.client.delete('/api/integrations/providers/azure/scim/v2/Users/oid-123', **headers)
        self.assertEqual(deleted.status_code, 204)

    @override_settings(AZURE_SSO_TENANT_ID='tenant-allowed')
    def test_scim_duplicate_create_conflict(self):
        token = self._set_scim_token()
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
        payload = {
            'externalId': 'oid-dup',
            'tenantId': 'tenant-allowed',
            'userName': 'dup.user@example.com',
            'active': True,
        }
        first = self.client.post('/api/integrations/providers/azure/scim/v2/Users', payload, format='json', **headers)
        self.assertEqual(first.status_code, 201)
        second = self.client.post('/api/integrations/providers/azure/scim/v2/Users', payload, format='json', **headers)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json().get('scimType'), 'uniqueness')

    def test_scim_invalid_filter_returns_scim_error(self):
        token = self._set_scim_token()
        response = self.client.get(
            '/api/integrations/providers/azure/scim/v2/Users?filter=userName%20co%20%22bad%22',
            HTTP_AUTHORIZATION=f'Bearer {token}',
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response['Content-Type'].startswith('application/scim+json'))
        self.assertEqual(response.json().get('scimType'), 'invalidFilter')

    @mock.patch('integrations.azure_views.ensure_graph_permission_ready')
    def test_reconcile_now_blocked_when_graph_permission_missing(self, ensure_permission):
        ensure_permission.side_effect = Exception('Admin consent for User.Read.All is required')
        response = self.client.post(
            '/api/integrations/providers/azure/provisioning/reconcile-now/',
            {'includeGraph': True},
            format='json',
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn('detail', response.json())

    @mock.patch('integrations.azure_views.probe_graph_user_read_all')
    def test_provisioning_validate_endpoint(self, probe_mock):
        probe_mock.return_value = {
            'ready': False,
            'reason': 'Admin consent required',
            'requiredPermission': 'User.Read.All',
            'checkedAt': '2026-03-03T00:00:00Z',
        }
        response = self.client.post('/api/integrations/providers/azure/provisioning/validate/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body.get('ok'))
        self.assertIn('graphPermission', body)

    @override_settings(AZURE_SSO_TENANT_ID='tenant-allowed', OAUTH_POPUP_ALLOWED_ORIGINS=['http://testserver'])
    @mock.patch('integrations.oauth.requests.post')
    def test_provider_oauth_callback_rejects_wrong_tenant_token(self, mock_post):
        IntegrationSecretKey.set_plaintext('HfSxIy0Qoq2o8xGOuNhM-vnrA7TBf61WRhmbYz0IPb8=')
        reset_key_cache()
        credential, _ = IntegrationProviderCredential.objects.get_or_create(provider=self.provider)
        credential.client_id = 'azure-client-id'
        credential.redirect_uri = 'http://testserver/api/integrations/providers/azure/connect/callback/'
        credential.set_client_secret('azure-client-secret')
        credential.save()

        start = self.client.post(
            '/api/integrations/providers/azure/connect/start/',
            {'connectionId': self.connection.id},
            format='json',
        )
        self.assertEqual(start.status_code, 200)
        state = start.json()['state']

        class Dummy:
            status_code = 200

            def json(self_inner):
                return {
                    'access_token': AzureIntegrationsApiTests._jwt_with_tid('tenant-other'),
                    'id_token': AzureIntegrationsApiTests._jwt_with_tid('tenant-other'),
                    'refresh_token': 'refresh-token',
                    'expires_in': 3600,
                    'token_type': 'bearer',
                }

        mock_post.return_value = Dummy()
        callback = self.client.get(f'/api/integrations/providers/azure/connect/callback/?code=auth&state={state}')
        self.assertEqual(callback.status_code, 200)
        html = callback.content.decode('utf-8')
        self.assertIn('tenant mismatch', html.lower())
        self.assertFalse(self.connection.secrets.exists())

    def test_directory_departments_and_groups_from_snapshot(self):
        dept = Department.objects.create(name='Architecture')
        self.client.post(
            '/api/integrations/providers/azure/mappings/departments/',
            {'sourceValue': 'Architecture', 'departmentId': dept.id},
            format='json',
        )
        IntegrationSetting.objects.update_or_create(
            connection=self.connection,
            key='azure.directory_snapshot',
            defaults={
                'data': {
                    'items': [
                        {
                            'tenant_id': 'tenant-1',
                            'azure_oid': 'oid-1',
                            'department': 'Architecture',
                            'groups': [{'id': 'g1', 'displayName': 'Staff'}],
                        },
                        {
                            'tenant_id': 'tenant-1',
                            'azure_oid': 'oid-2',
                            'department': 'Architecture',
                            'groups': ['Staff', 'Engineering'],
                        },
                    ]
                }
            },
        )
        depts_res = self.client.get('/api/integrations/providers/azure/directory/departments/')
        self.assertEqual(depts_res.status_code, 200)
        dept_items = depts_res.json().get('items') or []
        self.assertEqual(len(dept_items), 1)
        self.assertEqual(dept_items[0]['value'], 'Architecture')
        self.assertEqual(dept_items[0]['count'], 2)
        self.assertEqual(dept_items[0]['mappedDepartmentId'], dept.id)

        groups_res = self.client.get('/api/integrations/providers/azure/directory/groups/')
        self.assertEqual(groups_res.status_code, 200)
        group_items = groups_res.json().get('items') or []
        group_names = [item.get('value') for item in group_items]
        self.assertIn('Staff', group_names)
        self.assertIn('Engineering', group_names)
