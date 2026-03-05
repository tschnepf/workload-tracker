from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import TaskProgressColorSettings


class TaskProgressColorSettingsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(username='tpcs_admin', password='pw', is_staff=True)
        self.manager = user_model.objects.create_user(username='tpcs_manager', password='pw')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)

    def test_manager_can_read_and_update(self):
        self.client.force_authenticate(self.manager)
        get_resp = self.client.get('/api/core/task_progress_colors/')
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK, get_resp.content)
        body = get_resp.json()
        self.assertIn('ranges', body)
        self.assertGreaterEqual(len(body['ranges']), 1)

        payload = {
            'ranges': [
                {'minPercent': 0, 'maxPercent': 50, 'colorHex': '#F59E0B', 'label': 'Low'},
                {'minPercent': 51, 'maxPercent': 100, 'colorHex': '#3B82F6', 'label': 'High'},
            ]
        }
        put_resp = self.client.put('/api/core/task_progress_colors/', data=payload, format='json')
        self.assertEqual(put_resp.status_code, status.HTTP_200_OK, put_resp.content)
        saved = put_resp.json()
        self.assertEqual(len(saved['ranges']), 2)
        self.assertEqual(saved['ranges'][0]['minPercent'], 0)
        self.assertEqual(saved['ranges'][1]['maxPercent'], 100)

        obj = TaskProgressColorSettings.get_active()
        self.assertEqual(len(obj.ranges), 2)

    def test_invalid_ranges_rejected_when_not_covering_full_span(self):
        self.client.force_authenticate(self.manager)
        payload = {
            'ranges': [
                {'minPercent': 0, 'maxPercent': 40, 'colorHex': '#F59E0B'},
                {'minPercent': 50, 'maxPercent': 100, 'colorHex': '#3B82F6'},
            ]
        }
        resp = self.client.put('/api/core/task_progress_colors/', data=payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertIn('ranges', resp.json())

    def test_auth_required(self):
        resp = self.client.get('/api/core/task_progress_colors/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
