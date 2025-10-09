from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProjectViewSet
from django.urls import include

router = DefaultRouter()
router.register(r'', ProjectViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('', include('projects.urls_roles')),
]
