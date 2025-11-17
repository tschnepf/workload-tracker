from __future__ import annotations

import logging
from typing import Any, Dict

from requests import HTTPError, Response

from integrations.exceptions import IntegrationProviderError
from integrations.logging_utils import integration_log_extra
from integrations.models import IntegrationConnection

logger = logging.getLogger(__name__)


def translate_bqe_error(
    response: Response,
    exc: HTTPError,
    *,
    connection: IntegrationConnection | None = None,
    object_key: str | None = None,
) -> None:
    """Raise a friendly error for known BQE failure payloads."""
    payload: Dict[str, Any] | None = None
    try:
        payload = response.json()
    except ValueError:
        payload = None

    if response.status_code == 409 and isinstance(payload, dict):
        key = (payload.get('Key') or payload.get('key') or '').lower()
        if key == 'msgpermissions':
            message = (
                "BQE returned 'MsgPermissions' (HTTP 409). The authenticated CORE user does not "
                "have security permissions for this feature. The BQE Getting Started docs explain "
                "that only companies with the proper subscription and user permissions can access "
                "these APIs. Ask a CORE admin to grant this user Projects/API access, then try again."
            )
            logger.warning(
                'bqe_permission_error',
                extra=integration_log_extra(
                    connection=connection,
                    object_key=object_key,
                    extra={'providerKey': payload.get('Key'), 'providerMessage': payload.get('Message')},
                ),
            )
            raise IntegrationProviderError(
                message,
                code=payload.get('Key'),
                status_code=response.status_code,
                provider_message=payload.get('Message'),
            ) from exc

    raise exc
