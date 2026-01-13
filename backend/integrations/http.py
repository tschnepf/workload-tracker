from __future__ import annotations

import logging
import ssl
from typing import Any, Dict, Optional

import requests
from django.utils.crypto import get_random_string
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from core.request_context import get_current_request_id

from .logging_utils import integration_log_extra
from .utils import redact_sensitive

logger = logging.getLogger(__name__)


class LegacyTLSAdapter(HTTPAdapter):
    """Adapter that pins TLS to 1.2 with relaxed cipher requirements."""

    def __init__(self, *args, **kwargs):
        self._ssl_context = ssl.create_default_context()
        self._ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
        self._ssl_context.maximum_version = ssl.TLSVersion.TLSv1_2
        legacy_flag = getattr(ssl, 'OP_LEGACY_SERVER_CONNECT', 0)
        if legacy_flag:
            self._ssl_context.options |= legacy_flag
        try:
            self._ssl_context.set_ciphers('DEFAULT:@SECLEVEL=1')
        except ssl.SSLError:  # nosec B110
            pass
        super().__init__(*args, **kwargs)

    def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
        pool_kwargs['ssl_context'] = self._ssl_context
        return super().init_poolmanager(connections, maxsize, block, **pool_kwargs)

    def proxy_manager_for(self, proxy, **proxy_kwargs):
        proxy_kwargs['ssl_context'] = self._ssl_context
        return super().proxy_manager_for(proxy, **proxy_kwargs)


def _build_session(*, legacy: bool = False) -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=0.5,
        status_forcelist=[429, 502, 503, 504],
        respect_retry_after_header=True,
    )
    adapter_cls = LegacyTLSAdapter if legacy else HTTPAdapter
    adapter = adapter_cls(max_retries=retry)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    return session


class IntegrationHttpClient:
    def __init__(
        self,
        base_url: str,
        default_headers: Optional[Dict[str, str]] = None,
        *,
        enable_legacy_tls_fallback: bool = False,
    ):
        self.base_url = base_url.rstrip('/')
        self.default_headers = default_headers or {}
        self.session = _build_session()
        self.legacy_session = _build_session(legacy=True) if enable_legacy_tls_fallback else None

    def _prepare_headers(self, headers: Optional[Dict[str, str]]) -> Dict[str, str]:
        merged = {**self.default_headers, **(headers or {})}
        request_id = get_current_request_id() or get_random_string(16)
        merged.setdefault('X-Request-ID', request_id)
        return merged

    def request(self, method: str, path: str, *, headers: Optional[Dict[str, str]] = None, **kwargs) -> requests.Response:
        url = f"{self.base_url}/{path.lstrip('/')}"
        prepared_headers = self._prepare_headers(headers)
        timeout = kwargs.pop('timeout', (5, 30))
        try:
            response = self.session.request(method, url, headers=prepared_headers, timeout=timeout, **kwargs)
        except requests.exceptions.SSLError as exc:
            if self.legacy_session:
                logger.warning(
                    'integration_http_tls_retry',
                    extra=integration_log_extra(extra={'method': method, 'url': url}),
                )
                try:
                    response = self.legacy_session.request(method, url, headers=prepared_headers, timeout=timeout, **kwargs)
                except requests.RequestException as legacy_exc:
                    logger.error(
                        'integration_http_error',
                        extra=integration_log_extra(
                            extra={'method': method, 'url': url, 'payload': redact_sensitive(kwargs)},
                        ),
                    )
                    raise legacy_exc
            else:
                logger.error(
                    'integration_http_error',
                    extra=integration_log_extra(
                        extra={'method': method, 'url': url, 'payload': redact_sensitive(kwargs)},
                    ),
                )
                raise exc
        except requests.RequestException as exc:
            logger.error(
                'integration_http_error',
                extra=integration_log_extra(
                    extra={'method': method, 'url': url, 'payload': redact_sensitive(kwargs)},
                ),
            )
            raise exc
        return response

    def get_json(self, path: str, **kwargs) -> Any:
        resp = self.request('GET', path, **kwargs)
        resp.raise_for_status()
        try:
            return resp.json()
        except ValueError:
            logger.error(
                'integration_http_invalid_json',
                extra=integration_log_extra(extra={'path': path}),
            )
            raise
