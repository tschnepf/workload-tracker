from django.urls import path
from .views import (
    PreDeliverableGlobalSettingsView,
    AutoHoursRoleSettingsView,
    AutoHoursTemplatesView,
    AutoHoursTemplateDetailView,
    AutoHoursTemplateRoleSettingsView,
    UtilizationSchemeView,
    ProjectRoleView,
    CalendarFeedsView,
    DeliverablePhaseMappingSettingsView,
    QATaskSettingsView,
)

urlpatterns = [
    path('pre-deliverable-global-settings/', PreDeliverableGlobalSettingsView.as_view(), name='pre_deliverable_global_settings'),
    path('project-template-settings/', AutoHoursRoleSettingsView.as_view(), name='project_template_settings'),
    path('project-templates/', AutoHoursTemplatesView.as_view(), name='project_templates'),
    path('project-templates/<int:template_id>/', AutoHoursTemplateDetailView.as_view(), name='project_template_detail'),
    path('project-template-settings/<int:template_id>/', AutoHoursTemplateRoleSettingsView.as_view(), name='project_template_role_settings'),
    path('utilization_scheme/', UtilizationSchemeView.as_view(), name='utilization_scheme'),
    path('project_roles/', ProjectRoleView.as_view(), name='project_roles'),
    path('calendar_feeds/', CalendarFeedsView.as_view(), name='calendar_feeds'),
    path('deliverable_phase_mapping/', DeliverablePhaseMappingSettingsView.as_view(), name='deliverable_phase_mapping'),
    path('qa_task_settings/', QATaskSettingsView.as_view(), name='qa_task_settings'),
]
