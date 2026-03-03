from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from integrations.models import (
    AuthMethodPolicy,
    IntegrationConnection,
    IntegrationProvider,
    IntegrationSetting,
)
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

    def test_azure_status_endpoint(self):
        res = self.client.get('/api/integrations/providers/azure/status/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['connected'])
        self.assertEqual(data['connectionId'], self.connection.id)

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
