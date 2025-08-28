"""
Deliverable URLs - STANDARDS COMPLIANT
Follows R2-REBUILD-STANDARDS.md: snake_case URL patterns
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DeliverableViewSet

router = DefaultRouter()
router.register(r'', DeliverableViewSet, basename='deliverable')

urlpatterns = router.urls