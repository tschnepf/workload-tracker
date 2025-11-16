from __future__ import annotations

from typing import Any, Mapping

SENSITIVE_KEYS = {'authorization', 'client_secret', 'refresh_token', 'code', 'password'}


def redact_sensitive(payload: Any) -> Any:
    """Return a copy of payload with sensitive keys redacted."""
    if isinstance(payload, Mapping):
        return {
            key: ('***' if key.lower() in SENSITIVE_KEYS else redact_sensitive(value))
            for key, value in payload.items()
        }
    if isinstance(payload, list):
        return [redact_sensitive(item) for item in payload]
    return payload
