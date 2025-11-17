import io
import json
import logging
from django.test import TestCase

from config.logging_utils import JSONFormatter


class LoggingRedactionTests(TestCase):
    def test_sensitive_extras_are_redacted(self):
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(JSONFormatter())
        logger = logging.getLogger('test.logger')
        logger.setLevel(logging.INFO)
        logger.addHandler(handler)

        try:
            logger.info(
                'testing',
                extra={
                    'authorization': {'token': 'abc'},
                    'password': 'supersecret',
                    'token': 'abc',
                    'refresh': 'def',
                    'code': 'xyz',
                    'request_id': 'req-1',
                },
            )
        finally:
            logger.removeHandler(handler)

        payload = json.loads(stream.getvalue())
        assert payload['authorization'] == '[REDACTED]'
        assert payload['password'] == '[REDACTED]'
        assert payload['token'] == '[REDACTED]'
        assert payload['refresh'] == '[REDACTED]'
        # Non-sensitive field remains
        assert payload['request_id'] == 'req-1'
        assert payload['code'] == '[REDACTED]'
