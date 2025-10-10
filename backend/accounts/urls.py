from django.urls import path
from . import views


urlpatterns = [
    path('me/', views.MeView.as_view(), name='auth_me'),
    path('settings/', views.SettingsView.as_view(), name='auth_settings'),
    path('link_person/', views.LinkPersonView.as_view(), name='auth_link_person'),
    path('change_password/', views.ChangePasswordView.as_view(), name='auth_change_password'),
    path('create_user/', views.CreateUserView.as_view(), name='auth_create_user'),
    path('set_password/', views.SetPasswordView.as_view(), name='auth_set_password'),
    path('users/', views.ListUsersView.as_view(), name='auth_users'),
    path('users/<int:user_id>/', views.DeleteUserView.as_view(), name='auth_delete_user'),
    path('users/<int:user_id>/role/', views.UpdateUserRoleView.as_view(), name='auth_update_user_role'),
    path('admin_audit/', views.AdminAuditLogsView.as_view(), name='auth_admin_audit'),
    path('notification-preferences/', views.NotificationPreferencesView.as_view(), name='notification_preferences'),
]
