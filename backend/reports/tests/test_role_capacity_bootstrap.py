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
        self.department = Department.objects.create(name='Bootstrap Department', vertical=vertical, is_active=True)
        self.project = Project.objects.create(name='Bootstrap Project', vertical=vertical, is_active=True)
        self.role = Role.objects.create(name='Bootstrap Role', is_active=True, sort_order=1)
        person = Person.objects.create(
            name='Bootstrap Person',
            department=self.department,
            role=self.role,
            weekly_capacity=40,
            is_active=True,
        )
        today = date.today()
        self.sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        Assignment.objects.create(
            person=person,
            project=self.project,
            weekly_hours={self.sunday.isoformat(): 10},
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

    def test_bootstrap_filter_out_lt5h_excludes_low_hour_people(self):
        low_person = Person.objects.create(
            name='Bootstrap Low Person',
            department=self.department,
            role=self.role,
            weekly_capacity=40,
            is_active=True,
        )
        Assignment.objects.create(
            person=low_person,
            project=self.project,
            weekly_hours={self.sunday.isoformat(): 2},
            is_active=True,
        )

        baseline = self.client.get(
            '/api/reports/role-capacity/bootstrap/',
            {'weeks': 4, 'department': self.department.id, 'role_ids': str(self.role.id)},
        )
        self.assertEqual(baseline.status_code, status.HTTP_200_OK, baseline.content)
        baseline_payload = baseline.json()
        baseline_series = baseline_payload['timeline']['series']
        self.assertTrue(baseline_series)
        baseline_row = baseline_series[0]
        week0 = self.sunday.isoformat()
        idx0 = baseline_payload['timeline']['weekKeys'].index(week0)
        self.assertAlmostEqual(float(baseline_row['assigned'][idx0]), 12.0)
        self.assertAlmostEqual(float(baseline_row['capacity'][idx0]), 80.0)
        self.assertEqual(int(baseline_row['people'][idx0]), 2)

        filtered = self.client.get(
            '/api/reports/role-capacity/bootstrap/',
            {
                'weeks': 4,
                'department': self.department.id,
                'role_ids': str(self.role.id),
                'filter_out_lt5h': 1,
            },
        )
        self.assertEqual(filtered.status_code, status.HTTP_200_OK, filtered.content)
        filtered_payload = filtered.json()
        filtered_series = filtered_payload['timeline']['series']
        self.assertTrue(filtered_series)
        filtered_row = filtered_series[0]
        idx0 = filtered_payload['timeline']['weekKeys'].index(week0)
        self.assertAlmostEqual(float(filtered_row['assigned'][idx0]), 10.0)
        self.assertAlmostEqual(float(filtered_row['capacity'][idx0]), 40.0)
        self.assertEqual(int(filtered_row['people'][idx0]), 1)

    def test_bootstrap_allows_52_week_horizon(self):
        resp = self.client.get('/api/reports/role-capacity/bootstrap/?weeks=52')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()
        self.assertEqual(len(payload.get('timeline', {}).get('weekKeys', [])), 52)
