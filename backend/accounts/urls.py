from django.urls import path
from . import views
from .sso import (
    AzureSsoCallbackView,
    AzureSsoCompleteView,
    AzureSsoStartView,
    AzureSsoStatusView,
)


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
    path('users/<int:user_id>/link_person/', views.LinkUserPersonAdminView.as_view(), name='auth_link_user_person'),
    path('password_reset/', views.PasswordResetRequestView.as_view(), name='auth_password_reset'),
    path('password_reset_confirm/', views.PasswordResetConfirmView.as_view(), name='auth_password_reset_confirm'),
    path('invite/', views.InviteUserView.as_view(), name='auth_invite_user'),
    path('admin_audit/', views.AdminAuditLogsView.as_view(), name='auth_admin_audit'),
    path('notification-preferences/', views.NotificationPreferencesView.as_view(), name='notification_preferences'),
    path('push-subscriptions/', views.PushSubscriptionsView.as_view(), name='push_subscriptions'),
    path('push-subscriptions/<int:subscription_id>/', views.PushSubscriptionDeleteView.as_view(), name='push_subscription_delete'),
    path('push/test/', views.PushTestView.as_view(), name='push_test'),
    path('push/action/', views.PushActionView.as_view(), name='push_action'),
    path('in-app-notifications/', views.InAppNotificationsView.as_view(), name='in_app_notifications'),
    path('in-app-notifications/mark-read/', views.InAppNotificationsMarkReadView.as_view(), name='in_app_notifications_mark_read'),
    path('in-app-notifications/mark-all-read/', views.InAppNotificationsMarkAllReadView.as_view(), name='in_app_notifications_mark_all_read'),
    path('in-app-notifications/clear/', views.InAppNotificationsClearView.as_view(), name='in_app_notifications_clear'),
    path('sso/status/', AzureSsoStatusView.as_view(), name='auth_sso_status'),
    path('sso/azure/start/', AzureSsoStartView.as_view(), name='auth_sso_azure_start'),
    path('sso/azure/callback/', AzureSsoCallbackView.as_view(), name='auth_sso_azure_callback'),
    path('sso/complete/', AzureSsoCompleteView.as_view(), name='auth_sso_complete'),
]
