from django.test import SimpleTestCase

from integrations.utils import redact_sensitive


class RedactionTests(SimpleTestCase):
    def test_redacts_nested(self):
        payload = {'Authorization': 'secret', 'nested': {'refresh_token': 'abc', 'ok': 'value'}}
        redacted = redact_sensitive(payload)
        self.assertEqual(redacted['Authorization'], '***')
        self.assertEqual(redacted['nested']['refresh_token'], '***')
        self.assertEqual(redacted['nested']['ok'], 'value')
