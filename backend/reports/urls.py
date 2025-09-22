from django.urls import path
from .views import PreDeliverableCompletionView, PreDeliverableTeamPerformanceView

urlpatterns = [
    path('pre-deliverable-completion/', PreDeliverableCompletionView.as_view(), name='pre_deliverable_completion'),
    path('pre-deliverable-team-performance/', PreDeliverableTeamPerformanceView.as_view(), name='pre_deliverable_team_performance'),
]

