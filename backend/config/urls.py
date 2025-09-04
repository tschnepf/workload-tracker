"""
URL configuration for workload-tracker project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from dashboard.views import DashboardView
import os
from accounts.token_views import (
    ThrottledTokenObtainPairView,
    ThrottledTokenRefreshView,
    ThrottledTokenVerifyView,
)

def health_check(request):
    """Health check endpoint for Docker and monitoring"""
    return JsonResponse({
        'status': 'healthy',
        'service': 'backend',
        'environment': os.getenv('DEBUG', 'false'),
    })

urlpatterns = [
    path('admin/', admin.site.urls),
    # Unauthenticated liveness checks
    path('health/', health_check, name='health_root'),
    path('api/health/', health_check, name='health_check'),
    path('api/auth/', include('accounts.urls')),
    # JWT auth endpoints (throttled)
    path('api/token/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', ThrottledTokenRefreshView.as_view(), name='token_refresh'),
    path('api/token/verify/', ThrottledTokenVerifyView.as_view(), name='token_verify'),
    path('api/dashboard/', DashboardView.as_view(), name='dashboard'),
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
