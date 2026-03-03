from django.test import TestCase
from django.contrib.auth import get_user_model
from django.conf import settings
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework import status

from people.models import Person
from integrations.models import AuthMethodPolicy


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

        payload = {
            'emailPreDeliverableReminders': True,
            'reminderDaysBefore': 2,
            'dailyDigest': True,
            'webPushEnabled': True,
            'pushPreDeliverableReminders': True,
            'pushDailyDigest': True,
            'pushAssignmentChanges': False,
        }
        response = self.client.put('/api/auth/notification-preferences/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['webPushEnabled'])
        self.assertTrue(response.data['pushDailyDigest'])
        self.assertFalse(response.data['pushAssignmentChanges'])

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
