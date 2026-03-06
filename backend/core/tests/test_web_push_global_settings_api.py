from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient


@override_settings(
    WEB_PUSH_ENABLED=True,
    WEB_PUSH_VAPID_PUBLIC_KEY='public-key',
    WEB_PUSH_VAPID_PRIVATE_KEY='private-key',
    WEB_PUSH_SUBJECT='mailto:test@example.com',
)
class WebPushGlobalSettingsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            username='push_admin',
            password='pw',
            is_staff=True,
            is_superuser=True,
        )
        self.user = user_model.objects.create_user(username='push_user', password='pw')

    def test_non_admin_cannot_access_global_push_settings(self):
        self.client.force_authenticate(self.user)
        response = self.client.get('/api/core/web_push_settings/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_toggle_global_push_setting(self):
        self.client.force_authenticate(self.admin)

        get_response = self.client.get('/api/core/web_push_settings/')
        self.assertEqual(get_response.status_code, status.HTTP_200_OK, get_response.content)
        self.assertTrue(get_response.json()['enabled'])
        self.assertTrue(get_response.json()['pushRateLimitEnabled'])
        self.assertEqual(get_response.json()['pushRateLimitPerHour'], 3)
        self.assertTrue(get_response.json()['pushWeekendMuteEnabled'])
        self.assertTrue(get_response.json()['pushQuietHoursEnabled'])
        self.assertTrue(get_response.json()['pushSnoozeEnabled'])
        self.assertTrue(get_response.json()['pushDigestWindowEnabled'])
        self.assertTrue(get_response.json()['pushActionsEnabled'])
        self.assertTrue(get_response.json()['pushDeepLinksEnabled'])
        self.assertTrue(get_response.json()['pushSubscriptionHealthcheckEnabled'])
        self.assertTrue(get_response.json()['pushPreDeliverableRemindersEnabled'])
        self.assertTrue(get_response.json()['pushDailyDigestEnabled'])
        self.assertTrue(get_response.json()['pushAssignmentChangesEnabled'])
        self.assertTrue(get_response.json()['pushDeliverableDateChangesEnabled'])
        self.assertEqual(get_response.json()['pushDeliverableDateChangeScope'], 'next_upcoming')
        self.assertFalse(get_response.json()['pushDeliverableDateChangeWithinTwoWeeksOnly'])
        self.assertIn('notificationChannelMatrix', get_response.json())
        self.assertIn('notificationEventCatalog', get_response.json())
        self.assertTrue(get_response.json()['notificationChannelMatrix']['pred.reminder']['mobilePush'])

        put_response = self.client.put(
            '/api/core/web_push_settings/',
            data={
                'enabled': False,
                'pushRateLimitEnabled': False,
                'pushRateLimitPerHour': 5,
                'pushWeekendMuteEnabled': False,
                'pushQuietHoursEnabled': False,
                'pushSnoozeEnabled': False,
                'pushDigestWindowEnabled': False,
                'pushActionsEnabled': False,
                'pushDeepLinksEnabled': False,
                'pushSubscriptionHealthcheckEnabled': False,
                'pushPreDeliverableRemindersEnabled': False,
                'pushDailyDigestEnabled': False,
                'pushAssignmentChangesEnabled': False,
                'pushDeliverableDateChangesEnabled': False,
                'pushDeliverableDateChangeScope': 'all_upcoming',
                'pushDeliverableDateChangeWithinTwoWeeksOnly': True,
                'notificationChannelMatrix': {
                    'pred.reminder': {'mobilePush': True, 'email': True, 'inBrowser': True},
                    'pred.digest': {'mobilePush': True, 'email': True, 'inBrowser': True},
                    'assignment.created': {'mobilePush': False, 'email': True, 'inBrowser': True},
                    'assignment.removed': {'mobilePush': False, 'email': True, 'inBrowser': True},
                    'assignment.bulk_updated': {'mobilePush': False, 'email': True, 'inBrowser': True},
                    'deliverable.reminder': {'mobilePush': True, 'email': True, 'inBrowser': True},
                    'deliverable.date_changed': {'mobilePush': False, 'email': True, 'inBrowser': True},
                },
            },
            format='json',
        )
        self.assertEqual(put_response.status_code, status.HTTP_200_OK, put_response.content)
        self.assertFalse(put_response.json()['enabled'])
        self.assertFalse(put_response.json()['pushRateLimitEnabled'])
        self.assertEqual(put_response.json()['pushRateLimitPerHour'], 5)
        self.assertFalse(put_response.json()['pushWeekendMuteEnabled'])
        self.assertFalse(put_response.json()['pushQuietHoursEnabled'])
        self.assertFalse(put_response.json()['pushSnoozeEnabled'])
        self.assertFalse(put_response.json()['pushDigestWindowEnabled'])
        self.assertFalse(put_response.json()['pushActionsEnabled'])
        self.assertFalse(put_response.json()['pushDeepLinksEnabled'])
        self.assertFalse(put_response.json()['pushSubscriptionHealthcheckEnabled'])
        self.assertFalse(put_response.json()['pushPreDeliverableRemindersEnabled'])
        self.assertFalse(put_response.json()['pushDailyDigestEnabled'])
        self.assertFalse(put_response.json()['pushAssignmentChangesEnabled'])
        self.assertFalse(put_response.json()['pushDeliverableDateChangesEnabled'])
        self.assertEqual(put_response.json()['pushDeliverableDateChangeScope'], 'all_upcoming')
        self.assertTrue(put_response.json()['pushDeliverableDateChangeWithinTwoWeeksOnly'])
        self.assertFalse(put_response.json()['notificationChannelMatrix']['assignment.created']['mobilePush'])

        get_after_put = self.client.get('/api/core/web_push_settings/')
        self.assertEqual(get_after_put.status_code, status.HTTP_200_OK, get_after_put.content)
        self.assertFalse(get_after_put.json()['enabled'])
        self.assertFalse(get_after_put.json()['pushRateLimitEnabled'])
        self.assertEqual(get_after_put.json()['pushRateLimitPerHour'], 5)
        self.assertFalse(get_after_put.json()['pushWeekendMuteEnabled'])
        self.assertFalse(get_after_put.json()['pushQuietHoursEnabled'])
        self.assertFalse(get_after_put.json()['pushSnoozeEnabled'])
        self.assertFalse(get_after_put.json()['pushDigestWindowEnabled'])
        self.assertFalse(get_after_put.json()['pushActionsEnabled'])
        self.assertFalse(get_after_put.json()['pushDeepLinksEnabled'])
        self.assertFalse(get_after_put.json()['pushSubscriptionHealthcheckEnabled'])
        self.assertFalse(get_after_put.json()['pushPreDeliverableRemindersEnabled'])
        self.assertFalse(get_after_put.json()['pushDailyDigestEnabled'])
        self.assertFalse(get_after_put.json()['pushAssignmentChangesEnabled'])
        self.assertFalse(get_after_put.json()['pushDeliverableDateChangesEnabled'])
        self.assertEqual(get_after_put.json()['pushDeliverableDateChangeScope'], 'all_upcoming')
        self.assertTrue(get_after_put.json()['pushDeliverableDateChangeWithinTwoWeeksOnly'])

    def test_capabilities_reflect_global_push_toggle(self):
        self.client.force_authenticate(self.admin)

        initial_caps = self.client.get('/api/capabilities/')
        self.assertEqual(initial_caps.status_code, status.HTTP_200_OK, initial_caps.content)
        self.assertTrue(initial_caps.json()['pwa']['pushEnabled'])
        self.assertTrue(initial_caps.json()['pwa']['pushEvents']['preDeliverableReminders'])
        self.assertTrue(initial_caps.json()['pwa']['pushEvents']['dailyDigest'])
        self.assertTrue(initial_caps.json()['pwa']['pushEvents']['assignmentChanges'])
        self.assertTrue(initial_caps.json()['pwa']['pushEvents']['deliverableDateChanges'])
        self.assertTrue(initial_caps.json()['pwa']['pushFeatures']['rateLimit'])
        self.assertTrue(initial_caps.json()['pwa']['pushFeatures']['weekendMute'])
        self.assertTrue(initial_caps.json()['pwa']['pushFeatures']['quietHours'])
        self.assertTrue(initial_caps.json()['pwa']['pushFeatures']['snooze'])
        self.assertTrue(initial_caps.json()['pwa']['pushFeatures']['digestWindow'])
        self.assertTrue(initial_caps.json()['pwa']['pushFeatures']['actions'])
        self.assertTrue(initial_caps.json()['pwa']['pushFeatures']['deepLinks'])
        self.assertTrue(initial_caps.json()['pwa']['pushFeatures']['subscriptionHealthcheck'])

        disable_response = self.client.put(
            '/api/core/web_push_settings/',
            data={
                'enabled': False,
                'pushRateLimitEnabled': False,
                'pushWeekendMuteEnabled': False,
                'pushQuietHoursEnabled': False,
                'pushSnoozeEnabled': False,
                'pushDigestWindowEnabled': False,
                'pushActionsEnabled': False,
                'pushDeepLinksEnabled': False,
                'pushSubscriptionHealthcheckEnabled': False,
                'pushPreDeliverableRemindersEnabled': False,
                'pushDailyDigestEnabled': False,
                'pushAssignmentChangesEnabled': False,
                'pushDeliverableDateChangesEnabled': False,
            },
            format='json',
        )
        self.assertEqual(disable_response.status_code, status.HTTP_200_OK, disable_response.content)

        caps_after_disable = self.client.get('/api/capabilities/')
        self.assertEqual(caps_after_disable.status_code, status.HTTP_200_OK, caps_after_disable.content)
        self.assertFalse(caps_after_disable.json()['pwa']['pushEnabled'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushEvents']['preDeliverableReminders'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushEvents']['dailyDigest'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushEvents']['assignmentChanges'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushEvents']['deliverableDateChanges'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushFeatures']['rateLimit'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushFeatures']['weekendMute'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushFeatures']['quietHours'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushFeatures']['snooze'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushFeatures']['digestWindow'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushFeatures']['actions'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushFeatures']['deepLinks'])
        self.assertFalse(caps_after_disable.json()['pwa']['pushFeatures']['subscriptionHealthcheck'])
