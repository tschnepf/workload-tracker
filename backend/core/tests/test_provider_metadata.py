import copy
import json
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase
from jsonschema import Draft7Validator, ValidationError


class ProviderMetadataTests(SimpleTestCase):
    """Ensure provider metadata files comply with the shared JSON Schema."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        integrations_dir = Path(settings.BASE_DIR) / 'integrations'
        schema_path = integrations_dir / 'provider.schema.json'
        provider_path = integrations_dir / 'providers' / 'bqe' / 'provider.json'
        cls.schema = json.loads(schema_path.read_text())
        cls.provider = json.loads(provider_path.read_text())
        cls.validator = Draft7Validator(cls.schema)

    def test_bqe_provider_metadata_validates(self):
        errors = sorted(self.validator.iter_errors(self.provider), key=lambda e: e.path)
        self.assertEqual(errors, [], f"Provider metadata has schema violations: {errors}")

    def test_missing_required_header_fails_validation(self):
        broken = copy.deepcopy(self.provider)
        broken.pop('requiredHeaders', None)
        with self.assertRaises(ValidationError):
            self.validator.validate(broken)

    def test_invalid_oauth_flow_rejected(self):
        broken = copy.deepcopy(self.provider)
        broken['oauth']['flows'] = ['sso']
        with self.assertRaises(ValidationError):
            self.validator.validate(broken)
