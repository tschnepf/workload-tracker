from __future__ import annotations

import json
import os
import urllib.request


def notify_slack(text: str, *, timeout: float = 3.0) -> None:
    """Send a short message to Slack via webhook if configured.

    Non-blocking: exceptions are suppressed.
    """
    url = os.getenv("SLACK_WEBHOOK_URL")
    if not url:
        return
    try:
        body = json.dumps({"text": text}).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as _:
            pass
    except Exception:
        # Never raise from notification path
        return

