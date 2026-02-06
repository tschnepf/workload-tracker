from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VerticalViewSet

router = DefaultRouter()
router.register(r'', VerticalViewSet, basename='vertical')

urlpatterns = [
    path('', include(router.urls)),
]
