from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProjectViewSet
from django.urls import include

router = DefaultRouter()
router.register(r'', ProjectViewSet)

urlpatterns = [
    # Register role endpoints before router URLs so specific subpaths
    # like 'project-roles/' are not shadowed by the project detail route.
    path('', include('projects.urls_roles')),
    path('', include(router.urls)),
]
