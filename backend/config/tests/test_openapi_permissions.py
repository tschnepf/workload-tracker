from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework.test import APIClient


class OpenAPIPermissionsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.User = get_user_model()

    def _gated_settings(self):
        base = dict(settings.SPECTACULAR_SETTINGS)
        base['SERVE_PERMISSIONS'] = ['rest_framework.permissions.IsAuthenticated']
        return base

    @override_settings(SPECTACULAR_SETTINGS={'TITLE': 't', 'DESCRIPTION': 'd', 'VERSION': '0', 'SERVE_INCLUDE_SCHEMA': False, 'COMPONENT_SPLIT_REQUEST': True, 'SCHEMA_PATH_PREFIX': r'/api', 'SERVE_PERMISSIONS': ['rest_framework.permissions.IsAuthenticated']})
    def test_anonymous_schema_denied(self):
        resp = self.client.get('/api/schema/')
        self.assertIn(resp.status_code, (401, 403))

    @override_settings(SPECTACULAR_SETTINGS={'TITLE': 't', 'DESCRIPTION': 'd', 'VERSION': '0', 'SERVE_INCLUDE_SCHEMA': False, 'COMPONENT_SPLIT_REQUEST': True, 'SCHEMA_PATH_PREFIX': r'/api', 'SERVE_PERMISSIONS': ['rest_framework.permissions.IsAuthenticated']})
    def test_authenticated_schema_allowed(self):
        user = self.User.objects.create_user(username='u1', password='pw')
        self.client.force_authenticate(user=user)
        resp = self.client.get('/api/schema/')
        self.assertEqual(resp.status_code, 200)

