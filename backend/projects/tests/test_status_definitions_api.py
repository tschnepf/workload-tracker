from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from projects.models import Project, ProjectStatusDefinition


class ProjectStatusDefinitionsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user(username='user', password='pass')
        self.admin = User.objects.create_user(username='admin', password='pass', is_staff=True)
        self.list_url = '/api/projects/status-definitions/'
        self.detail_url = '/api/projects/status-definitions/{key}/'

    def test_list_returns_seeded_statuses(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(self.list_url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        keys = {item.get('key') for item in data}
        self.assertIn('active', keys)
        self.assertIn('active_ca', keys)

    def test_non_admin_writes_are_forbidden(self):
        self.client.force_authenticate(self.user)
        create_resp = self.client.post(
            self.list_url,
            {'key': 'future', 'label': 'Future', 'colorHex': '#64748b', 'includeInAnalytics': False},
            format='json',
        )
        self.assertEqual(create_resp.status_code, 403)

    def test_admin_can_create_and_patch_but_key_is_immutable(self):
        self.client.force_authenticate(self.admin)
        create_resp = self.client.post(
            self.list_url,
            {
                'key': 'future',
                'label': 'Future',
                'colorHex': '#64748b',
                'includeInAnalytics': True,
                'treatAsCaWhenNoDeliverable': False,
                'isActive': True,
                'sortOrder': 120,
            },
            format='json',
        )
        self.assertEqual(create_resp.status_code, 201)
        patch_resp = self.client.patch(
            self.detail_url.format(key='future'),
            {'label': 'Future Project', 'colorHex': '#334155'},
            format='json',
        )
        self.assertEqual(patch_resp.status_code, 200)
        immutable_resp = self.client.patch(
            self.detail_url.format(key='future'),
            {'key': 'future_projects'},
            format='json',
        )
        self.assertEqual(immutable_resp.status_code, 400)

    def test_delete_blocked_for_system_and_in_use(self):
        self.client.force_authenticate(self.admin)

        # system status
        system_resp = self.client.delete(self.detail_url.format(key='active'))
        self.assertEqual(system_resp.status_code, 409)
        self.assertEqual(system_resp.json().get('code'), 'system_status')

        custom = ProjectStatusDefinition.objects.create(
            key='future',
            label='Future',
            color_hex='#64748b',
            include_in_analytics=False,
            treat_as_ca_when_no_deliverable=False,
            is_system=False,
            is_active=True,
            sort_order=150,
        )
        Project.objects.create(name='Future One', status=custom.key)
        in_use_resp = self.client.delete(self.detail_url.format(key=custom.key))
        self.assertEqual(in_use_resp.status_code, 409)
        self.assertEqual(in_use_resp.json().get('code'), 'in_use')

    def test_unknown_status_rejected_by_project_api(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(
            '/api/projects/',
            {'name': 'Bad Status Project', 'status': 'does_not_exist'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('status', resp.json())

    def test_ca_override_requires_analytics_inclusion(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.post(
            self.list_url,
            {
                'key': 'future_ca',
                'label': 'Future CA',
                'colorHex': '#60a5fa',
                'includeInAnalytics': False,
                'treatAsCaWhenNoDeliverable': True,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('treatAsCaWhenNoDeliverable', resp.json())
