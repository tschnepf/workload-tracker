import json
import logging
from datetime import datetime


class JSONFormatter(logging.Formatter):
    """Minimal JSON formatter for structured logs.

    Includes common HTTP request fields when provided via `extra` and
    redacts sensitive data recursively.
    """

    SENSITIVE_KEYS = {
        'password', 'authorization', 'authorization_header', 'auth',
        'token', 'access', 'access_token', 'refresh', 'refresh_token',
        'secret', 'api_key', 'apikey', 'client_secret', 'code',
    }

    def _scrub(self, key: str, value):
        try:
            lowered = key.lower() if key else ''
        except Exception:
            lowered = ''
        if isinstance(value, dict):
            cleaned = {k: self._scrub(k, v) for k, v in value.items()}
            if lowered in self.SENSITIVE_KEYS and cleaned:
                return "[REDACTED]"
            return cleaned
        if isinstance(value, (list, tuple)):
            cleaned = [self._scrub('', item) for item in value]
            if lowered in self.SENSITIVE_KEYS and cleaned:
                return "[REDACTED]"
            return cleaned
        if lowered in self.SENSITIVE_KEYS and value is not None:
            return "[REDACTED]"
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
            'duration_ms', 'remote_addr', 'db_queries', 'db_time_ms',
            'integration_provider', 'integration_connection_id',
            'integration_object', 'integration_job_id'
        ):
            if hasattr(record, key):
                payload[key] = self._scrub(key, getattr(record, key))

        # Redact known sensitive extras if present on the record
        try:
            for k, v in record.__dict__.items():
                lk = str(k).lower()
                if lk in self.SENSITIVE_KEYS:
                    payload[k] = "[REDACTED]"
        except Exception:
            pass
        return json.dumps(payload, ensure_ascii=False)
