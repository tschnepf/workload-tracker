from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet,
    DepartmentsPageSnapshotView,
    DepartmentOrgChartWorkspaceView,
    DepartmentReportingGroupCreateView,
    DepartmentReportingGroupDetailView,
    DepartmentReportingGroupLayoutView,
)

router = DefaultRouter()
router.register(r'', DepartmentViewSet, basename='department')

urlpatterns = [
    path('snapshot/', DepartmentsPageSnapshotView.as_view(), name='departments_snapshot'),
    path('<int:department_id>/org-chart-workspace/', DepartmentOrgChartWorkspaceView.as_view(), name='departments_org_chart_workspace'),
    path('<int:department_id>/reporting-groups/', DepartmentReportingGroupCreateView.as_view(), name='departments_reporting_groups_create'),
    path('<int:department_id>/reporting-groups/<int:group_id>/', DepartmentReportingGroupDetailView.as_view(), name='departments_reporting_groups_detail'),
    path('<int:department_id>/reporting-groups/layout/', DepartmentReportingGroupLayoutView.as_view(), name='departments_reporting_groups_layout'),
    path('', include(router.urls)),
]
