from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.core.cache import cache
from django.utils import timezone

from core.models import (
    NotificationPreference,
    WebPushDeferredNotification,
    WebPushGlobalSettings,
    WebPushSubscription,
    WebPushVapidKeys,
)
from core.webpush import send_push_to_users, web_push_event_enabled


class WebPushDispatchTests(TestCase):
    def setUp(self):
        try:
            cache.clear()
        except Exception:
            pass
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

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_respects_global_event_toggle(self, send_mock):
        settings_obj = WebPushGlobalSettings.get_active()
        settings_obj.push_assignment_changes_enabled = False
        settings_obj.save(update_fields=['push_assignment_changes_enabled', 'updated_at'])

        sent = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'Test', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        self.assertEqual(sent, 0)
        self.assertEqual(send_mock.call_count, 0)

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_respects_deliverable_date_change_toggle(self, send_mock):
        settings_obj = WebPushGlobalSettings.get_active()
        settings_obj.push_deliverable_date_changes_enabled = False
        settings_obj.save(update_fields=['push_deliverable_date_changes_enabled', 'updated_at'])

        sent = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'deliverable.date_changed', 'title': 'Test', 'body': 'Body', 'url': '/deliverables/calendar'},
            preference_field='push_deliverable_date_changes',
        )
        self.assertEqual(sent, 0)
        self.assertEqual(send_mock.call_count, 0)

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='',
        WEB_PUSH_VAPID_PRIVATE_KEY='',
        WEB_PUSH_SUBJECT='',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_uses_database_vapid_keys_when_env_missing(self, send_mock):
        keys = WebPushVapidKeys.get_active()
        keys.set_values(public_key='db-public', private_key='db-private', subject='mailto:test@example.com')

        sent = send_push_to_users(
            [self.user_enabled.id],
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
    def test_send_push_to_users_respects_global_runtime_toggle(self, send_mock):
        settings_obj = WebPushGlobalSettings.get_active()
        settings_obj.enabled = False
        settings_obj.save(update_fields=['enabled', 'updated_at'])

        sent = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'Test', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        self.assertEqual(sent, 0)
        self.assertEqual(send_mock.call_count, 0)

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_defers_when_quiet_hours_active(self, send_mock):
        pref = NotificationPreference.objects.get(user=self.user_enabled)
        now_hour = int(timezone.now().hour)
        quiet_start = (now_hour - 1) % 24
        quiet_end = (now_hour + 1) % 24
        if quiet_start == quiet_end:
            quiet_end = (quiet_end + 1) % 24
        pref.push_quiet_hours_enabled = True
        pref.push_quiet_hours_start = quiet_start
        pref.push_quiet_hours_end = quiet_end
        pref.save(update_fields=['push_quiet_hours_enabled', 'push_quiet_hours_start', 'push_quiet_hours_end'])

        sent = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'Quiet', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        self.assertEqual(sent, 0)
        self.assertEqual(send_mock.call_count, 0)
        self.assertEqual(WebPushDeferredNotification.objects.filter(user=self.user_enabled).count(), 1)

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_rate_limit_defers_overflow(self, send_mock):
        settings_obj = WebPushGlobalSettings.get_active()
        settings_obj.push_rate_limit_per_hour = 1
        settings_obj.save(update_fields=['push_rate_limit_per_hour', 'updated_at'])

        first = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'First', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        second = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'Second', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        self.assertEqual(first, 1)
        self.assertEqual(second, 0)
        self.assertEqual(send_mock.call_count, 1)
        self.assertEqual(WebPushDeferredNotification.objects.filter(user=self.user_enabled).count(), 1)

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_user_can_disable_rate_limit(self, send_mock):
        settings_obj = WebPushGlobalSettings.get_active()
        settings_obj.push_rate_limit_per_hour = 1
        settings_obj.save(update_fields=['push_rate_limit_per_hour', 'updated_at'])

        pref = NotificationPreference.objects.get(user=self.user_enabled)
        pref.push_rate_limit_enabled = False
        pref.save(update_fields=['push_rate_limit_enabled'])

        first = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'First', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        second = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'Second', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        self.assertEqual(first, 1)
        self.assertEqual(second, 1)
        self.assertEqual(send_mock.call_count, 2)
        self.assertEqual(WebPushDeferredNotification.objects.filter(user=self.user_enabled).count(), 0)

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_global_quiet_hours_toggle_overrides_user_preference(self, send_mock):
        pref = NotificationPreference.objects.get(user=self.user_enabled)
        now_hour = int(timezone.now().hour)
        quiet_start = (now_hour - 1) % 24
        quiet_end = (now_hour + 1) % 24
        if quiet_start == quiet_end:
            quiet_end = (quiet_end + 1) % 24
        pref.push_quiet_hours_enabled = True
        pref.push_quiet_hours_start = quiet_start
        pref.push_quiet_hours_end = quiet_end
        pref.save(update_fields=['push_quiet_hours_enabled', 'push_quiet_hours_start', 'push_quiet_hours_end'])

        settings_obj = WebPushGlobalSettings.get_active()
        settings_obj.push_quiet_hours_enabled = False
        settings_obj.save(update_fields=['push_quiet_hours_enabled', 'updated_at'])

        sent = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'Quiet', 'body': 'Body', 'url': '/assignments'},
            preference_field='push_assignment_changes',
        )
        self.assertEqual(sent, 1)
        self.assertEqual(send_mock.call_count, 1)
        self.assertEqual(WebPushDeferredNotification.objects.filter(user=self.user_enabled).count(), 0)

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_VAPID_PUBLIC_KEY='public',
        WEB_PUSH_VAPID_PRIVATE_KEY='private',
        WEB_PUSH_SUBJECT='mailto:test@example.com',
    )
    @patch('core.webpush.send_payload_to_subscription', return_value=True)
    def test_send_push_to_users_respects_user_actions_and_deep_links_toggles(self, send_mock):
        pref = NotificationPreference.objects.get(user=self.user_enabled)
        pref.push_actions_enabled = False
        pref.push_deep_links_enabled = False
        pref.save(update_fields=['push_actions_enabled', 'push_deep_links_enabled'])

        sent = send_push_to_users(
            [self.user_enabled.id],
            {'type': 'assignment.updated', 'title': 'Test', 'body': 'Body', 'url': '/assignments/123'},
            preference_field='push_assignment_changes',
        )
        self.assertEqual(sent, 1)
        self.assertEqual(send_mock.call_count, 1)
        payload = send_mock.call_args[0][1]
        self.assertEqual(payload.get('actions'), [])
        self.assertEqual(payload.get('url'), '/my-work')

    @override_settings(
        WEB_PUSH_ENABLED=True,
        WEB_PUSH_ASSIGNMENT_EVENTS_ENABLED=False,
        WEB_PUSH_REMINDER_EVENTS_ENABLED=False,
        WEB_PUSH_DELIVERABLE_DATE_CHANGE_EVENTS_ENABLED=False,
    )
    def test_event_toggles_follow_global_settings_not_env_kill_switches(self):
        settings_obj = WebPushGlobalSettings.get_active()
        settings_obj.push_pre_deliverable_reminders_enabled = True
        settings_obj.push_daily_digest_enabled = True
        settings_obj.push_assignment_changes_enabled = True
        settings_obj.push_deliverable_date_changes_enabled = True
        settings_obj.save(update_fields=[
            'push_pre_deliverable_reminders_enabled',
            'push_daily_digest_enabled',
            'push_assignment_changes_enabled',
            'push_deliverable_date_changes_enabled',
            'updated_at',
        ])

        self.assertTrue(web_push_event_enabled('push_pre_deliverable_reminders'))
        self.assertTrue(web_push_event_enabled('push_daily_digest'))
        self.assertTrue(web_push_event_enabled('push_assignment_changes'))
        self.assertTrue(web_push_event_enabled('push_deliverable_date_changes'))
