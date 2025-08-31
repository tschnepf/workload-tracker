"""
URL routing for roles app API endpoints.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RoleViewSet

# Create router and register viewsets
router = DefaultRouter()
router.register(r'roles', RoleViewSet, basename='role')

urlpatterns = [
    path('', include(router.urls)),
]