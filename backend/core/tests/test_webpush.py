from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from core.models import NotificationPreference, WebPushSubscription
from core.webpush import send_push_to_users


class WebPushDispatchTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user_enabled = User.objects.create_user(username='enabled', password='pw')
        self.user_disabled = User.objects.create_user(username='disabled', password='pw')

        NotificationPreference.objects.create(
            user=self.user_enabled,
            web_push_enabled=True,
            push_assignment_changes=True,
        )
        NotificationPreference.objects.create(
            user=self.user_disabled,
            web_push_enabled=False,
            push_assignment_changes=True,
        )

        WebPushSubscription.objects.create(
            user=self.user_enabled,
            endpoint='https://example.test/enabled',
            p256dh='p256dh-enabled',
            auth='auth-enabled',
            is_active=True,
        )
        WebPushSubscription.objects.create(
            user=self.user_disabled,
            endpoint='https://example.test/disabled',
            p256dh='p256dh-disabled',
            auth='auth-disabled',
            is_active=True,
        )

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_respects_web_push_enabled(self, send_mock):
        sent = send_push_to_users(
            [self.user_enabled.id, self.user_disabled.id],
            {'type': 'assignment.updated', 'title': 'Test', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        self.assertEqual(sent, 1)
        self.assertEqual(send_mock.call_count, 1)

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_respects_event_preference_field(self, send_mock):
        pref = NotificationPreference.objects.get(user=self.user_enabled)
        pref.push_assignment_changes = False
        pref.save(update_fields=['push_assignment_changes'])

        sent = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'Test', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        self.assertEqual(sent, 0)
        self.assertEqual(send_mock.call_count, 0)
