import time
import uuid
import logging
from typing import Callable
from django.http import HttpRequest, HttpResponse

try:
    import sentry_sdk
except Exception:  # pragma: no cover
    sentry_sdk = None  # type: ignore


class RequestIDLogMiddleware:
    """Injects X-Request-ID and emits structured request logs.

    - Preserves incoming X-Request-ID; otherwise generates a UUID4 hex.
    - Adds X-Request-ID to the response headers.
    - Logs JSON with path, method, status, duration, remote_addr, user_id, request_id.
    - Sets Sentry tag 'request_id' to correlate traces, when Sentry is available.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response
        self.logger = logging.getLogger('request')

    def __call__(self, request: HttpRequest) -> HttpResponse:
        start = time.monotonic()
        rid = request.META.get('HTTP_X_REQUEST_ID') or uuid.uuid4().hex
        request.META['HTTP_X_REQUEST_ID'] = rid
        setattr(request, 'request_id', rid)
        if sentry_sdk is not None:
            try:
                sentry_sdk.set_tag('request_id', rid)
            except Exception:
                pass

        response = self.get_response(request)

        duration_ms = int((time.monotonic() - start) * 1000)
        remote = request.META.get('HTTP_X_FORWARDED_FOR') or request.META.get('REMOTE_ADDR')
        user_id = getattr(getattr(request, 'user', None), 'id', None)

        # Echo the request ID on the response
        try:
            response['X-Request-ID'] = rid
        except Exception:
            pass

        # Emit structured log
        try:
            self.logger.info(
                'request',
                extra={
                    'request_id': rid,
                    'user_id': user_id,
                    'path': request.path,
                    'method': request.method,
                    'status_code': getattr(response, 'status_code', None),
                    'duration_ms': duration_ms,
                    'remote_addr': remote,
                },
            )
        except Exception:
            pass

        return response


class CSPMiddleware:
    """Sets Content Security Policy headers with report-only rollout support.

    Controlled by settings:
    - settings.CSP_ENABLED (bool)
    - settings.CSP_REPORT_ONLY (bool)
    - settings.CSP_POLICY (str)
    - settings.CSP_REPORT_URI (optional str)
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        from django.conf import settings
        self.get_response = get_response
        self.enabled = getattr(settings, 'CSP_ENABLED', True)
        self.report_only = getattr(settings, 'CSP_REPORT_ONLY', True)
        self.policy = getattr(settings, 'CSP_POLICY', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
        self.report_uri = getattr(settings, 'CSP_REPORT_URI', None)

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if not self.enabled:
            return response
        header_name = 'Content-Security-Policy-Report-Only' if self.report_only else 'Content-Security-Policy'
        value = self.policy
        if self.report_uri:
            # Append report-uri at the end
            value = f"{value}; report-uri {self.report_uri}"
        try:
            response[header_name] = value
        except Exception:
            pass
        return response
