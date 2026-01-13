"""Request-scoped context helpers used outside of the HTTP stack."""

from __future__ import annotations

from contextvars import ContextVar
from typing import Optional


_request_id: ContextVar[Optional[str]] = ContextVar('request_id', default=None)


def set_current_request_id(value: Optional[str]):
    """Store the active request ID for the current context.

    Returns the ContextVar token so callers can reset when finished.
    """

    return _request_id.set(value)


def reset_request_id(token) -> None:
    """Reset the stored request ID using the provided token."""

    if token is None:
        return
    try:
        _request_id.reset(token)
    except Exception:  # nosec B110
        pass


def get_current_request_id() -> Optional[str]:
    """Return the current request ID, if any."""

    try:
        return _request_id.get()
    except LookupError:  # pragma: no cover - defensive
        return None
