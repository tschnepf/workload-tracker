from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import UserProfile
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
        self.affected_user = User.objects.create_user(username='recipient', password='x')
        profile, _ = UserProfile.objects.get_or_create(user=self.affected_user)
        profile.person = self.person
        profile.save(update_fields=['person', 'updated_at'])
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

    def test_bulk_update_hours_rejects_pre_hire_week_writes(self):
        sunday_date = date.fromisoformat(self.sunday)
        self.person.hire_date = sunday_date + timedelta(days=14)
        self.person.save(update_fields=['hire_date', 'updated_at'])

        response = self.client.patch(
            '/api/assignments/bulk_update_hours/',
            {
                'updates': [
                    {'assignmentId': self.assignment_a.id, 'weeklyHours': {self.sunday: 6}},
                ]
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body.get('code'), 'PRE_HIRE_WEEK_LOCKED')
        self.assertEqual(body.get('detail'), 'Cannot assign hours before employee hire week')

    def test_bulk_update_hours_ignores_unchanged_prehire_weeks(self):
        sunday_date = date.fromisoformat(self.sunday)
        eligible_week = (sunday_date + timedelta(days=14)).isoformat()
        self.person.hire_date = sunday_date + timedelta(days=14)
        self.person.save(update_fields=['hire_date', 'updated_at'])
        self.assignment_a.weekly_hours = {
            self.sunday: 8,      # pre-hire for this person (unchanged in request)
            eligible_week: 4,    # eligible week (changed in request)
        }
        self.assignment_a.save(update_fields=['weekly_hours', 'updated_at'])

        response = self.client.patch(
            '/api/assignments/bulk_update_hours/',
            {
                'updates': [
                    {
                        'assignmentId': self.assignment_a.id,
                        'weeklyHours': {self.sunday: 8, eligible_week: 10},
                    },
                ]
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assignment_a.refresh_from_db()
        self.assertEqual(float(self.assignment_a.weekly_hours[self.sunday]), 8.0)
        self.assertEqual(float(self.assignment_a.weekly_hours[eligible_week]), 10.0)

    def test_update_assignment_rejects_changed_prehire_week_write(self):
        sunday_date = date.fromisoformat(self.sunday)
        self.person.hire_date = sunday_date + timedelta(days=14)
        self.person.save(update_fields=['hire_date', 'updated_at'])

        response = self.client.patch(
            f'/api/assignments/{self.assignment_a.id}/',
            {'weeklyHours': {self.sunday: 6}},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body.get('code'), 'PRE_HIRE_WEEK_LOCKED')
        self.assertEqual(body.get('detail'), 'Cannot assign hours before employee hire week')

    def test_update_assignment_ignores_unchanged_prehire_weeks(self):
        sunday_date = date.fromisoformat(self.sunday)
        eligible_week = (sunday_date + timedelta(days=14)).isoformat()
        self.person.hire_date = sunday_date + timedelta(days=14)
        self.person.save(update_fields=['hire_date', 'updated_at'])
        self.assignment_a.weekly_hours = {
            self.sunday: 8,      # pre-hire for this person (unchanged in request)
            eligible_week: 4,    # eligible week (changed in request)
        }
        self.assignment_a.save(update_fields=['weekly_hours', 'updated_at'])

        response = self.client.patch(
            f'/api/assignments/{self.assignment_a.id}/',
            {'weeklyHours': {self.sunday: 8, eligible_week: 12}},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assignment_a.refresh_from_db()
        self.assertEqual(float(self.assignment_a.weekly_hours[self.sunday]), 8.0)
        self.assertEqual(float(self.assignment_a.weekly_hours[eligible_week]), 12.0)

    def test_create_assignment_rejects_pre_hire_week_writes(self):
        sunday_date = date.fromisoformat(self.sunday)
        self.person.hire_date = sunday_date + timedelta(days=14)
        self.person.save(update_fields=['hire_date', 'updated_at'])

        response = self.client.post(
            '/api/assignments/',
            {
                'person': self.person.id,
                'project': self.project.id,
                'weeklyHours': {self.sunday: 8},
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body.get('code'), 'PRE_HIRE_WEEK_LOCKED')
        self.assertEqual(body.get('detail'), 'Cannot assign hours before employee hire week')

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_ASSIGNMENT_EVENTS_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('assignments.views.dispatch_event_to_users')
    def test_bulk_update_hours_queues_assignment_push_summary(self, dispatch_mock):
        payload = {
            'updates': [
                {'assignmentId': self.assignment_b.id, 'weeklyHours': {self.sunday: 14}},
            ]
        }
        response = self.client.patch('/api/assignments/bulk_update_hours/', payload, format='json')
        self.assertEqual(response.status_code, 200)
        dispatch_mock.assert_called_once()
        kwargs = dispatch_mock.call_args.kwargs
        self.assertEqual(kwargs.get('user_ids'), [self.affected_user.id])
        self.assertEqual(kwargs.get('event_key'), 'assignment.bulk_updated')
