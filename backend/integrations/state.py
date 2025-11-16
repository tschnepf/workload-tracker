from __future__ import annotations

from typing import Any, Dict

from django.db import transaction

from .models import IntegrationConnection, IntegrationSetting

STATE_PREFIX = 'state.'


def _state_key(object_key: str) -> str:
    return f"{STATE_PREFIX}{object_key}"


def load_state(connection: IntegrationConnection, object_key: str) -> Dict[str, Any]:
    setting = IntegrationSetting.objects.filter(connection=connection, key=_state_key(object_key)).first()
    return dict(setting.data) if setting else {}


def save_state(connection: IntegrationConnection, object_key: str, state: Dict[str, Any]) -> None:
    with transaction.atomic():
        IntegrationSetting.objects.update_or_create(
            connection=connection,
            key=_state_key(object_key),
            defaults={'data': dict(state)},
        )


def reset_state(connection: IntegrationConnection, object_key: str) -> None:
    IntegrationSetting.objects.filter(connection=connection, key=_state_key(object_key)).delete()
