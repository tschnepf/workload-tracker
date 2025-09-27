import json
import logging
from datetime import datetime


class JSONFormatter(logging.Formatter):
    """Minimal JSON formatter for structured logs.

    Includes common HTTP request fields when provided via `extra`.
    """

    SENSITIVE_KEYS = {
        'password', 'authorization', 'authorization_header', 'auth',
        'token', 'access', 'access_token', 'refresh', 'refresh_token',
        'secret', 'api_key', 'apikey', 'client_secret',
    }

    def _redact(self, key: str, value):
        try:
            if key.lower() in self.SENSITIVE_KEYS and value is not None:
                return "[REDACTED]"
        except Exception:
            pass
        return value

    def format(self, record: logging.LogRecord) -> str:  # type: ignore[override]
        payload = {
            'timestamp': datetime.utcnow().isoformat(timespec='milliseconds') + 'Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        # Attach common HTTP fields if present
        for key in (
            'request_id', 'user_id', 'path', 'method', 'status_code',
            'duration_ms', 'remote_addr'
        ):
            if hasattr(record, key):
                payload[key] = self._redact(key, getattr(record, key))

        # Redact known sensitive extras if present on the record
        try:
            for k, v in record.__dict__.items():
                lk = str(k).lower()
                if lk in self.SENSITIVE_KEYS:
                    payload[k] = "[REDACTED]"
        except Exception:
            pass
        return json.dumps(payload, ensure_ascii=False)
