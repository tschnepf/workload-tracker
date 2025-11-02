from django.urls import path
from projects.views_roles import ProjectRoleListCreateView, ProjectRoleDetailView, ProjectRoleReorderView

urlpatterns = [
    path('project-roles/', ProjectRoleListCreateView.as_view(), name='project_roles_list_create'),
    path('project-roles/<int:id>/', ProjectRoleDetailView.as_view(), name='project_roles_detail'),
    path('project-roles/reorder/', ProjectRoleReorderView.as_view(), name='project_roles_reorder'),
]
