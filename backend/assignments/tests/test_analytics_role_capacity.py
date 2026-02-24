from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate
from unittest.mock import patch

from assignments.views import AssignmentViewSet
from roles.models import Role


class AnalyticsRoleCapacityTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        User = get_user_model()
        self.user = User.objects.create_user(username='analytics_user', password='pw')
        Role.objects.create(name='Electrical Engineer', is_active=True)

    def test_nocache_path_returns_200(self):
        # Regression guard: nocache=1 used to trigger UnboundLocalError on cache_key.
        request = self.factory.get('/api/assignments/analytics_role_capacity/?weeks=12&nocache=1')
        force_authenticate(request, user=self.user)
        view = AssignmentViewSet.as_view({'get': 'analytics_role_capacity'})
        with patch('assignments.views.compute_role_capacity', return_value=([], [], [])):
            resp = view(request)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data
        self.assertIn('weekKeys', data)
        self.assertIn('roles', data)
        self.assertIn('series', data)
