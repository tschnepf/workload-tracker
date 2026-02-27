from django.urls import path
from .views import (
    DepartmentsOverviewView,
    ForecastBootstrapView,
    PreDeliverableCompletionView,
    PreDeliverableTeamPerformanceView,
    RoleCapacityBootstrapView,
)

urlpatterns = [
    path('departments/overview/', DepartmentsOverviewView.as_view(), name='departments_overview'),
    path('role-capacity/bootstrap/', RoleCapacityBootstrapView.as_view(), name='role_capacity_bootstrap'),
    path('forecast/bootstrap/', ForecastBootstrapView.as_view(), name='forecast_bootstrap'),
    path('pre-deliverable-completion/', PreDeliverableCompletionView.as_view(), name='pre_deliverable_completion'),
    path('pre-deliverable-team-performance/', PreDeliverableTeamPerformanceView.as_view(), name='pre_deliverable_team_performance'),
]
