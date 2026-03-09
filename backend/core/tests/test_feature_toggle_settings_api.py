from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from core.models import FeatureToggleSettings


@override_settings(REPORTING_GROUPS_SYSTEM_ENABLED=True)
class FeatureToggleSettingsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username='feat_admin', password='pw', is_staff=True)
        self.manager = User.objects.create_user(username='feat_manager', password='pw')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)
        self.user = User.objects.create_user(username='feat_user', password='pw')

    def test_feature_settings_admin_only(self):
        self.client.force_authenticate(self.user)
        denied = self.client.get('/api/core/feature_settings/')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        get_resp = self.client.get('/api/core/feature_settings/')
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK, get_resp.content)
        self.assertIn('reportingGroupsEnabled', get_resp.json())

        put_resp = self.client.put(
            '/api/core/feature_settings/',
            data={'reportingGroupsEnabled': True},
            format='json',
        )
        self.assertEqual(put_resp.status_code, status.HTTP_200_OK, put_resp.content)
        self.assertTrue(put_resp.json()['reportingGroupsEnabled'])

        obj = FeatureToggleSettings.get_active()
        self.assertTrue(obj.reporting_groups_enabled)

    def test_capabilities_and_settings_snapshot_reflect_toggle(self):
        self.client.force_authenticate(self.admin)
        toggle = FeatureToggleSettings.get_active()
        toggle.reporting_groups_enabled = False
        toggle.save(update_fields=['reporting_groups_enabled', 'updated_at'])

        caps_disabled = self.client.get('/api/capabilities/')
        self.assertEqual(caps_disabled.status_code, status.HTTP_200_OK, caps_disabled.content)
        self.assertFalse(caps_disabled.json()['features']['reportingGroupsEnabled'])

        toggle.reporting_groups_enabled = True
        toggle.save(update_fields=['reporting_groups_enabled', 'updated_at'])
        caps_enabled = self.client.get('/api/capabilities/')
        self.assertEqual(caps_enabled.status_code, status.HTTP_200_OK, caps_enabled.content)
        self.assertTrue(caps_enabled.json()['features']['reportingGroupsEnabled'])

        settings_snapshot = self.client.get('/api/ui/settings-page/')
        self.assertEqual(settings_snapshot.status_code, status.HTTP_200_OK, settings_snapshot.content)
        visible = settings_snapshot.json().get('visibleSections', [])
        self.assertIn('features', visible)
