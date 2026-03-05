from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProjectViewSet,
    ProjectAuditLogsView,
    ProjectChangeLogView,
    ProjectStatusDefinitionViewSet,
    ProjectTaskTemplateViewSet,
    ProjectTaskDetailView,
)

router = DefaultRouter()
router.register(r'task-templates', ProjectTaskTemplateViewSet, basename='project-task-template')
router.register(r'', ProjectViewSet)

urlpatterns = [
    path(
        'status-definitions/',
        ProjectStatusDefinitionViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='project_status_definitions',
    ),
    path(
        'status-definitions/<str:key>/',
        ProjectStatusDefinitionViewSet.as_view({'patch': 'partial_update', 'delete': 'destroy'}),
        name='project_status_definition_detail',
    ),
    # Register role endpoints before router URLs so specific subpaths
    # like 'project-roles/' are not shadowed by the project detail route.
    path('', include('projects.urls_roles')),
    path('', include('projects.urls_risks')),
    path('audit/', ProjectAuditLogsView.as_view(), name='project_audit'),
    path('<int:project_id>/change_log/', ProjectChangeLogView.as_view(), name='project_change_log'),
    path('tasks/<int:task_id>/', ProjectTaskDetailView.as_view(), name='project_task_detail'),
    path('', include(router.urls)),
]
