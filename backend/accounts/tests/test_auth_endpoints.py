from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from people.models import Person


class AuthEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        # Regular user
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='testpass123')
        # Staff user for overrides
        self.staff = User.objects.create_user(username='staff', email='staff@example.com', password='testpass123', is_staff=True)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_token_obtain_and_refresh(self):
        # Obtain pair
        resp = self.client.post('/api/token/', { 'username': 'alice', 'password': 'testpass123' }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        access = resp.data.get('access')
        refresh = resp.data.get('refresh')
        self.assertTrue(access)
        self.assertTrue(refresh)

        # Refresh
        resp2 = self.client.post('/api/token/refresh/', { 'refresh': refresh }, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertTrue(resp2.data.get('access'))

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

