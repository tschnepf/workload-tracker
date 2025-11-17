from __future__ import annotations

from typing import Any, Dict, Optional

from django.contrib.auth import get_user_model

from .models import (
    IntegrationAuditLog,
    IntegrationConnection,
    IntegrationProvider,
    IntegrationRule,
)

UserModel = get_user_model()


def _ensure_provider(
    provider: Optional[IntegrationProvider],
    connection: Optional[IntegrationConnection],
    rule: Optional[IntegrationRule],
) -> Optional[IntegrationProvider]:
    if provider:
        return provider
    if connection and connection.provider_id:
        return connection.provider
    if rule and rule.connection_id:
        return rule.connection.provider
    return None


def record_audit_event(
    *,
    user: Optional[UserModel],
    action: str,
    provider: Optional[IntegrationProvider] = None,
    connection: Optional[IntegrationConnection] = None,
    rule: Optional[IntegrationRule] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> IntegrationAuditLog:
    actor = user if getattr(user, 'is_authenticated', False) else None
    provider_obj = _ensure_provider(provider, connection, rule)
    return IntegrationAuditLog.objects.create(
        user=actor,
        provider=provider_obj,
        connection=connection,
        rule=rule,
        action=action,
        metadata=metadata or {},
    )
