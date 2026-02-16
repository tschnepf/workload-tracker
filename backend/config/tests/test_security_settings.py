from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config import settings as settings_module


class SecuritySettingsTests(SimpleTestCase):
    def test_secret_key_validation_rejects_insecure_values_in_production(self):
        with self.assertRaises(ImproperlyConfigured):
            settings_module.validate_secret_key_for_env(
                secret_key='dev-secret-key-change-in-production',
                debug=False,
                running_tests=False,
            )

    def test_secret_key_validation_allows_secure_values(self):
        settings_module.validate_secret_key_for_env(
            secret_key='this-is-a-secure-production-secret-value',
            debug=False,
            running_tests=False,
        )

    def test_secret_key_validation_rejects_restore_placeholder_value(self):
        with self.assertRaises(ImproperlyConfigured):
            settings_module.validate_secret_key_for_env(
                secret_key='CHANGE_ME_RESTORE_TOKEN_SECRET',
                debug=False,
                running_tests=False,
            )

    def test_origin_parser_and_validator(self):
        origins = settings_module._parse_origin_list('https://a.example, https://b.example:8443')
        self.assertEqual(origins, ['https://a.example', 'https://b.example:8443'])
        settings_module._validate_origin_list(origins, name='TEST_ORIGINS')
        with self.assertRaises(ImproperlyConfigured):
            settings_module._validate_origin_list(['javascript:alert(1)'], name='TEST_ORIGINS')

    def test_required_feature_flags_present(self):
        for key in settings_module.REQUIRED_FEATURE_FLAGS:
            self.assertIn(key, settings_module.FEATURES)
