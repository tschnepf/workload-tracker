from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import requests
from django.utils.crypto import get_random_string
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .utils import redact_sensitive

logger = logging.getLogger(__name__)


def _build_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=0.5,
        status_forcelist=[429, 502, 503, 504],
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    return session


class IntegrationHttpClient:
    def __init__(self, base_url: str, default_headers: Optional[Dict[str, str]] = None):
        self.base_url = base_url.rstrip('/')
        self.default_headers = default_headers or {}
        self.session = _build_session()

    def _prepare_headers(self, headers: Optional[Dict[str, str]]) -> Dict[str, str]:
        merged = {**self.default_headers, **(headers or {})}
        merged.setdefault('X-Request-ID', get_random_string(16))
        return merged

    def request(self, method: str, path: str, *, headers: Optional[Dict[str, str]] = None, **kwargs) -> requests.Response:
        url = f"{self.base_url}/{path.lstrip('/')}"
        prepared_headers = self._prepare_headers(headers)
        try:
            response = self.session.request(method, url, headers=prepared_headers, timeout=(5, 30), **kwargs)
        except requests.RequestException as exc:
            logger.error(
                'integration_http_error',
                extra={'method': method, 'url': url, 'payload': redact_sensitive(kwargs)},
            )
            raise exc
        return response

    def get_json(self, path: str, **kwargs) -> Any:
        resp = self.request('GET', path, **kwargs)
        resp.raise_for_status()
        try:
            return resp.json()
        except ValueError:
            logger.error('Failed to parse JSON response from %s', path)
            raise
