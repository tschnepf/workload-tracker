"""
Skills URLs configuration
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'skill-tags', views.SkillTagViewSet, basename='skilltag')
router.register(r'person-skills', views.PersonSkillViewSet, basename='personskill')

urlpatterns = [
    path('', include(router.urls)),
]