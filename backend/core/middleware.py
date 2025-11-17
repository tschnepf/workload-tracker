import time
import uuid
import logging
import os
from typing import Callable
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.conf import settings
from django.db import connections

from core.request_context import set_current_request_id, reset_request_id

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

        # Detect restore/maintenance lock early to avoid DB-dependent work
        has_restore_lock = False
        try:
            lock_path = os.path.join(getattr(settings, 'BACKUPS_DIR', '/backups'), '.restore.lock')
            has_restore_lock = os.path.exists(lock_path)
        except Exception:
            has_restore_lock = False

        token = set_current_request_id(rid)
        try:
            response = self.get_response(request)

            duration_ms = int((time.monotonic() - start) * 1000)
            remote = request.META.get('HTTP_X_FORWARDED_FOR') or request.META.get('REMOTE_ADDR')
            # Avoid evaluating request.user (which may hit DB) during restore
            user_id = None if has_restore_lock else getattr(getattr(request, 'user', None), 'id', None)

            # Collect DB metrics (available when DEBUG; otherwise best-effort)
            db_queries = None
            db_time_ms = None
            try:
                # Skip introspection when restore lock is present to reduce coupling
                if not has_restore_lock:
                    total = 0
                    t = 0.0
                    for alias in connections:
                        try:
                            qs = connections[alias].queries
                            total += len(qs)
                            for q in qs:
                                try:
                                    t += float(q.get('time', 0.0))
                                except Exception:
                                    pass
                        except Exception:
                            pass
                    db_queries = total
                    db_time_ms = int(t * 1000)
            except Exception:
                pass

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
                        'db_queries': db_queries,
                        'db_time_ms': db_time_ms,
                    },
                )
            except Exception:
                pass

            # Sentry breadcrumb with performance hints
            if sentry_sdk is not None:
                try:
                    sentry_sdk.add_breadcrumb(
                        category='http.performance',
                        message='endpoint',
                        data={
                            'path': request.path,
                            'status': getattr(response, 'status_code', None),
                            'duration_ms': duration_ms,
                            'db_queries': db_queries,
                            'db_time_ms': db_time_ms,
                        },
                        level='info',
                    )
                except Exception:
                    pass

            return response
        finally:
            reset_request_id(token)


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
        self.policy = getattr(settings, 'CSP_POLICY', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
        self.report_uri = getattr(settings, 'CSP_REPORT_URI', None)

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if not self.enabled:
            return response
        header_name = 'Content-Security-Policy-Report-Only' if self.report_only else 'Content-Security-Policy'
        # Generate a nonce for this response and attach for potential template use
        try:
            import os as _os
            import base64 as _b64
            nonce_bytes = _os.urandom(16)
            nonce = _b64.b64encode(nonce_bytes).decode('ascii')
        except Exception:
            nonce = None
        # Stash on request for templates that might use it
        try:
            setattr(request, 'csp_nonce', nonce)
        except Exception:
            pass

        # Expand policy with nonce support: if policy contains "{nonce}", replace; otherwise append nonce to script/style directives
        value = self.policy
        try:
            if nonce and '{nonce}' in value:
                value = value.replace('{nonce}', nonce)
            elif nonce:
                # Append 'nonce-...' into script-src and style-src directives when present
                parts = [p.strip() for p in value.split(';') if p.strip()]
                for i, part in enumerate(parts):
                    lower = part.lower()
                    if lower.startswith('script-src '):
                        parts[i] = f"{part} 'nonce-{nonce}'"
                    elif lower.startswith('style-src '):
                        parts[i] = f"{part} 'nonce-{nonce}'"
                value = '; '.join(parts)
        except Exception:
            # Fallback to raw policy if manipulation fails
            value = self.policy
        if self.report_uri:
            # Append report-uri at the end
            value = f"{value}; report-uri {self.report_uri}"
        try:
            response[header_name] = value
        except Exception:
            pass
        return response


class ReadOnlyModeMiddleware:
    """Blocks unsafe HTTP methods during maintenance/restore windows.

    Behavior:
    - If request method is POST/PUT/PATCH/DELETE and either
      settings.READ_ONLY_MODE is True OR a lock file exists at
      f"{settings.BACKUPS_DIR}/.restore.lock", respond with 503 JSON.
    - Safe methods (GET/HEAD/OPTIONS) pass through.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        method = request.method.upper()
        path = request.path or ''
        try:
            in_read_only = bool(getattr(settings, 'READ_ONLY_MODE', False))
            lock_path = os.path.join(getattr(settings, 'BACKUPS_DIR', '/backups'), '.restore.lock')
            has_restore_lock = os.path.exists(lock_path)
        except Exception:
            in_read_only = False
            has_restore_lock = False

        if in_read_only or has_restore_lock:
            # Allow-list essential endpoints during restore/maintenance (safe methods only)
            allowed_prefixes = (
                '/api/jobs/',
                '/api/health/', '/api/readiness/',
                '/health/', '/readiness/',
                '/csp-report/',
            )
            is_safe = method in ('GET', 'HEAD', 'OPTIONS')
            allowed = is_safe and any(path.startswith(p) for p in allowed_prefixes)
            if not allowed and method in ('POST', 'PUT', 'PATCH', 'DELETE'):
                return JsonResponse({'detail': 'Read-only maintenance'}, status=503)

        return self.get_response(request)
