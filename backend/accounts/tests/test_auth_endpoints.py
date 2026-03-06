from django.test import TestCase
from django.contrib.auth import get_user_model
from django.conf import settings
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework import status

from people.models import Person
from projects.models import Project
from integrations.models import AuthMethodPolicy
from core.models import InAppNotification, NotificationPreference, WebPushGlobalSettings, WebPushProjectMute


class AuthEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        # Regular user
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='testpass123')
        # Staff user for overrides
        self.staff = User.objects.create_user(username='staff', email='staff@example.com', password='testpass123', is_staff=True)
        AuthMethodPolicy.objects.all().delete()

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_token_obtain_and_refresh(self):
        # Obtain pair
        resp = self.client.post('/api/token/', { 'username': 'alice', 'password': 'testpass123' }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        access = resp.data.get('access')
        refresh = resp.data.get('refresh')
        self.assertTrue(access)
        if not refresh:
            refresh = resp.cookies.get(settings.REFRESH_COOKIE_NAME).value if resp.cookies.get(settings.REFRESH_COOKIE_NAME) else None
        self.assertTrue(refresh)

        # Refresh
        refresh_payload = { 'refresh': refresh } if resp.data.get('refresh') else {}
        resp2 = self.client.post('/api/token/refresh/', refresh_payload, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertTrue(resp2.data.get('access'))

    def test_password_login_blocked_when_azure_enforced(self):
        policy = AuthMethodPolicy.get_solo()
        policy.azure_sso_enabled = True
        policy.azure_sso_enforced = True
        policy.password_login_enabled_non_break_glass = False
        policy.break_glass_user = self.staff
        policy.save()
        resp = self.client.post('/api/token/', {'username': 'alice', 'password': 'testpass123'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_password_login_allows_break_glass_when_enforced(self):
        policy = AuthMethodPolicy.get_solo()
        policy.azure_sso_enabled = True
        policy.azure_sso_enforced = True
        policy.password_login_enabled_non_break_glass = False
        policy.break_glass_user = self.staff
        policy.save()
        resp = self.client.post('/api/token/', {'username': 'staff', 'password': 'testpass123'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_me_and_settings_update(self):
        self._auth(self.user)
        # me
        resp = self.client.get('/api/auth/me/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['user']['username'], 'alice')

        # Update settings with unknown keys (should be dropped)
        payload = {
            'settings': {
                'defaultDepartmentId': None,
                'includeChildren': True,
                'theme': 'dark',
                'unknownKey': 'ignored',
            }
        }
        resp2 = self.client.patch('/api/auth/settings/', payload, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        s = resp2.data.get('settings') or {}
        self.assertIn('includeChildren', s)
        self.assertIn('theme', s)
        self.assertNotIn('unknownKey', s)

    def test_link_person_email_match_and_unlink(self):
        self._auth(self.user)
        # Person with same email should link
        p = Person.objects.create(name='Alice Person', email='alice@example.com')
        resp = self.client.post('/api/auth/link_person/', { 'person_id': p.id }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['person']['id'], p.id)

        # Unlink
        resp2 = self.client.post('/api/auth/link_person/', { 'person_id': None }, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp2.data['person'])

    def test_link_person_rejects_mismatch_for_regular_user(self):
        self._auth(self.user)
        p = Person.objects.create(name='Mismatch', email='other@example.com')
        resp = self.client.post('/api/auth/link_person/', { 'person_id': p.id }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_link_person_allows_staff_override_and_handles_conflict(self):
        # Create two persons and link one to someone else to simulate conflict
        p = Person.objects.create(name='Target', email='staff@example.com')
        # Link to another user first
        other = get_user_model().objects.create_user(username='bob', email='staff@example.com', password='x')
        self.client.force_authenticate(user=other)
        self.client.post('/api/auth/link_person/', { 'person_id': p.id }, format='json')

        # Now staff user attempts to link same person -> should get 409
        self.client.force_authenticate(user=self.staff)
        resp = self.client.post('/api/auth/link_person/', { 'person_id': p.id }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_unauthenticated_requests_blocked(self):
        # Remove auth
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.patch('/api/auth/settings/', { 'settings': {} }, format='json').status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.post('/api/auth/link_person/', { 'person_id': None }, format='json').status_code, status.HTTP_401_UNAUTHORIZED)

    def test_sso_status_endpoint_is_public(self):
        self.client.force_authenticate(user=None)
        response = self.client.get('/api/auth/sso/status/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('enabled', response.data)

    def test_notification_preferences_push_fields_roundtrip(self):
        self._auth(self.user)
        response = self.client.get('/api/auth/notification-preferences/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('webPushEnabled', response.data)
        self.assertIn('pushPreDeliverableReminders', response.data)
        self.assertIn('pushDailyDigest', response.data)
        self.assertIn('pushAssignmentChanges', response.data)
        self.assertIn('pushDeliverableDateChanges', response.data)
        self.assertIn('pushRateLimitEnabled', response.data)
        self.assertIn('pushWeekendMute', response.data)
        self.assertIn('pushQuietHoursEnabled', response.data)
        self.assertIn('pushQuietHoursStart', response.data)
        self.assertIn('pushQuietHoursEnd', response.data)
        self.assertIn('pushDigestWindowEnabled', response.data)
        self.assertIn('pushDigestWindow', response.data)
        self.assertIn('pushTimezone', response.data)
        self.assertIn('pushSnoozeEnabled', response.data)
        self.assertIn('pushSnoozeUntil', response.data)
        self.assertIn('pushActionsEnabled', response.data)
        self.assertIn('pushDeepLinksEnabled', response.data)
        self.assertIn('pushSubscriptionCleanupEnabled', response.data)
        self.assertIn('notificationChannelMatrix', response.data)
        self.assertIn('effectiveChannelAvailability', response.data)
        self.assertFalse(response.data['emailPreDeliverableReminders'])
        self.assertFalse(response.data['pushPreDeliverableReminders'])
        self.assertFalse(response.data['pushAssignmentChanges'])
        self.assertFalse(response.data['pushDeliverableDateChanges'])
        self.assertFalse(response.data['notificationChannelMatrix']['pred.reminder']['mobilePush'])
        self.assertFalse(response.data['notificationChannelMatrix']['pred.reminder']['email'])
        self.assertTrue(response.data['notificationChannelMatrix']['pred.reminder']['inBrowser'])

        payload = {
            'emailPreDeliverableReminders': True,
            'reminderDaysBefore': 2,
            'dailyDigest': True,
            'webPushEnabled': True,
            'pushPreDeliverableReminders': True,
            'pushDailyDigest': True,
            'pushAssignmentChanges': False,
            'pushDeliverableDateChanges': True,
            'pushRateLimitEnabled': False,
            'pushWeekendMute': True,
            'pushQuietHoursEnabled': True,
            'pushQuietHoursStart': 21,
            'pushQuietHoursEnd': 7,
            'pushDigestWindowEnabled': True,
            'pushDigestWindow': 'evening',
            'pushTimezone': 'America/Phoenix',
            'pushSnoozeEnabled': True,
            'pushSnoozeUntil': None,
            'pushActionsEnabled': False,
            'pushDeepLinksEnabled': False,
            'pushSubscriptionCleanupEnabled': False,
            'notificationChannelMatrix': {
                'pred.reminder': {'mobilePush': True, 'email': True, 'inBrowser': True},
                'pred.digest': {'mobilePush': False, 'email': False, 'inBrowser': True},
                'assignment.created': {'mobilePush': False, 'email': True, 'inBrowser': True},
                'assignment.removed': {'mobilePush': False, 'email': True, 'inBrowser': True},
                'assignment.bulk_updated': {'mobilePush': False, 'email': True, 'inBrowser': True},
                'deliverable.reminder': {'mobilePush': True, 'email': True, 'inBrowser': True},
                'deliverable.date_changed': {'mobilePush': True, 'email': True, 'inBrowser': True},
            },
        }
        response = self.client.put('/api/auth/notification-preferences/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['webPushEnabled'])
        self.assertFalse(response.data['pushDailyDigest'])
        self.assertFalse(response.data['pushAssignmentChanges'])
        self.assertTrue(response.data['pushDeliverableDateChanges'])
        self.assertFalse(response.data['pushRateLimitEnabled'])
        self.assertTrue(response.data['pushWeekendMute'])
        self.assertTrue(response.data['pushQuietHoursEnabled'])
        self.assertEqual(response.data['pushQuietHoursStart'], 21)
        self.assertEqual(response.data['pushQuietHoursEnd'], 7)
        self.assertTrue(response.data['pushDigestWindowEnabled'])
        self.assertEqual(response.data['pushDigestWindow'], 'evening')
        self.assertEqual(response.data['pushTimezone'], 'America/Phoenix')
        self.assertTrue(response.data['pushSnoozeEnabled'])
        self.assertFalse(response.data['pushActionsEnabled'])
        self.assertFalse(response.data['pushDeepLinksEnabled'])
        self.assertFalse(response.data['pushSubscriptionCleanupEnabled'])
        self.assertIn('notificationChannelMatrix', response.data)
        self.assertFalse(response.data['notificationChannelMatrix']['pred.digest']['mobilePush'])
        self.assertFalse(response.data['notificationChannelMatrix']['pred.digest']['email'])

    def test_notification_preferences_respect_global_push_event_availability(self):
        cfg = WebPushGlobalSettings.get_active()
        cfg.push_rate_limit_enabled = False
        cfg.push_weekend_mute_enabled = False
        cfg.push_quiet_hours_enabled = False
        cfg.push_snooze_enabled = False
        cfg.push_digest_window_enabled = False
        cfg.push_actions_enabled = False
        cfg.push_deep_links_enabled = False
        cfg.push_subscription_healthcheck_enabled = False
        cfg.push_pre_deliverable_reminders_enabled = False
        cfg.push_daily_digest_enabled = False
        cfg.push_assignment_changes_enabled = False
        cfg.push_deliverable_date_changes_enabled = False
        cfg.save(update_fields=[
            'push_rate_limit_enabled',
            'push_weekend_mute_enabled',
            'push_quiet_hours_enabled',
            'push_snooze_enabled',
            'push_digest_window_enabled',
            'push_actions_enabled',
            'push_deep_links_enabled',
            'push_subscription_healthcheck_enabled',
            'push_pre_deliverable_reminders_enabled',
            'push_daily_digest_enabled',
            'push_assignment_changes_enabled',
            'push_deliverable_date_changes_enabled',
            'updated_at',
        ])

        self._auth(self.user)
        payload = {
            'emailPreDeliverableReminders': True,
            'reminderDaysBefore': 2,
            'dailyDigest': True,
            'webPushEnabled': True,
            'pushPreDeliverableReminders': True,
            'pushDailyDigest': True,
            'pushAssignmentChanges': True,
            'pushDeliverableDateChanges': True,
            'pushRateLimitEnabled': True,
            'pushWeekendMute': True,
            'pushQuietHoursEnabled': True,
            'pushQuietHoursStart': 22,
            'pushQuietHoursEnd': 7,
            'pushDigestWindowEnabled': True,
            'pushDigestWindow': 'evening',
            'pushTimezone': 'America/Phoenix',
            'pushSnoozeEnabled': True,
            'pushSnoozeUntil': '2026-03-06T12:00:00Z',
            'pushActionsEnabled': True,
            'pushDeepLinksEnabled': True,
            'pushSubscriptionCleanupEnabled': True,
        }
        response = self.client.put('/api/auth/notification-preferences/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['pushPreDeliverableReminders'])
        self.assertFalse(response.data['pushDailyDigest'])
        self.assertFalse(response.data['pushAssignmentChanges'])
        self.assertFalse(response.data['pushDeliverableDateChanges'])
        self.assertFalse(response.data['pushRateLimitEnabled'])
        self.assertFalse(response.data['pushWeekendMute'])
        self.assertFalse(response.data['pushQuietHoursEnabled'])
        self.assertFalse(response.data['pushDigestWindowEnabled'])
        self.assertEqual(response.data['pushDigestWindow'], 'instant')
        self.assertFalse(response.data['pushSnoozeEnabled'])
        self.assertIsNone(response.data['pushSnoozeUntil'])
        self.assertFalse(response.data['pushActionsEnabled'])
        self.assertFalse(response.data['pushDeepLinksEnabled'])
        self.assertFalse(response.data['pushSubscriptionCleanupEnabled'])

    def test_notification_matrix_cells_can_be_reenabled_when_globally_available(self):
        self._auth(self.user)
        initial = self.client.get('/api/auth/notification-preferences/')
        self.assertEqual(initial.status_code, status.HTTP_200_OK)
        self.assertTrue(initial.data['effectiveChannelAvailability']['pred.reminder']['email'])

        disable_payload = dict(initial.data)
        disable_payload['notificationChannelMatrix'] = dict(initial.data['notificationChannelMatrix'])
        disable_payload['notificationChannelMatrix']['pred.reminder'] = dict(
            initial.data['notificationChannelMatrix']['pred.reminder']
        )
        disable_payload['notificationChannelMatrix']['pred.reminder']['email'] = False

        disabled = self.client.put('/api/auth/notification-preferences/', disable_payload, format='json')
        self.assertEqual(disabled.status_code, status.HTTP_200_OK)
        self.assertFalse(disabled.data['notificationChannelMatrix']['pred.reminder']['email'])
        # Availability should remain globally-derived, not clamped by the user's current choice.
        self.assertTrue(disabled.data['effectiveChannelAvailability']['pred.reminder']['email'])

        enable_payload = dict(disabled.data)
        enable_payload['notificationChannelMatrix'] = dict(disabled.data['notificationChannelMatrix'])
        enable_payload['notificationChannelMatrix']['pred.reminder'] = dict(
            disabled.data['notificationChannelMatrix']['pred.reminder']
        )
        enable_payload['notificationChannelMatrix']['pred.reminder']['email'] = True

        reenabled = self.client.put('/api/auth/notification-preferences/', enable_payload, format='json')
        self.assertEqual(reenabled.status_code, status.HTTP_200_OK)
        self.assertTrue(reenabled.data['notificationChannelMatrix']['pred.reminder']['email'])

    def test_push_action_endpoint_ack_and_project_mute(self):
        project = Project.objects.create(name='Muted Project')
        self._auth(self.user)

        ack_response = self.client.post(
            '/api/auth/push/action/',
            {'action': 'acknowledge'},
            format='json',
        )
        self.assertEqual(ack_response.status_code, status.HTTP_200_OK)

        mute_response = self.client.post(
            '/api/auth/push/action/',
            {'action': 'mute_project_24h', 'projectId': project.id},
            format='json',
        )
        self.assertEqual(mute_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            WebPushProjectMute.objects.filter(
                user=self.user,
                project=project,
            ).exists()
        )

    def test_push_action_endpoint_respects_global_and_user_action_toggles(self):
        self._auth(self.user)

        cfg = WebPushGlobalSettings.get_active()
        cfg.push_actions_enabled = False
        cfg.save(update_fields=['push_actions_enabled', 'updated_at'])

        globally_disabled = self.client.post(
            '/api/auth/push/action/',
            {'action': 'acknowledge'},
            format='json',
        )
        self.assertEqual(globally_disabled.status_code, status.HTTP_403_FORBIDDEN)

        cfg.push_actions_enabled = True
        cfg.save(update_fields=['push_actions_enabled', 'updated_at'])
        pref, _ = NotificationPreference.objects.get_or_create(user=self.user)
        pref.push_actions_enabled = False
        pref.save(update_fields=['push_actions_enabled', 'updated_at'])

        user_disabled = self.client.post(
            '/api/auth/push/action/',
            {'action': 'acknowledge'},
            format='json',
        )
        self.assertEqual(user_disabled.status_code, status.HTTP_403_FORBIDDEN)

    def test_push_subscription_crud(self):
        self._auth(self.user)
        create_payload = {
            'endpoint': 'https://example.test/subscription/abc',
            'expirationTime': None,
            'keys': {'p256dh': 'p256dh-key', 'auth': 'auth-key'},
        }
        created = self.client.post('/api/auth/push-subscriptions/', create_payload, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        sub_id = created.data['id']

        listed = self.client.get('/api/auth/push-subscriptions/')
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data), 1)
        self.assertEqual(listed.data[0]['id'], sub_id)

        deleted = self.client.delete(f'/api/auth/push-subscriptions/{sub_id}/')
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_in_app_notifications_crud(self):
        self._auth(self.user)
        other = get_user_model().objects.create_user(username='other', email='other@example.com', password='x')

        first = InAppNotification.objects.create(
            user=self.user,
            event_key='assignment.removed',
            title='Assignment removed',
            body='Assigned hours changed.',
            url='/assignments',
        )
        second = InAppNotification.objects.create(
            user=self.user,
            event_key='deliverable.date_changed',
            title='Deliverable date changed',
            body='Date was updated.',
            url='/deliverables/calendar',
        )
        InAppNotification.objects.create(
            user=other,
            event_key='assignment.created',
            title='Other user item',
            body='Hidden',
            url='/assignments',
        )

        listed = self.client.get('/api/auth/in-app-notifications/?limit=10')
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(int(listed.data.get('unreadCount') or 0), 2)
        self.assertEqual(len(listed.data.get('items') or []), 2)

        mark_read = self.client.post(
            '/api/auth/in-app-notifications/mark-read/',
            {'ids': [first.id]},
            format='json',
        )
        self.assertEqual(mark_read.status_code, status.HTTP_200_OK)
        first.refresh_from_db()
        self.assertIsNotNone(first.read_at)

        clear_resp = self.client.post(
            '/api/auth/in-app-notifications/clear/',
            {'ids': [second.id]},
            format='json',
        )
        self.assertEqual(clear_resp.status_code, status.HTTP_200_OK)
        second.refresh_from_db()
        self.assertIsNotNone(second.cleared_at)

        mark_all = self.client.post('/api/auth/in-app-notifications/mark-all-read/', {}, format='json')
        self.assertEqual(mark_all.status_code, status.HTTP_200_OK)

    @override_settings(
        WEB_PUSH_TEST_STAFF_ONLY=True,
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    def test_push_test_staff_only(self):
        self._auth(self.user)
        forbidden = self.client.post('/api/auth/push/test/', {}, format='json')
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

        self._auth(self.staff)
        allowed = self.client.post('/api/auth/push/test/', {}, format='json')
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertTrue(allowed.data.get('queued'))
