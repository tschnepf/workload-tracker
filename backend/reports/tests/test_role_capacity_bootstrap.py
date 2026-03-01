from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from assignments.models import Assignment
from departments.models import Department
from people.models import Person
from projects.models import Project
from roles.models import Role
from verticals.models import Vertical


class RoleCapacityBootstrapApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username='bootstrap_summary_user', password='pw')
        self.client.force_authenticate(self.user)

        vertical = Vertical.objects.create(name='Bootstrap Vertical')
        department = Department.objects.create(name='Bootstrap Department', vertical=vertical, is_active=True)
        project = Project.objects.create(name='Bootstrap Project', vertical=vertical, is_active=True)
        role = Role.objects.create(name='Bootstrap Role', is_active=True, sort_order=1)
        person = Person.objects.create(
            name='Bootstrap Person',
            department=department,
            role=role,
            weekly_capacity=40,
            is_active=True,
        )
        today = date.today()
        sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        Assignment.objects.create(
            person=person,
            project=project,
            weekly_hours={sunday.isoformat(): 10},
            is_active=True,
        )

    def test_bootstrap_includes_summary_and_forecast_series_fields(self):
        resp = self.client.get('/api/reports/role-capacity/bootstrap/?weeks=4')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()
        self.assertIn('summary', payload)
        self.assertIn('timeline', payload)
        self.assertIn('series', payload['timeline'])
        if payload['timeline']['series']:
            row = payload['timeline']['series'][0]
            self.assertIn('assigned', row)
            self.assertIn('capacity', row)
            self.assertIn('projected', row)
            self.assertIn('demand', row)
