from django.urls import path
from .views import PreDeliverableGlobalSettingsView

urlpatterns = [
    path('pre-deliverable-global-settings/', PreDeliverableGlobalSettingsView.as_view(), name='pre_deliverable_global_settings'),
]

