"""
URL configuration for workload-tracker project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from dashboard.views import DashboardView
import os

def health_check(request):
    """Health check endpoint for Docker and monitoring"""
    return JsonResponse({
        'status': 'healthy',
        'service': 'backend',
        'environment': os.getenv('DEBUG', 'false'),
    })

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),
    path('api/dashboard/', DashboardView.as_view(), name='dashboard'),
    path('api/people/', include('people.urls')),
    path('api/projects/', include('projects.urls')),
    path('api/assignments/', include('assignments.urls')),
    path('api/deliverables/', include('deliverables.urls')),
    path('api/departments/', include('departments.urls')),
    path('api/skills/', include('skills.urls')),
]

# Add Silk profiling URLs in development/debug mode
if settings.SILK_ENABLED:
    urlpatterns += [path('silk/', include('silk.urls', namespace='silk'))]