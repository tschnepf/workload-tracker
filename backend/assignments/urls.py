from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AssignmentViewSet

router = DefaultRouter()
router.register(r'', AssignmentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]