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


class RoleCapacityFilterOutLt5hTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username='role_capacity_filter_user', password='pw')
        self.client.force_authenticate(self.user)

        self.department = Department.objects.create(name='Role Capacity Filter Dept')
        self.role = Role.objects.create(name='Role Capacity Filter Role', is_active=True, sort_order=1)
        self.project = Project.objects.create(name='Role Capacity Filter Project', is_active=True)

        today = date.today()
        self.week0 = today - timedelta(days=(today.weekday() + 1) % 7)
        self.week_keys = [(self.week0 + timedelta(days=7 * idx)).isoformat() for idx in range(4)]

        self.low_person = Person.objects.create(
            name='Low Assignment Person',
            department=self.department,
            role=self.role,
            weekly_capacity=40,
            is_active=True,
        )
        self.high_person = Person.objects.create(
            name='High Assignment Person',
            department=self.department,
            role=self.role,
            weekly_capacity=40,
            is_active=True,
        )

        low_hours = {wk: 2 for wk in self.week_keys}
        high_hours = {wk: 8 for wk in self.week_keys}
        Assignment.objects.create(
            person=self.low_person,
            project=self.project,
            department=self.department,
            weekly_hours=low_hours,
            is_active=True,
        )
        Assignment.objects.create(
            person=self.high_person,
            project=self.project,
            department=self.department,
            weekly_hours=high_hours,
            is_active=True,
        )

    def _role_row(self, payload):
        series = payload.get('series') or []
        self.assertTrue(series)
        by_role = {int(item['roleId']): item for item in series}
        self.assertIn(self.role.id, by_role)
        return by_role[self.role.id]

    def test_filter_out_lt5h_excludes_low_hour_people_from_totals(self):
        baseline_resp = self.client.get(
            '/api/assignments/analytics_role_capacity/',
            {
                'department': self.department.id,
                'weeks': 4,
                'role_ids': str(self.role.id),
                'nocache': 1,
            },
        )
        self.assertEqual(baseline_resp.status_code, status.HTTP_200_OK, baseline_resp.content)
        baseline_payload = baseline_resp.json()
        baseline_row = self._role_row(baseline_payload)

        filtered_resp = self.client.get(
            '/api/assignments/analytics_role_capacity/',
            {
                'department': self.department.id,
                'weeks': 4,
                'role_ids': str(self.role.id),
                'filter_out_lt5h': 1,
                'nocache': 1,
            },
        )
        self.assertEqual(filtered_resp.status_code, status.HTTP_200_OK, filtered_resp.content)
        filtered_payload = filtered_resp.json()
        filtered_row = self._role_row(filtered_payload)

        for week in self.week_keys:
            idx = filtered_payload['weekKeys'].index(week)
            self.assertAlmostEqual(float(baseline_row['assigned'][idx]), 10.0)
            self.assertAlmostEqual(float(baseline_row['capacity'][idx]), 80.0)
            self.assertEqual(int(baseline_row['people'][idx]), 2)

            self.assertAlmostEqual(float(filtered_row['assigned'][idx]), 8.0)
            self.assertAlmostEqual(float(filtered_row['capacity'][idx]), 40.0)
            self.assertEqual(int(filtered_row['people'][idx]), 1)
