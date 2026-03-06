"""
URL configuration for workload-tracker project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
import time
from django.db import connections
import os
try:
    import redis  # type: ignore
except Exception:  # pragma: no cover
    redis = None  # type: ignore
from django.conf import settings
from django.utils.module_loading import import_string
import json
from dashboard.views import DashboardView, DashboardBootstrapView
from core.job_views import JobStatusView, JobDownloadView
from core import backup_views as backups
import os
from accounts.token_views import (
    ThrottledTokenObtainPairView,
    ThrottledTokenRefreshView,
    ThrottledTokenVerifyView,
    ThrottledTokenLogoutView,
)
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from deliverables.ics_views import deliverables_ics
from assignments.views import AssignmentsPageSnapshotView
from core.views import UiBootstrapView, PeoplePageSnapshotView, SkillsPageSnapshotView, SettingsPageSnapshotView
from core.webpush import (
    web_push_globally_enabled,
    web_push_keys_configured,
    web_push_event_capabilities,
    web_push_feature_capabilities,
    web_push_public_key,
)

def health_check(request):
    """Health check endpoint for Docker and monitoring"""
    return JsonResponse({
        'status': 'healthy',
        'service': 'backend',
    })


def readiness_check(request):
    """Readiness probe: verifies DB (and Redis if configured). Returns 200 when ready, 503 otherwise."""
    checks = {}
    ok = True

    # Database check
    try:
        t0 = time.perf_counter()
        with connections['default'].cursor() as cursor:
            cursor.execute('SELECT 1;')
        db_rtt_ms = int((time.perf_counter() - t0) * 1000)
        checks['database'] = 'ok'
        checks['db_rtt_ms'] = db_rtt_ms
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
        'metrics': {
            'conn_max_age': int(os.getenv('DB_CONN_MAX_AGE', '60')),
            'conn_health_checks': os.getenv('DB_CONN_HEALTH_CHECKS', 'true').lower() == 'true',
        }
    }
    return JsonResponse(data, status=200 if ok else 503)


@extend_schema(
    responses=inline_serializer(
        name='CapabilitiesResponse',
        fields={
            'asyncJobs': serializers.BooleanField(),
            'aggregates': inline_serializer(
                name='CapabilitiesAggregates',
                fields={
                    'capacityHeatmap': serializers.BooleanField(),
                    'projectAvailability': serializers.BooleanField(),
                    'findAvailable': serializers.BooleanField(),
                    'gridSnapshot': serializers.BooleanField(),
                    'skillMatch': serializers.BooleanField(),
                },
            ),
            'cache': inline_serializer(
                name='CapabilitiesCache',
                fields={
                    'shortTtlAggregates': serializers.BooleanField(),
                    'aggregateTtlSeconds': serializers.IntegerField(),
                },
            ),
            'personalDashboard': serializers.BooleanField(),
            'projectRolesByDepartment': serializers.BooleanField(),
            'integrations': inline_serializer(
                name='CapabilitiesIntegrations',
                fields={'enabled': serializers.BooleanField()},
            ),
            'pwa': inline_serializer(
                name='CapabilitiesPwa',
                fields={
                    'enabled': serializers.BooleanField(),
                    'pushEnabled': serializers.BooleanField(),
                    'vapidPublicKey': serializers.CharField(allow_null=True, required=False),
                    'pushEvents': inline_serializer(
                        name='CapabilitiesPwaPushEvents',
                        fields={
                            'preDeliverableReminders': serializers.BooleanField(),
                            'dailyDigest': serializers.BooleanField(),
                            'assignmentChanges': serializers.BooleanField(),
                            'deliverableDateChanges': serializers.BooleanField(),
                        },
                        required=False,
                    ),
                    'pushFeatures': inline_serializer(
                        name='CapabilitiesPwaPushFeatures',
                        fields={
                            'rateLimit': serializers.BooleanField(),
                            'weekendMute': serializers.BooleanField(),
                            'quietHours': serializers.BooleanField(),
                            'snooze': serializers.BooleanField(),
                            'digestWindow': serializers.BooleanField(),
                            'actions': serializers.BooleanField(),
                            'deepLinks': serializers.BooleanField(),
                            'subscriptionHealthcheck': serializers.BooleanField(),
                        },
                        required=False,
                    ),
                    'offlineMode': serializers.CharField(),
                },
            ),
        },
    )
)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def capabilities_view(request):
    """Advertise backend feature capabilities (requires authentication).

    Returns booleans and simple settings for aggregate endpoints, async jobs, and cache TTL hints.
    """
    push_enabled = bool(web_push_globally_enabled() and web_push_keys_configured())
    caps = {
        'asyncJobs': os.getenv('ASYNC_JOBS', 'false').lower() == 'true',
        'aggregates': {
            'capacityHeatmap': True,
            'projectAvailability': True,
            'findAvailable': True,
            'gridSnapshot': True,
            'skillMatch': True,
        },
        'cache': {
            'shortTtlAggregates': os.getenv('SHORT_TTL_AGGREGATES', 'false').lower() == 'true',
            'aggregateTtlSeconds': int(os.getenv('AGGREGATE_CACHE_TTL', '30')),
        },
        'personalDashboard': True,
        'pwa': {
            'enabled': bool(getattr(settings, 'PWA_ENABLED', True)),
            'pushEnabled': push_enabled,
            'vapidPublicKey': web_push_public_key(),
            'pushEvents': web_push_event_capabilities(),
            'pushFeatures': web_push_feature_capabilities(),
            'offlineMode': 'shell',
        },
    }
    # Advertise department-scoped project roles capability to gate UIs if desired
    try:
        caps['projectRolesByDepartment'] = bool(settings.FEATURES.get('PROJECT_ROLES_BY_DEPARTMENT', False))
    except Exception:
        caps['projectRolesByDepartment'] = False
    try:
        caps['integrations'] = {'enabled': bool(getattr(settings, 'INTEGRATIONS_ENABLED', False))}
    except Exception:
        caps['integrations'] = {'enabled': False}
    return Response(caps)


def _spectacular_permission_classes():
    configured = (getattr(settings, 'SPECTACULAR_SETTINGS', {}) or {}).get('SERVE_PERMISSIONS')
    if not configured:
        return [AllowAny]
    resolved = []
    for entry in configured:
        if isinstance(entry, str):
            try:
                resolved.append(import_string(entry))
            except Exception:
                # Fail closed if a permission path is invalid.
                return [IsAuthenticated]
        else:
            resolved.append(entry)
    return resolved or [AllowAny]


class DynamicSpectacularAPIView(SpectacularAPIView):
    def get_permissions(self):
        return [perm() for perm in _spectacular_permission_classes()]


class DynamicSpectacularSwaggerView(SpectacularSwaggerView):
    def get_permissions(self):
        return [perm() for perm in _spectacular_permission_classes()]

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
    path('api/dashboard/bootstrap/', DashboardBootstrapView.as_view(), name='dashboard_bootstrap'),
    path('api/dashboard/', DashboardView.as_view(), name='dashboard'),
    # OpenAPI schema + Swagger UI
    path('api/schema/', DynamicSpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger/', DynamicSpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/capabilities/', capabilities_view, name='capabilities'),
    # Async job status and file download
    path('api/jobs/<str:job_id>/', JobStatusView.as_view(), name='job_status'),
    path('api/jobs/<str:job_id>/download/', JobDownloadView.as_view(), name='job_download'),
    # Database backups API
    path('api/backups/', backups.BackupListCreateView.as_view(), name='backups_list_create'),
    path('api/backups/status/', backups.BackupStatusView.as_view(), name='backups_status'),
    path('api/backups/upload-restore/', backups.UploadAndRestoreView.as_view(), name='backups_upload_restore'),
    path('api/backups/<str:id>/download/', backups.BackupDownloadView.as_view(), name='backups_download'),
    path('api/backups/<str:id>/', backups.BackupDeleteView.as_view(), name='backups_delete'),
    path('api/backups/<str:id>/restore/', backups.BackupRestoreView.as_view(), name='backups_restore'),
    path('api/people/', include('people.urls')),
    path('api/projects/', include('projects.urls')),
    path('api/assignments/', include('assignments.urls')),
    path('api/ui/bootstrap/', UiBootstrapView.as_view(), name='ui_bootstrap'),
    path('api/ui/assignments-page/', AssignmentsPageSnapshotView.as_view(), name='assignments_page_snapshot'),
    path('api/ui/people-page/', PeoplePageSnapshotView.as_view(), name='people_page_snapshot'),
    path('api/ui/skills-page/', SkillsPageSnapshotView.as_view(), name='skills_page_snapshot'),
    path('api/ui/settings-page/', SettingsPageSnapshotView.as_view(), name='settings_page_snapshot'),
    path('api/deliverables/', include('deliverables.urls')),
    path('api/departments/', include('departments.urls')),
    path('api/verticals/', include('verticals.urls')),
    path('api/skills/', include('skills.urls')),
    path('api/personal/', include('personal.urls')),
    path('api/core/', include('core.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/', include('roles.urls')),
    path('api/integrations/', include('integrations.urls')),
    # Public ICS calendar feeds (token-protected via querystring)
    path('calendar/deliverables.ics', deliverables_ics, name='calendar_deliverables_ics'),
]

# Add Silk profiling URLs in development/debug mode
if settings.SILK_ENABLED:
    urlpatterns += [path('silk/', include('silk.urls', namespace='silk'))]
