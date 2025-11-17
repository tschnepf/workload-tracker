from __future__ import annotations

from typing import Any, Dict, Optional

from core.request_context import get_current_request_id


def integration_log_extra(
    *,
    provider: Optional[str] = None,
    connection: Any = None,
    connection_id: Optional[int] = None,
    object_key: Optional[str] = None,
    rule: Any = None,
    job: Any = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build a consistent logging extra payload for integrations.

    Automatically augments entries with the current request ID when available.
    """

    payload: Dict[str, Any] = {}

    provider_key = provider
    if provider_key is None:
        if connection is not None:
            provider_key = getattr(getattr(connection, 'provider', None), 'key', None)
        elif rule is not None:
            provider_key = getattr(getattr(getattr(rule, 'connection', None), 'provider', None), 'key', None)
        elif job is not None:
            provider_key = getattr(getattr(job, 'provider', None), 'key', None)
    if provider_key:
        payload['integration_provider'] = provider_key

    conn_id = connection_id
    if conn_id is None:
        if connection is not None:
            conn_id = getattr(connection, 'id', None)
        elif rule is not None:
            conn_id = getattr(rule, 'connection_id', None)
        elif job is not None:
            conn_id = getattr(job, 'connection_id', None)
    if conn_id:
        payload['integration_connection_id'] = conn_id

    object_value = object_key
    if object_value is None:
        if rule is not None:
            object_value = getattr(rule, 'object_key', None)
        elif job is not None:
            object_value = getattr(job, 'object_key', None)
    if object_value:
        payload['integration_object'] = object_value

    if job is not None:
        job_id = getattr(job, 'id', None)
        if job_id:
            payload['integration_job_id'] = job_id

    request_id = get_current_request_id()
    if request_id:
        payload['request_id'] = request_id

    if extra:
        payload.update(extra)

    return payload
