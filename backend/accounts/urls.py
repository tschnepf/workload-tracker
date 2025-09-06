from django.urls import path
from . import views


urlpatterns = [
    path('me/', views.me, name='auth_me'),
    path('settings/', views.settings_view, name='auth_settings'),
    path('link_person/', views.link_person, name='auth_link_person'),
    path('change_password/', views.change_password, name='auth_change_password'),
    path('create_user/', views.create_user, name='auth_create_user'),
    path('set_password/', views.set_password, name='auth_set_password'),
    path('users/', views.list_users, name='auth_users'),
    path('users/<int:user_id>/', views.delete_user, name='auth_delete_user'),
]
