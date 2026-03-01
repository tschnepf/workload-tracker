import json
import logging
import time
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
from typing import Any, Iterator

from django.db import connections


LOGGER = logging.getLogger("performance")


class _DBTimer:
    def __init__(self) -> None:
        self.db_time_ms = 0.0
        self.query_count = 0

    def __call__(self, execute, sql, params, many, context):
        start = time.perf_counter()
        try:
            return execute(sql, params, many, context)
        finally:
            self.db_time_ms += (time.perf_counter() - start) * 1000.0
            self.query_count += 1


@dataclass
class EndpointTiming:
    endpoint: str
    tags: dict[str, Any] = field(default_factory=dict)
    db_time_ms: float = 0.0
    db_query_count: int = 0
    duration_ms: float = 0.0

    def tag(self, key: str, value: Any) -> None:
        self.tags[key] = value


@contextmanager
def endpoint_timing(endpoint: str, request=None, tags: dict[str, Any] | None = None) -> Iterator[EndpointTiming]:
    meter = EndpointTiming(endpoint=endpoint)
    if tags:
        meter.tags.update(tags)
    db_timer = _DBTimer()
    started_at = time.perf_counter()

    with ExitStack() as stack:
        for alias in connections:
            try:
                stack.enter_context(connections[alias].execute_wrapper(db_timer))
            except Exception:  # nosec B110
                pass
        try:
            yield meter
        finally:
            meter.duration_ms = (time.perf_counter() - started_at) * 1000.0
            meter.db_time_ms = db_timer.db_time_ms
            meter.db_query_count = db_timer.query_count
            payload: dict[str, Any] = {
                "endpoint": endpoint,
                "duration_ms": round(meter.duration_ms, 2),
                "db_time_ms": round(meter.db_time_ms, 2),
                "db_query_count": meter.db_query_count,
                "status_code": meter.tags.get("status_code"),
            }
            if request is not None:
                payload.update(
                    {
                        "path": getattr(request, "path", None),
                        "method": getattr(request, "method", None),
                        "request_id": getattr(request, "request_id", None),
                        "user_id": getattr(getattr(request, "user", None), "id", None),
                    }
                )
            if meter.tags:
                payload["tags"] = meter.tags
            try:
                LOGGER.info("endpoint_timing %s", json.dumps(payload, sort_keys=True, default=str))
            except Exception:  # nosec B110
                pass
