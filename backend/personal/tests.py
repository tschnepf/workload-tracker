from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from accounts.models import UserProfile
from people.models import Person


class PersonalWorkEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.User = get_user_model()

    def test_unauthenticated_returns_401(self):
        resp = self.client.get('/api/personal/work/')
        self.assertIn(resp.status_code, (401, 403))  # default IsAuthenticated should be enforced

    def test_no_linked_person_returns_404(self):
        user = self.User.objects.create_user(username='u1', password='pw')
        # Profile exists but person is None
        UserProfile.objects.create(user=user, person=None)
        self.client.force_authenticate(user=user)
        resp = self.client.get('/api/personal/work/')
        self.assertEqual(resp.status_code, 404)

    def test_happy_path_and_etag_cycle(self):
        user = self.User.objects.create_user(username='u2', password='pw')
        person = Person.objects.create(name='P1', weekly_capacity=36)
        UserProfile.objects.create(user=user, person=person)
        self.client.force_authenticate(user=user)

        # First request returns 200 and an ETag
        resp = self.client.get('/api/personal/work/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.data, dict)
        for key in ('summary', 'alerts', 'projects', 'deliverables', 'preItems', 'schedule'):
            self.assertIn(key, resp.data)
        etag = resp.headers.get('ETag') or resp.headers.get('etag')
        self.assertTrue(etag)

        # Second request with If-None-Match should produce 304
        resp2 = self.client.get('/api/personal/work/', HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(resp2.status_code, 304)

