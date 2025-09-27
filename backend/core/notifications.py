from __future__ import annotations

import json
import os
import urllib.request
from urllib.parse import urlparse


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
        body = json.dumps({"text": text}).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as _:
            pass
    except Exception:
        # Never raise from notification path
        return
