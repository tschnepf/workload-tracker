from __future__ import annotations

import logging
import time
from typing import Any, Dict, Iterable, List, Tuple

from django.utils import timezone
from requests import HTTPError, Response

from integrations.http import IntegrationHttpClient
from integrations.oauth import (
    get_connection_access_token,
    get_connection_endpoint,
    OAuthError,
)
from integrations.logging_utils import integration_log_extra
from integrations.models import IntegrationConnection
from integrations.registry import ProviderMetadata
from integrations.providers.bqe.errors import translate_bqe_error
from integrations.providers.bqe.query import WhereClauseBuilder
from integrations.providers.bqe.rate_limit import BQERateLimiter

logger = logging.getLogger(__name__)


class BQEProjectsClient:
    """Thin wrapper for fetching BQE Projects with pagination and backoff."""

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
        self.page_size = self._resolve_page_size(provider_metadata)
        self.headers = self._build_headers()
        self.project_object_meta = self._object_meta('projects')
        self.rate_limiter = self._build_rate_limiter(provider_metadata)

    def _build_headers(self) -> Dict[str, str]:
        headers = dict(self.connection.extra_headers or {})
        token = get_connection_access_token(self.connection, provider_meta=self.metadata)
        headers['Authorization'] = f"Bearer {token}"
        headers['X-UTC-OFFSET'] = str(self._resolve_utc_offset())
        return headers

    def fetch(self, updated_since: str | None = None, *, extra_params: Dict[str, Any] | None = None) -> Iterable[List[Dict[str, Any]]]:
        page = 1
        while True:
            params = self._build_params(page, updated_since, extra_params)
            payload = self._request_json('/project', params=params)
            items = self._extract_items(payload)
            yield items
            if not self._has_more(payload, len(items)):
                break
            page += 1

    def fetch_parent_projects(self) -> Iterable[List[Dict[str, Any]]]:
        filters = self._parent_only_params()
        return self.fetch(updated_since=None, extra_params=filters)

    def _extract_items(self, payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, list):
            return [self._coerce_item(row) for row in payload]
        if isinstance(payload, dict):
            for key in ('items', 'results', 'data'):
                if isinstance(payload.get(key), list):
                    return [self._coerce_item(row) for row in payload[key]]
        logger.warning(
            'bqe_projects_payload_unexpected',
            extra=integration_log_extra(connection=self.connection, object_key='projects', extra={'type': str(type(payload))}),
        )
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
            with self.rate_limiter.slot():
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
                    object_key='projects',
                )
            return response.json()

    def _retry_after_seconds(self, response: Response) -> int:
        header = response.headers.get('Retry-After') or ''
        try:
            value = int(header)
        except Exception:
            value = 1
        return max(1, min(value, self.MAX_BACKOFF_SECONDS))

    def _object_meta(self, object_key: str) -> Dict[str, Any]:
        for entry in self.metadata.raw.get('objects', []):
            if entry.get('key') == object_key:
                return dict(entry)
        return {}

    def _parent_only_params(self) -> Dict[str, str]:
        filters = (self.project_object_meta.get('filters') or {}).get('parentOnly') or {}
        query = (filters.get('query') or '').strip()
        if not query:
            return {}
        if '=' in query and ' is ' not in query.lower():
            params: Dict[str, str] = {}
            for part in query.split(','):
                if '=' not in part:
                    continue
                key, value = part.split('=', 1)
                params[key.strip()] = value.strip()
            return params
        return {'where': query}

    def _resolve_page_size(self, metadata: ProviderMetadata) -> int:
        raw_value = metadata.raw.get('pageSize', self.MAX_PAGE_SIZE)
        try:
            size = int(raw_value)
        except Exception:
            size = self.MAX_PAGE_SIZE
        return max(1, min(size, self.MAX_PAGE_SIZE))

    def _page_argument(self, page_number: int, *, page_size: int | None = None) -> str:
        size = page_size if page_size is not None else self.page_size
        size = max(1, min(int(size), self.MAX_PAGE_SIZE))
        number = max(1, int(page_number))
        return f"{number},{size}"

    def _build_params(
        self,
        page_number: int,
        updated_since: str | None,
        extra_params: Dict[str, Any] | None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {'page': self._page_argument(page_number)}
        builder = WhereClauseBuilder()
        if updated_since:
            builder.gte('lastUpdated', updated_since)
        if extra_params:
            builder.raw(extra_params.get('where'))
        where_value = builder.build()
        if where_value:
            params['where'] = where_value
        if extra_params:
            for key, value in extra_params.items():
                if key in {'where', 'pageSize', 'updatedSince'}:
                    continue
                if key == 'page':
                    params['page'] = value
                    continue
                params[key] = value
        return params

    def _resolve_utc_offset(self) -> int:
        try:
            value = int(self.connection.utc_offset_minutes)
        except (TypeError, ValueError):
            value = 0
        return max(-720, min(840, value))

    def _build_rate_limiter(self, metadata: ProviderMetadata) -> BQERateLimiter:
        limits = metadata.raw.get('rateLimits') or {}
        max_concurrent = int(limits.get('maxConcurrentPerConnection', 4) or 4)
        global_rpm = int(limits.get('globalRequestsPerMinute', 0) or 0)
        return BQERateLimiter(
            provider_key=metadata.key,
            connection_id=self.connection.id,
            max_concurrent=max_concurrent,
            global_rpm=global_rpm,
            sleep_fn=self.sleep,
        )
