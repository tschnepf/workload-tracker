from django.urls import path
from .views import PreDeliverableGlobalSettingsView, UtilizationSchemeView, ProjectRoleView

urlpatterns = [
    path('pre-deliverable-global-settings/', PreDeliverableGlobalSettingsView.as_view(), name='pre_deliverable_global_settings'),
    path('utilization_scheme/', UtilizationSchemeView.as_view(), name='utilization_scheme'),
    path('project_roles/', ProjectRoleView.as_view(), name='project_roles'),
]
