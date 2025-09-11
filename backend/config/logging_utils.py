import json
import logging
from datetime import datetime


class JSONFormatter(logging.Formatter):
    """Minimal JSON formatter for structured logs.

    Includes common HTTP request fields when provided via `extra`.
    """

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
                payload[key] = getattr(record, key)
        return json.dumps(payload, ensure_ascii=False)

