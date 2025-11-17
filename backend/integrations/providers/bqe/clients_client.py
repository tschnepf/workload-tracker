from __future__ import annotations

import logging
import time
from typing import Any, Dict, Iterable, List

from requests import HTTPError, Response

from integrations.http import IntegrationHttpClient
from integrations.oauth import (
    get_connection_access_token,
    get_connection_endpoint,
    OAuthError,
)
from integrations.models import IntegrationConnection
from integrations.registry import ProviderMetadata
from integrations.providers.bqe.errors import translate_bqe_error

logger = logging.getLogger(__name__)


class BQEClientsClient:
    """Fetch BQE Clients using the shared HTTP client."""

    MAX_PAGE_SIZE = 200
    MAX_ATTEMPTS = 5
    MAX_BACKOFF_SECONDS = 10

    def __init__(
        self,
        connection: IntegrationConnection,
        provider_metadata: ProviderMetadata,
        *,
        http_client: IntegrationHttpClient | None = None,
        sleep_fn: callable | None = None,
    ):
        self.connection = connection
        self.metadata = provider_metadata
        base_url = get_connection_endpoint(connection, provider_metadata)
        if not base_url:
            raise OAuthError('Connection endpoint is not configured. Re-authorize the provider.')
        self.http = http_client or IntegrationHttpClient(
            base_url,
            enable_legacy_tls_fallback=True,
        )
        self.sleep = sleep_fn or time.sleep
        self.page_size = min(int(provider_metadata.raw.get('pageSize', self.MAX_PAGE_SIZE)), self.MAX_PAGE_SIZE)
        self.headers = self._build_headers()

    def _build_headers(self) -> Dict[str, str]:
        headers = dict(self.connection.extra_headers or {})
        token = get_connection_access_token(self.connection, provider_meta=self.metadata)
        headers['Authorization'] = f"Bearer {token}"
        return headers

    def fetch(self, updated_since: str | None = None) -> Iterable[List[Dict[str, Any]]]:
        page = 1
        while True:
            params = {'page': page, 'pageSize': self.page_size}
            if updated_since:
                params['updatedSince'] = updated_since
            payload = self._request_json('/client', params=params)
            items = self._extract_items(payload)
            yield items
            if not self._has_more(payload, len(items)):
                break
            page += 1

    def _extract_items(self, payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, list):
            return [self._coerce_item(row) for row in payload]
        if isinstance(payload, dict):
            for key in ('items', 'results', 'data'):
                if isinstance(payload.get(key), list):
                    return [self._coerce_item(row) for row in payload[key]]
        logger.warning('bqe_clients_payload_unexpected', extra={'type': str(type(payload))})
        return []

    def _coerce_item(self, row: Any) -> Dict[str, Any]:
        return dict(row or {})

    def _has_more(self, payload: Any, batch_size: int) -> bool:
        if isinstance(payload, dict):
            if payload.get('nextPage'):
                return True
            if payload.get('hasMore'):
                return True
            page = payload.get('page')
            total_pages = payload.get('totalPages')
            if page and total_pages and page < total_pages:
                return True
        return batch_size == self.page_size

    def _request_json(self, path: str, *, params: Dict[str, Any]) -> Any:
        attempts = 0
        while True:
            response = self.http.request('GET', path, params=params, headers=self.headers, timeout=(5, 60))
            if response.status_code in (429, 503):
                retry_after = self._retry_after_seconds(response)
                attempts += 1
                if attempts >= self.MAX_ATTEMPTS:
                    response.raise_for_status()
                    return response.json()
                self.sleep(retry_after)
                continue
            try:
                response.raise_for_status()
            except HTTPError as exc:
                translate_bqe_error(
                    response,
                    exc,
                    connection=self.connection,
                    object_key='clients',
                )
            return response.json()

    def _retry_after_seconds(self, response: Response) -> int:
        header = response.headers.get('Retry-After') or ''
        try:
            value = int(header)
        except Exception:
            value = 1
        return max(1, min(value, self.MAX_BACKOFF_SECONDS))
