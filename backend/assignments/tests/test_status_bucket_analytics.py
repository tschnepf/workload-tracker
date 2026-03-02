from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from datetime import date

from assignments.models import Assignment
from core.week_utils import sunday_of_week
from people.models import Person
from projects.models import Project, ProjectStatusDefinition


class StatusAnalyticsInclusionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='analytics', password='pass')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.week_key = sunday_of_week(date.today()).isoformat()
        self.person = Person.objects.create(name='Analyst')

    def _assignment(self, project: Project, hours: float):
        Assignment.objects.create(
            person=self.person,
            project=project,
            project_name=project.name,
            weekly_hours={self.week_key: hours},
            is_active=True,
        )

    def test_status_timeline_groups_by_included_statuses(self):
        ProjectStatusDefinition.objects.update_or_create(
            key='future',
            defaults={
                'label': 'Future',
                'color_hex': '#64748b',
                'include_in_analytics': True,
                'treat_as_ca_when_no_deliverable': False,
                'is_system': False,
                'is_active': True,
                'sort_order': 200,
            },
        )
        p_active = Project.objects.create(name='A', status='future')
        p_ca = Project.objects.create(name='B', status='active_ca')
        p_other = Project.objects.create(name='C', status='on_hold')
        self._assignment(p_active, 10)
        self._assignment(p_ca, 6)
        self._assignment(p_other, 4)

        resp = self.client.get('/api/assignments/analytics_status_timeline/?weeks=1')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        series = {item['key']: item['values'] for item in body['series']}
        self.assertEqual(series.get('future', [0])[0], 10.0)
        self.assertEqual(series.get('active_ca', [0])[0], 6.0)
        self.assertNotIn('on_hold', series)
        self.assertEqual(body['totalByWeek'][0], 16.0)

    def test_deliverable_timeline_uses_status_ca_override(self):
        ProjectStatusDefinition.objects.update_or_create(
            key='future_ca',
            defaults={
                'label': 'Future CA',
                'color_hex': '#60a5fa',
                'include_in_analytics': True,
                'treat_as_ca_when_no_deliverable': True,
                'is_system': False,
                'is_active': True,
                'sort_order': 210,
            },
        )
        p_active = Project.objects.create(name='A', status='active')
        p_ca = Project.objects.create(name='B', status='future_ca')
        self._assignment(p_active, 8)
        self._assignment(p_ca, 5)

        payload_resp = self.client.get('/api/assignments/analytics_deliverable_timeline/?weeks=1')
        self.assertEqual(payload_resp.status_code, 200)
        payload = payload_resp.json()
        self.assertEqual(payload['totalByWeek'][0], 13.0)
        # no deliverables + CA override enabled => CA classification
        self.assertEqual(payload['series']['ca'][0], 5.0)
