from django.urls import path
from projects.views_roles import (
    ProjectRoleListCreateView,
    ProjectRoleDetailView,
    ProjectRoleReorderView,
    ProjectRoleUsageView,
    ProjectRoleClearAssignmentsView,
    ProjectRoleSearchView,
)

urlpatterns = [
    path('project-roles/', ProjectRoleListCreateView.as_view(), name='project_roles_list_create'),
    path('project-roles/search/', ProjectRoleSearchView.as_view(), name='project_roles_search'),
    path('project-roles/<int:id>/', ProjectRoleDetailView.as_view(), name='project_roles_detail'),
    path('project-roles/<int:id>/usage/', ProjectRoleUsageView.as_view(), name='project_roles_usage'),
    path('project-roles/<int:id>/clear-assignments/', ProjectRoleClearAssignmentsView.as_view(), name='project_roles_clear_assignments'),
    path('project-roles/reorder/', ProjectRoleReorderView.as_view(), name='project_roles_reorder'),
]
