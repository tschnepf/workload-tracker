"""
Deliverable URLs - STANDARDS COMPLIANT
Follows R2-REBUILD-STANDARDS.md: snake_case URL patterns
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DeliverableViewSet,
    DeliverableAssignmentViewSet,
    PreDeliverableItemViewSet,
    DeliverableTaskTemplateViewSet,
    DeliverableTaskViewSet,
    DeliverableQATaskViewSet,
)

router = DefaultRouter()
router.register(r'assignments', DeliverableAssignmentViewSet, basename='deliverable-assignment')
router.register(r'pre_deliverable_items', PreDeliverableItemViewSet, basename='pre-deliverable-item')
router.register(r'task_templates', DeliverableTaskTemplateViewSet, basename='deliverable-task-template')
router.register(r'tasks', DeliverableTaskViewSet, basename='deliverable-task')
router.register(r'qa_tasks', DeliverableQATaskViewSet, basename='deliverable-qa-task')
router.register(r'', DeliverableViewSet, basename='deliverable')

urlpatterns = router.urls
