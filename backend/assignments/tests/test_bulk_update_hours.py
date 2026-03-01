from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from assignments.models import Assignment
from assignments.models import AssignmentWeekHour
from people.models import Person
from projects.models import Project


def _current_sunday() -> str:
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7
    return (today - timedelta(days=days_since_sunday)).isoformat()


class BulkUpdateHoursTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='bulk-updater',
            password='x',
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(self.user)

        self.project = Project.objects.create(name='Bulk Update Project')
        self.person = Person.objects.create(name='Bulk Person')
        sunday = _current_sunday()
        self.assignment_a = Assignment.objects.create(
            person=self.person,
            project=self.project,
            weekly_hours={sunday: 8},
            is_active=True,
        )
        self.assignment_b = Assignment.objects.create(
            person=self.person,
            project=self.project,
            weekly_hours={sunday: 4},
            is_active=True,
        )
        self.sunday = sunday

    def test_bulk_update_hours_reports_structured_per_item_statuses(self):
        payload = {
            'updates': [
                {'assignmentId': self.assignment_a.id, 'weeklyHours': {self.sunday: 8}},   # noop
                {'assignmentId': self.assignment_b.id, 'weeklyHours': {self.sunday: 12}},  # ok
                {'assignmentId': 999999999, 'weeklyHours': {self.sunday: 5}},              # missing
                {'assignmentId': self.assignment_a.id, 'weeklyHours': {self.sunday: -1}},  # invalid (last write wins)
            ]
        }
        response = self.client.patch('/api/assignments/bulk_update_hours/', payload, format='json')
        self.assertEqual(response.status_code, 200)
        body = response.json()

        self.assertFalse(body.get('success'))
        results = {row['assignmentId']: row for row in body.get('results', [])}

        # assignment_a is invalid because the final deduped payload for this id is negative.
        self.assertEqual(results[self.assignment_a.id]['status'], 'invalid')
        self.assertEqual(results[self.assignment_b.id]['status'], 'ok')
        self.assertEqual(results[999999999]['status'], 'missing')

        self.assignment_a.refresh_from_db()
        self.assignment_b.refresh_from_db()
        self.assertEqual(float(self.assignment_a.weekly_hours[self.sunday]), 8.0)
        self.assertEqual(float(self.assignment_b.weekly_hours[self.sunday]), 12.0)
        self.assertTrue(
            AssignmentWeekHour.objects.filter(
                assignment_id=self.assignment_b.id,
                week_start=date.fromisoformat(self.sunday),
                hours=12.0,
            ).exists()
        )

    def test_bulk_update_hours_requires_non_empty_updates(self):
        response = self.client.patch('/api/assignments/bulk_update_hours/', {'updates': []}, format='json')
        self.assertEqual(response.status_code, 400)
