from django.test import SimpleTestCase

from core.request_context import reset_request_id, set_current_request_id
from integrations.http import IntegrationHttpClient
from integrations.utils import redact_sensitive


class RedactionTests(SimpleTestCase):
    def test_redacts_nested(self):
        payload = {'Authorization': 'secret', 'nested': {'refresh_token': 'abc', 'ok': 'value'}}
        redacted = redact_sensitive(payload)
        self.assertEqual(redacted['Authorization'], '***')
        self.assertEqual(redacted['nested']['refresh_token'], '***')
        self.assertEqual(redacted['nested']['ok'], 'value')


class HttpClientTests(SimpleTestCase):
    def test_request_id_propagated(self):
        client = IntegrationHttpClient('https://example.test')
        token = set_current_request_id('rid-123')
        try:
            headers = client._prepare_headers({'X-Test': '1'})
        finally:
            reset_request_id(token)
        self.assertEqual(headers['X-Request-ID'], 'rid-123')
        self.assertEqual(headers['X-Test'], '1')
