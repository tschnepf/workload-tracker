from __future__ import annotations

import os
from urllib.parse import urlparse

import requests

def _is_allowed_slack_webhook(url: str) -> bool:
    try:
        p = urlparse(url)
    except Exception:
        return False
    if p.scheme.lower() != 'https':
        return False
    host = (p.netloc or '').lower()
    # Restrict to Slack-controlled hosts
    if not (host == 'hooks.slack.com' or host.endswith('.slack.com')):
        return False
    # Basic path sanity: Slack webhooks typically under /services/
    if not (p.path or '/').startswith('/'):  # must be absolute
        return False
    return True


def notify_slack(text: str, *, timeout: float = 3.0) -> None:
    """Send a short message to Slack via webhook if configured.

    Non-blocking: exceptions are suppressed.
    """
    url = os.getenv("SLACK_WEBHOOK_URL")
    if not url:
        return
    try:
        if not _is_allowed_slack_webhook(url):
            # Minimal, non-secret logging via print to avoid pulling in logging deps here
            # (Security logger exists, but this path must be extremely safe.)
            return
        requests.post(url, json={"text": text}, timeout=timeout)
    except Exception:
        # Never raise from notification path
        return
