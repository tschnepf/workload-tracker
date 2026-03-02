from django.urls import path
from .planner_views import (
    ForecastPlannerBootstrapView,
    ForecastPlannerEvaluateView,
    ForecastScenarioDetailView,
    ForecastScenarioListView,
    ForecastScenarioSharedView,
)
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
    path('forecast/planner-bootstrap/', ForecastPlannerBootstrapView.as_view(), name='forecast_planner_bootstrap'),
    path('forecast/evaluate/', ForecastPlannerEvaluateView.as_view(), name='forecast_evaluate'),
    path('forecast/scenarios/', ForecastScenarioListView.as_view(), name='forecast_scenarios'),
    path('forecast/scenarios/<int:scenario_id>/', ForecastScenarioDetailView.as_view(), name='forecast_scenario_detail'),
    path('forecast/scenarios/shared/<str:token>/', ForecastScenarioSharedView.as_view(), name='forecast_scenario_shared'),
    path('pre-deliverable-completion/', PreDeliverableCompletionView.as_view(), name='pre_deliverable_completion'),
    path('pre-deliverable-team-performance/', PreDeliverableTeamPerformanceView.as_view(), name='pre_deliverable_team_performance'),
]
