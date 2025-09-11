"""
URL configuration for workload-tracker project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.db import connections
import os
try:
    import redis  # type: ignore
except Exception:  # pragma: no cover
    redis = None  # type: ignore
from django.conf import settings
import json
from dashboard.views import DashboardView
from core.job_views import JobStatusView, JobDownloadView
import os
from accounts.token_views import (
    ThrottledTokenObtainPairView,
    ThrottledTokenRefreshView,
    ThrottledTokenVerifyView,
    ThrottledTokenLogoutView,
)
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

def health_check(request):
    """Health check endpoint for Docker and monitoring"""
    return JsonResponse({
        'status': 'healthy',
        'service': 'backend',
        'environment': os.getenv('DEBUG', 'false'),
    })


def readiness_check(request):
    """Readiness probe: verifies DB (and Redis if configured). Returns 200 when ready, 503 otherwise."""
    checks = {}
    ok = True

    # Database check
    try:
        with connections['default'].cursor() as cursor:
            cursor.execute('SELECT 1;')
            checks['database'] = 'ok'
    except Exception as e:
        checks['database'] = f'error: {e.__class__.__name__}'
        ok = False

    # Redis check (optional)
    redis_url = os.getenv('REDIS_URL')
    if redis_url and redis is not None:
        try:
            client = redis.from_url(redis_url, socket_connect_timeout=0.5)  # type: ignore[attr-defined]
            client.ping()
            checks['redis'] = 'ok'
        except Exception as e:
            checks['redis'] = f'error: {e.__class__.__name__}'
            ok = False

    data = {
        'status': 'ready' if ok else 'degraded',
        'checks': checks,
    }
    return JsonResponse(data, status=200 if ok else 503)

urlpatterns = [
    path('admin/', admin.site.urls),
    # Unauthenticated liveness checks
    path('health/', health_check, name='health_root'),
    path('readiness/', readiness_check, name='readiness_root'),
    path('api/health/', health_check, name='health_check'),
    path('api/readiness/', readiness_check, name='readiness_check'),
    path('csp-report/', lambda r: (lambda _json: (JsonResponse({}, status=204) if not _json else ( __import__('logging').getLogger('security').warning('csp-violation', extra={'payload': _json}) or JsonResponse({}, status=204) )))( (lambda body: (json.loads(body) if body else {}))( (r.body.decode('utf-8') if r.body else '') ) ), name='csp_report'),
    path('api/auth/', include('accounts.urls')),
    # JWT auth endpoints (throttled)
    path('api/token/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', ThrottledTokenRefreshView.as_view(), name='token_refresh'),
    path('api/token/verify/', ThrottledTokenVerifyView.as_view(), name='token_verify'),
    path('api/token/logout/', ThrottledTokenLogoutView.as_view(), name='token_logout'),
    path('api/dashboard/', DashboardView.as_view(), name='dashboard'),
    # OpenAPI schema + Swagger UI
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    # Async job status and file download
    path('api/jobs/<str:job_id>/', JobStatusView.as_view(), name='job_status'),
    path('api/jobs/<str:job_id>/download/', JobDownloadView.as_view(), name='job_download'),
    path('api/people/', include('people.urls')),
    path('api/projects/', include('projects.urls')),
    path('api/assignments/', include('assignments.urls')),
    path('api/deliverables/', include('deliverables.urls')),
    path('api/departments/', include('departments.urls')),
    path('api/skills/', include('skills.urls')),
    path('api/', include('roles.urls')),
]

# Add Silk profiling URLs in development/debug mode
if settings.SILK_ENABLED:
    urlpatterns += [path('silk/', include('silk.urls', namespace='silk'))]
