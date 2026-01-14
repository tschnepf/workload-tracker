from django.urls import path
from .views_risks import ProjectRiskViewSet, ProjectRiskAttachmentDownloadView


project_risk_list = ProjectRiskViewSet.as_view({
    'get': 'list',
    'post': 'create',
})

project_risk_detail = ProjectRiskViewSet.as_view({
    'get': 'retrieve',
    'patch': 'partial_update',
    'put': 'update',
    'delete': 'destroy',
})


urlpatterns = [
    path('<int:project_id>/risks/', project_risk_list, name='project_risk_list'),
    path('<int:project_id>/risks/<int:risk_id>/', project_risk_detail, name='project_risk_detail'),
    path('<int:project_id>/risks/<int:risk_id>/attachment/', ProjectRiskAttachmentDownloadView.as_view(), name='project_risk_attachment'),
]
