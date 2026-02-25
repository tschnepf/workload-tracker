from django.conf import settings as dj_settings
from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from departments.models import Department
from roles.models import Role
from verticals.models import Vertical


class UiBootstrapTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='bootstrap-user', password='x')
        self.client.force_authenticate(user=self.user)

        self.vertical_a = Vertical.objects.create(name='Architecture', short_name='ARCH', is_active=True)
        self.vertical_b = Vertical.objects.create(name='Engineering', short_name='ENG', is_active=False)

        Department.objects.create(name='Design', vertical=self.vertical_a, is_active=True)
        Department.objects.create(name='Dormant Design', vertical=self.vertical_a, is_active=False)
        Department.objects.create(name='Engineering Dept', vertical=self.vertical_b, is_active=True)

        Role.objects.create(name='Bootstrap Active Role', is_active=True, sort_order=10)
        Role.objects.create(name='Bootstrap Inactive Role', is_active=False, sort_order=20)

    def test_default_payload_returns_all_sections_and_only_active_rows(self):
        res = self.client.get('/api/ui/bootstrap/')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data.get('contractVersion'), 1)
        self.assertIn('verticals', data)
        self.assertIn('capabilities', data)
        self.assertIn('departmentsAll', data)
        self.assertIn('rolesAll', data)

        vertical_names = {v['name'] for v in data['verticals']}
        department_names = {d['name'] for d in data['departmentsAll']}
        role_names = {r['name'] for r in data['rolesAll']}

        self.assertIn('Architecture', vertical_names)
        self.assertNotIn('Engineering', vertical_names)
        self.assertIn('Design', department_names)
        self.assertIn('Engineering Dept', department_names)
        self.assertNotIn('Dormant Design', department_names)
        self.assertIn('Bootstrap Active Role', role_names)
        self.assertNotIn('Bootstrap Inactive Role', role_names)

    def test_include_and_filters_return_requested_sections_only(self):
        url = f'/api/ui/bootstrap/?include=departments,roles&vertical={self.vertical_a.id}&include_inactive=1'
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertNotIn('verticals', data)
        self.assertNotIn('capabilities', data)
        self.assertIn('departmentsAll', data)
        self.assertIn('rolesAll', data)

        department_names = {d['name'] for d in data['departmentsAll']}
        role_names = {r['name'] for r in data['rolesAll']}

        self.assertIn('Design', department_names)
        self.assertIn('Dormant Design', department_names)
        self.assertNotIn('Engineering Dept', department_names)
        self.assertIn('Bootstrap Active Role', role_names)
        self.assertIn('Bootstrap Inactive Role', role_names)

    def test_invalid_include_returns_400(self):
        res = self.client.get('/api/ui/bootstrap/?include=departments,unknown')
        self.assertEqual(res.status_code, 400)
        self.assertIn('error', res.json())

    def test_feature_flag_disabled_returns_404(self):
        flags = {**getattr(dj_settings, 'FEATURES', {}), 'FF_UI_BOOTSTRAP': False}
        with override_settings(FEATURES=flags):
            res = self.client.get('/api/ui/bootstrap/')
            self.assertEqual(res.status_code, 404)
