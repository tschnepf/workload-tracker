from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import NetworkGraphSettings
from projects.models import Project


class NetworkGraphSettingsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(username='ngs_admin', password='pw', is_staff=True)
        self.manager = user_model.objects.create_user(username='ngs_manager', password='pw')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)
        self.project_a = Project.objects.create(name='Omit A', is_active=True)
        self.project_b = Project.objects.create(name='Omit B', is_active=True)

    def test_manager_can_read_but_cannot_write(self):
        self.client.force_authenticate(self.manager)
        get_resp = self.client.get('/api/core/network_graph_settings/')
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK, get_resp.content)
        self.assertIn('defaultWindowMonths', get_resp.json())

        put_resp = self.client.put(
            '/api/core/network_graph_settings/',
            data=get_resp.json(),
            format='json',
        )
        self.assertEqual(put_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_update_and_values_persist(self):
        self.client.force_authenticate(self.admin)
        payload = {
            'defaultWindowMonths': 18,
            'coworkerProjectWeight': 2.5,
            'coworkerWeekWeight': 1.25,
            'coworkerMinScore': 7.0,
            'clientProjectWeight': 5.0,
            'clientWeekWeight': 1.1,
            'clientMinScore': 9.0,
            'includeInactiveDefault': True,
            'maxEdgesDefault': 3000,
            'snapshotSchedulerEnabled': True,
            'snapshotSchedulerDay': 6,
            'snapshotSchedulerHour': 23,
            'snapshotSchedulerMinute': 55,
            'snapshotSchedulerTimezone': 'America/Phoenix',
            'omittedProjectIds': [self.project_a.id, self.project_b.id],
            'lastSnapshotWeekStart': None,
        }
        put_resp = self.client.put('/api/core/network_graph_settings/', data=payload, format='json')
        self.assertEqual(put_resp.status_code, status.HTTP_200_OK, put_resp.content)
        body = put_resp.json()
        self.assertEqual(body['defaultWindowMonths'], 18)
        self.assertEqual(body['maxEdgesDefault'], 3000)
        self.assertEqual(body['omittedProjectIds'], [self.project_a.id, self.project_b.id])
        self.assertEqual([p['name'] for p in body['omittedProjects']], ['Omit A', 'Omit B'])

        obj = NetworkGraphSettings.get_active()
        self.assertEqual(obj.default_window_months, 18)
        self.assertAlmostEqual(float(obj.coworker_project_weight), 2.5)
        self.assertEqual(obj.max_edges_default, 3000)
        self.assertEqual(obj.omitted_project_ids, [self.project_a.id, self.project_b.id])
