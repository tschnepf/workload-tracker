from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DepartmentViewSet, DepartmentsPageSnapshotView

router = DefaultRouter()
router.register(r'', DepartmentViewSet, basename='department')

urlpatterns = [
    path('snapshot/', DepartmentsPageSnapshotView.as_view(), name='departments_snapshot'),
    path('', include(router.urls)),
]
