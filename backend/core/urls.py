from django.urls import path
from .views import (
    PreDeliverableGlobalSettingsView,
    UtilizationSchemeView,
    ProjectRoleView,
    DepartmentProjectRolesMapView,
    DepartmentProjectRolesView,
    DepartmentProjectRoleDeleteView,
)

urlpatterns = [
    path('pre-deliverable-global-settings/', PreDeliverableGlobalSettingsView.as_view(), name='pre_deliverable_global_settings'),
    path('utilization_scheme/', UtilizationSchemeView.as_view(), name='utilization_scheme'),
    path('project_roles/', ProjectRoleView.as_view(), name='project_roles'),
    # Department ↔ Project Role mapping endpoints
    path('department_project_roles/map/', DepartmentProjectRolesMapView.as_view(), name='department_project_roles_map'),
    path('department_project_roles/', DepartmentProjectRolesView.as_view(), name='department_project_roles'),
    path('department_project_roles/<int:department>/<int:role_id>/', DepartmentProjectRoleDeleteView.as_view(), name='department_project_roles_delete'),
]
