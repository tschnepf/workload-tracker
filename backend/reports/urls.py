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
from .network_views import (
    NetworkBootstrapView,
    NetworkGraphView,
)
from .person_report_views import (
    PersonReportBootstrapView,
    PersonReportPeopleView,
    PersonReportProfileView,
    PersonReportGoalsView,
    PersonReportGoalDetailView,
    PersonReportCheckinsView,
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
    path('network/bootstrap/', NetworkBootstrapView.as_view(), name='network_bootstrap'),
    path('network/graph/', NetworkGraphView.as_view(), name='network_graph'),
    path('person-report/bootstrap/', PersonReportBootstrapView.as_view(), name='person_report_bootstrap'),
    path('person-report/people/', PersonReportPeopleView.as_view(), name='person_report_people'),
    path('person-report/profile/', PersonReportProfileView.as_view(), name='person_report_profile'),
    path('person-report/goals/', PersonReportGoalsView.as_view(), name='person_report_goals'),
    path('person-report/goals/<int:goal_id>/', PersonReportGoalDetailView.as_view(), name='person_report_goal_detail'),
    path('person-report/checkins/', PersonReportCheckinsView.as_view(), name='person_report_checkins'),
]
