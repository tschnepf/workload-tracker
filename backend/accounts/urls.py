from django.urls import path
from . import views


urlpatterns = [
    path('me/', views.me, name='auth_me'),
    path('settings/', views.settings_view, name='auth_settings'),
    path('link_person/', views.link_person, name='auth_link_person'),
]

