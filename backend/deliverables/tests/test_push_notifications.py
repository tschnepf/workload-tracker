from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserProfile
from assignments.models import Assignment
from core.models import NotificationPreference, WebPushGlobalSettings
from deliverables.models import Deliverable
from departments.models import Department
from people.models import Person
from projects.models import Project


@override_settings(
    WEB_PUSH_ENABLED=True,
    WEB_PUSH_VAPID_PUBLIC_KEY='public',
    WEB_PUSH_VAPID_PRIVATE_KEY='private',
    WEB_PUSH_SUBJECT='mailto:test@example.com',
    WEB_PUSH_DELIVERABLE_DATE_CHANGE_EVENTS_ENABLED=True,
)
class DeliverableDateChangePushTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        self.actor = User.objects.create_user(
            username='actor',
            password='pw',
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(self.actor)
        self.actor_profile, _ = UserProfile.objects.get_or_create(user=self.actor)

        self.recipient_user = User.objects.create_user(username='recipient', password='pw')
        self.recipient_profile, _ = UserProfile.objects.get_or_create(user=self.recipient_user)

        self.department = Department.objects.create(name='Engineering')
        self.project = Project.objects.create(name='Push Project')

        self.recipient_person = Person.objects.create(
            name='Recipient Person',
            weekly_capacity=36,
            department=self.department,
        )
        self.recipient_profile.person = self.recipient_person
        self.recipient_profile.save(update_fields=['person', 'updated_at'])

        Assignment.objects.create(
            project=self.project,
            person=self.recipient_person,
            department=self.department,
            weekly_hours={},
            is_active=True,
        )

        NotificationPreference.objects.update_or_create(
            user=self.recipient_user,
            defaults={
                'web_push_enabled': True,
                'push_deliverable_date_changes': True,
            },
        )

        today = timezone.localdate()
        self.next_deliverable = Deliverable.objects.create(
            project=self.project,
            description='Next',
            date=today + timedelta(days=3),
        )
        self.later_deliverable = Deliverable.objects.create(
            project=self.project,
            description='Later',
            date=today + timedelta(days=28),
        )

    def _set_global_options(self, *, scope: str, within_two_weeks_only: bool):
        cfg = WebPushGlobalSettings.get_active()
        cfg.enabled = True
        cfg.push_deliverable_date_changes_enabled = True
        cfg.push_deliverable_date_change_scope = scope
        cfg.push_deliverable_date_change_within_two_weeks_only = within_two_weeks_only
        cfg.save(
            update_fields=[
                'enabled',
                'push_deliverable_date_changes_enabled',
                'push_deliverable_date_change_scope',
                'push_deliverable_date_change_within_two_weeks_only',
                'updated_at',
            ]
        )

    @patch('deliverables.views.dispatch_event_to_users')
    def test_next_upcoming_scope_only_pushes_for_next_deliverable(self, dispatch_mock):
        self._set_global_options(scope='next_upcoming', within_two_weeks_only=False)

        response = self.client.patch(
            f'/api/deliverables/{self.next_deliverable.id}/',
            {'date': (self.next_deliverable.date + timedelta(days=1)).isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        dispatch_mock.assert_called_once()
        kwargs = dispatch_mock.call_args.kwargs
        self.assertEqual(kwargs.get('user_ids'), [self.recipient_user.id])
        self.assertEqual(kwargs.get('event_key'), 'deliverable.date_changed')

        dispatch_mock.reset_mock()
        response = self.client.patch(
            f'/api/deliverables/{self.later_deliverable.id}/',
            {'date': (self.later_deliverable.date + timedelta(days=1)).isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        dispatch_mock.assert_not_called()

    @patch('deliverables.views.dispatch_event_to_users')
    def test_two_week_window_filters_deliverable_date_change_push(self, dispatch_mock):
        self._set_global_options(scope='all_upcoming', within_two_weeks_only=True)

        response = self.client.patch(
            f'/api/deliverables/{self.next_deliverable.id}/',
            {'date': (self.next_deliverable.date + timedelta(days=2)).isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        dispatch_mock.assert_called_once()

        dispatch_mock.reset_mock()
        response = self.client.patch(
            f'/api/deliverables/{self.later_deliverable.id}/',
            {'date': (self.later_deliverable.date + timedelta(days=2)).isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        dispatch_mock.assert_not_called()

    @patch('deliverables.views.dispatch_event_to_users')
    def test_actor_is_excluded_from_project_assignment_recipient_list(self, dispatch_mock):
        self.recipient_profile.person = None
        self.recipient_profile.save(update_fields=['person', 'updated_at'])
        self.actor_profile.person = self.recipient_person
        self.actor_profile.save(update_fields=['person', 'updated_at'])
        NotificationPreference.objects.update_or_create(
            user=self.actor,
            defaults={'web_push_enabled': True, 'push_deliverable_date_changes': True},
        )
        self.recipient_user.is_active = False
        self.recipient_user.save(update_fields=['is_active'])
        self._set_global_options(scope='next_upcoming', within_two_weeks_only=False)

        response = self.client.patch(
            f'/api/deliverables/{self.next_deliverable.id}/',
            {'date': (self.next_deliverable.date + timedelta(days=1)).isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        dispatch_mock.assert_not_called()
