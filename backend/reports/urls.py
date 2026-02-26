from django.urls import path
from .views import (
    DepartmentsOverviewView,
    PreDeliverableCompletionView,
    PreDeliverableTeamPerformanceView,
)

urlpatterns = [
    path('departments/overview/', DepartmentsOverviewView.as_view(), name='departments_overview'),
    path('pre-deliverable-completion/', PreDeliverableCompletionView.as_view(), name='pre_deliverable_completion'),
    path('pre-deliverable-team-performance/', PreDeliverableTeamPerformanceView.as_view(), name='pre_deliverable_team_performance'),
]
