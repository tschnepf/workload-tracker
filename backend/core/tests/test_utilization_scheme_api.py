from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from django.conf import settings as dj_settings
from rest_framework.test import APIClient
from core.models import UtilizationScheme


class UtilizationSchemeApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username='admin', password='x', is_staff=True)
        self.user = User.objects.create_user(username='user', password='x', is_staff=False)

    def test_get_returns_etag_and_304_on_match(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get('/api/core/utilization_scheme/')
        self.assertEqual(res.status_code, 200)
        etag = res.headers.get('ETag') or res.headers.get('etag')
        self.assertTrue(etag)

        # If-None-Match should return 304 when matching
        res2 = self.client.get('/api/core/utilization_scheme/', HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(res2.status_code, 304)

    def test_put_requires_admin_and_if_match(self):
        # As non-admin
        self.client.force_authenticate(user=self.user)
        res = self.client.put('/api/core/utilization_scheme/', data={
            'mode': 'absolute_hours',
            'blue_min': 1, 'blue_max': 29,
            'green_min': 30, 'green_max': 36,
            'orange_min': 37, 'orange_max': 40,
            'red_min': 41,
            'zero_is_blank': True,
        }, format='json')
        self.assertEqual(res.status_code, 403)

        # As admin but missing If-Match
        self.client.force_authenticate(user=self.admin)
        res2 = self.client.put('/api/core/utilization_scheme/', data={
            'mode': 'absolute_hours',
            'blue_min': 1, 'blue_max': 29,
            'green_min': 30, 'green_max': 36,
            'orange_min': 37, 'orange_max': 40,
            'red_min': 41,
            'zero_is_blank': True,
        }, format='json')
        self.assertEqual(res2.status_code, 412)

    def test_put_with_etag_increments_version_and_persists(self):
        self.client.force_authenticate(user=self.admin)
        # GET and capture ETag
        res = self.client.get('/api/core/utilization_scheme/')
        self.assertEqual(res.status_code, 200)
        etag = res.headers.get('ETag') or res.headers.get('etag')
        orig = UtilizationScheme.get_active()
        orig_version = orig.version

        payload = {
            'mode': 'absolute_hours',
            'blue_min': 1, 'blue_max': 29,
            'green_min': 30, 'green_max': 36,
            'orange_min': 37, 'orange_max': 40,
            'red_min': 41,
            'zero_is_blank': False,  # toggle
        }
        res2 = self.client.put('/api/core/utilization_scheme/', data=payload, format='json', HTTP_IF_MATCH=etag)
        self.assertEqual(res2.status_code, 200)
        data = res2.json()
        self.assertEqual(data['zero_is_blank'], False)
        # Version bumped
        self.assertGreater(data['version'], orig_version)

        # Persisted
        cur = UtilizationScheme.get_active()
        self.assertEqual(cur.zero_is_blank, False)

    def test_validation_error_on_gaps(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/core/utilization_scheme/')
        etag = res.headers.get('ETag') or res.headers.get('etag')

        bad = {
            'mode': 'absolute_hours',
            'blue_min': 1, 'blue_max': 28,  # gap (should be 29)
            'green_min': 30, 'green_max': 36,
            'orange_min': 37, 'orange_max': 40,
            'red_min': 41,
            'zero_is_blank': True,
        }
        res2 = self.client.put('/api/core/utilization_scheme/', data=bad, format='json', HTTP_IF_MATCH=etag)
        self.assertEqual(res2.status_code, 400)
        self.assertIn('detail', res2.json())

    def test_put_returns_403_when_feature_flag_disabled(self):
        self.client.force_authenticate(user=self.admin)
        # Disable via override_settings (copy existing flags to avoid wiping others)
        flags = {**getattr(dj_settings, 'FEATURES', {}), 'UTILIZATION_SCHEME_ENABLED': False}
        with override_settings(FEATURES=flags):
            res = self.client.get('/api/core/utilization_scheme/')
            etag = res.headers.get('ETag') or res.headers.get('etag')
            res2 = self.client.put('/api/core/utilization_scheme/', data=res.json(), format='json', HTTP_IF_MATCH=etag)
            self.assertEqual(res2.status_code, 403)

