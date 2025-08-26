"""
URL configuration for workload-tracker project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
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
    path('api/people/', include('people.urls')),
    path('api/projects/', include('projects.urls')),
    path('api/assignments/', include('assignments.urls')),
    path('api/departments/', include('departments.urls')),
]