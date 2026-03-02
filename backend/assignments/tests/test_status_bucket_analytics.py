from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from datetime import date, timedelta

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

    def test_status_timeline_excludes_future_hire_hours_pre_hire_week(self):
        future_person = Person.objects.create(
            name='Future Analyst',
            hire_date=date.today() + timedelta(days=14),
        )
        project = Project.objects.create(name='Future Status Project', status='active_ca')
        Assignment.objects.create(
            person=future_person,
            project=project,
            project_name=project.name,
            weekly_hours={self.week_key: 12},
            is_active=True,
        )
        resp = self.client.get('/api/assignments/analytics_status_timeline/?weeks=1')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        series = {item['key']: item['values'] for item in body['series']}
        self.assertEqual(series.get('active_ca', [0])[0], 0.0)

    def test_client_analytics_exclude_future_hire_hours_pre_hire_week(self):
        client_name = 'Acme Future'
        project = Project.objects.create(name='Client Future Project', client=client_name, status='active')
        Assignment.objects.create(
            person=self.person,
            project=project,
            project_name=project.name,
            weekly_hours={self.week_key: 10},
            is_active=True,
        )
        future_person = Person.objects.create(
            name='Future Client Analyst',
            hire_date=date.today() + timedelta(days=21),
        )
        Assignment.objects.create(
            person=future_person,
            project=project,
            project_name=project.name,
            weekly_hours={self.week_key: 15},
            is_active=True,
        )

        by_client = self.client.get('/api/assignments/analytics_by_client/?weeks=1')
        self.assertEqual(by_client.status_code, 200)
        client_totals = {row['label']: row['hours'] for row in by_client.json().get('clients', [])}
        self.assertEqual(client_totals.get(client_name), 10.0)

        by_project = self.client.get(f'/api/assignments/analytics_client_projects/?client={client_name}&weeks=1')
        self.assertEqual(by_project.status_code, 200)
        projects = by_project.json().get('projects', [])
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]['hours'], 10.0)
