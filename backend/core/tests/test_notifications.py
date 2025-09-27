import os
from unittest.mock import patch

from django.test import TestCase

from core.notifications import notify_slack


class SlackWebhookValidationTests(TestCase):
    @patch.dict(os.environ, {"SLACK_WEBHOOK_URL": "http://example.com/webhook"}, clear=False)
    @patch("urllib.request.urlopen")
    def test_rejects_non_https(self, mock_open):
        notify_slack("hello")
        mock_open.assert_not_called()

    @patch.dict(os.environ, {"SLACK_WEBHOOK_URL": "https://example.com/webhook"}, clear=False)
    @patch("urllib.request.urlopen")
    def test_rejects_non_slack_host(self, mock_open):
        notify_slack("hello")
        mock_open.assert_not_called()

    @patch.dict(os.environ, {"SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/T000/B000/XXXX"}, clear=False)
    @patch("urllib.request.urlopen")
    def test_allows_hooks_slack_com(self, mock_open):
        notify_slack("hello")
        mock_open.assert_called_once()

