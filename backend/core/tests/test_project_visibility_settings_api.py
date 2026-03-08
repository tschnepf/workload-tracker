from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient


class ProjectVisibilitySettingsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(username='pvs_admin', password='pw', is_staff=True)
        self.manager = user_model.objects.create_user(username='pvs_manager', password='pw')
        self.user = user_model.objects.create_user(username='pvs_user', password='pw')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)

    def test_manager_cannot_read_or_write(self):
        self.client.force_authenticate(self.manager)
        get_resp = self.client.get('/api/core/settings/project-visibility/')
        self.assertEqual(get_resp.status_code, status.HTTP_403_FORBIDDEN)

        put_resp = self.client.put(
            '/api/core/settings/project-visibility/',
            data={'config': {}},
            format='json',
        )
        self.assertEqual(put_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_update_persists_and_normalizes_keywords(self):
        self.client.force_authenticate(self.admin)

        payload = {
            'config': {
                'report.network_graph': {
                    'projectKeywords': ['  Overhead  ', 'overhead', 'Admin Work'],
                    'clientKeywords': [' SMC ', ''],
                },
                'analytics.by_client': {
                    'projectKeywords': ['Internal'],
                    'clientKeywords': ['Acme'],
                },
            }
        }
        put_resp = self.client.put('/api/core/settings/project-visibility/', data=payload, format='json')
        self.assertEqual(put_resp.status_code, status.HTTP_200_OK, put_resp.content)
        body = put_resp.json()
        self.assertEqual(body['config']['report.network_graph']['projectKeywords'], ['overhead', 'admin work'])
        self.assertEqual(body['config']['report.network_graph']['clientKeywords'], ['smc'])
        self.assertEqual(body['config']['analytics.by_client']['projectKeywords'], ['internal'])

        get_resp = self.client.get('/api/core/settings/project-visibility/')
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK, get_resp.content)
        get_body = get_resp.json()
        self.assertEqual(get_body['config']['analytics.by_client']['clientKeywords'], ['acme'])

    def test_validation_rejects_unknown_scope(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.put(
            '/api/core/settings/project-visibility/',
            data={'config': {'invalid.scope': {'projectKeywords': ['x'], 'clientKeywords': []}}},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Unknown scope keys', str(resp.content))

    def test_non_admin_non_manager_forbidden(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get('/api/core/settings/project-visibility/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
