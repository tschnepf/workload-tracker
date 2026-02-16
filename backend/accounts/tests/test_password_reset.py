from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_password_reset_always_204_when_duplicate_emails_exist(self):
        User = get_user_model()
        email = 'dup-reset@example.com'
        User.objects.create_user(username='dup-reset-a', email=email, password='x')
        User.objects.create_user(username='dup-reset-b', email=email, password='x')

        resp = self.client.post('/api/auth/password_reset/', {'email': email}, format='json')
        self.assertEqual(resp.status_code, 204)

    def test_password_reset_always_204_when_email_not_found(self):
        resp = self.client.post('/api/auth/password_reset/', {'email': 'nope@example.com'}, format='json')
        self.assertEqual(resp.status_code, 204)

