from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from core.models import WebPushVapidKeys


@override_settings(
    WEB_PUSH_ENABLED=True,
    WEB_PUSH_VAPID_PUBLIC_KEY='',
    WEB_PUSH_VAPID_PRIVATE_KEY='',
    WEB_PUSH_SUBJECT='',
)
class WebPushVapidKeysApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            username='push_vapid_admin',
            password='pw',
            is_staff=True,
            is_superuser=True,
        )
        self.user = user_model.objects.create_user(username='push_vapid_user', password='pw')

    def test_non_admin_cannot_access(self):
        self.client.force_authenticate(self.user)
        response = self.client.get('/api/core/web_push_vapid_keys/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        post_response = self.client.post('/api/core/web_push_vapid_keys/', {'subject': 'mailto:test@example.com'}, format='json')
        self.assertEqual(post_response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(
        WEB_PUSH_VAPID_PUBLIC_KEY='environment-public-key',
        WEB_PUSH_VAPID_PRIVATE_KEY='environment-private-key',
        WEB_PUSH_SUBJECT='mailto:environment@example.com',
    )
    def test_status_reports_environment_fallback_masked(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/core/web_push_vapid_keys/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        payload = response.json()
        self.assertTrue(payload['configured'])
        self.assertEqual(payload['source'], 'environment')
        self.assertEqual(payload['subject'], 'mailto:environment@example.com')
        self.assertNotEqual(payload['publicKeyMasked'], 'environment-public-key')
        self.assertNotEqual(payload['privateKeyMasked'], 'environment-private-key')

    def test_generate_creates_encrypted_keys_and_updates_capabilities(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            '/api/core/web_push_vapid_keys/',
            {'subject': 'mailto:alerts@example.com'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        payload = response.json()
        self.assertTrue(payload['configured'])
        self.assertEqual(payload['source'], 'database')
        self.assertEqual(payload['subject'], 'mailto:alerts@example.com')
        self.assertTrue(payload['publicKeyMasked'])
        self.assertTrue(payload['privateKeyMasked'])

        row = WebPushVapidKeys.get_active()
        self.assertTrue(row.configured)
        self.assertNotEqual(bytes(row.encrypted_public_key), row.get_public_key().encode('utf-8'))
        self.assertNotEqual(bytes(row.encrypted_private_key), row.get_private_key().encode('utf-8'))

        caps = self.client.get('/api/capabilities/')
        self.assertEqual(caps.status_code, status.HTTP_200_OK, caps.content)
        caps_payload = caps.json()
        self.assertTrue(caps_payload['pwa']['pushEnabled'])
        self.assertEqual(caps_payload['pwa']['vapidPublicKey'], row.get_public_key())

    def test_generate_requires_subject_when_none_is_available(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/core/web_push_vapid_keys/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.content)
