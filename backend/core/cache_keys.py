from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping

from django.http import HttpRequest


def _normalize(value: Any) -> Any:
    if isinstance(value, Mapping):
        normalized: dict[str, Any] = {}
        for key in sorted(value.keys(), key=lambda k: str(k)):
            normalized[str(key)] = _normalize(value[key])
        return normalized
    if isinstance(value, (list, tuple, set)):
        items = [_normalize(item) for item in value]
        signatures: dict[str, Any] = {}
        for item in items:
            sig = json.dumps(item, sort_keys=True, separators=(",", ":"), default=str)
            signatures[sig] = item
        return [signatures[sig] for sig in sorted(signatures.keys())]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _hash_payload(payload: Mapping[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _role_scope(request: HttpRequest) -> str:
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return "anonymous"
    if getattr(user, "is_superuser", False):
        return "superuser"
    if getattr(user, "is_staff", False):
        return "staff"
    return "authenticated"


def build_authz_scope_hash(request: HttpRequest, *, user_scoped: bool = False) -> str:
    user = getattr(request, "user", None)
    payload: dict[str, Any] = {
        "role_scope": _role_scope(request),
        "is_authenticated": bool(user and getattr(user, "is_authenticated", False)),
    }
    if user_scoped:
        payload["user_id"] = int(getattr(user, "id", 0) or 0)
    return _hash_payload(payload)[:16]


def build_aggregate_cache_key(
    endpoint: str,
    request: HttpRequest,
    *,
    filters: Mapping[str, Any] | None = None,
    extra_scope: Mapping[str, Any] | None = None,
    user_scoped: bool = False,
    version: str = "v1",
) -> str:
    normalized_filters = _normalize(filters or {})
    normalized_extra = _normalize(extra_scope or {})
    authz_scope_hash = build_authz_scope_hash(request, user_scoped=user_scoped)

    payload: dict[str, Any] = {
        "endpoint": endpoint,
        "version": version,
        "filters": normalized_filters,
        "extra_scope": normalized_extra,
        "authz_scope_hash": authz_scope_hash,
    }
    if user_scoped:
        user = getattr(request, "user", None)
        payload["user_id"] = int(getattr(user, "id", 0) or 0)

    return f"agg:{endpoint}:{_hash_payload(payload)}"
