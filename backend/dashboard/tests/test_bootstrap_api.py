from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from departments.models import Department
from people.models import Person
from projects.models import Project
from roles.models import Role


class DashboardBootstrapApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username='dashboard-bootstrap-user',
            email='dashboard-bootstrap@example.com',
            password='password-123',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.user)

        self.department = Department.objects.create(name=f'Engineering {self._testMethodName}')
        self.role = Role.objects.create(name=f'Engineer {self._testMethodName}')
        self.person = Person.objects.create(
            name='Casey Engineer',
            department=self.department,
            role=self.role,
            weekly_capacity=40,
        )

        Project.objects.create(name='Atlas', status='active', is_active=True)
        Project.objects.create(name='Nova', status='planning', is_active=True)

    def test_bootstrap_returns_dashboard_project_counts_and_people_meta(self):
        future_person = Person.objects.create(
            name='Future Engineer',
            department=self.department,
            role=self.role,
            weekly_capacity=40,
            hire_date=date.today() + timedelta(days=14),
        )
        response = self.client.get('/api/dashboard/bootstrap/?weeks=2')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payload = response.json()
        self.assertEqual(payload.get('contractVersion'), 1)
        self.assertIn('dashboard', payload)
        self.assertIn('projectCountsByStatus', payload)
        self.assertIn('projectsTotal', payload)
        self.assertIn('peopleMeta', payload)

        self.assertEqual(payload.get('projectsTotal'), 2)
        self.assertEqual(payload.get('projectCountsByStatus', {}).get('active'), 1)
        self.assertEqual(payload.get('projectCountsByStatus', {}).get('planning'), 1)

        people_meta_ids = [row.get('id') for row in payload.get('peopleMeta', [])]
        self.assertIn(self.person.id, people_meta_ids)
        self.assertNotIn(future_person.id, people_meta_ids)

    def test_bootstrap_respects_feature_flag(self):
        original = settings.FEATURES.get('FF_MODERATE_PAGES_SNAPSHOTS', True)
        settings.FEATURES['FF_MODERATE_PAGES_SNAPSHOTS'] = False
        try:
            response = self.client.get('/api/dashboard/bootstrap/')
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        finally:
            settings.FEATURES['FF_MODERATE_PAGES_SNAPSHOTS'] = original
