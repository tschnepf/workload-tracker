from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ProviderListView,
    ProviderDetailView,
    ProviderObjectCatalogView,
    ProviderCatalogView,
    ProviderCredentialView,
    ProviderResetView,
    ProviderConnectStartView,
    ProviderConnectCallbackView,
    MappingDefaultsView,
    IntegrationConnectionViewSet,
    IntegrationRuleViewSet,
    IntegrationRuleResyncView,
    IntegrationJobListView,
    IntegrationHealthView,
    IntegrationJobRetryView,
    IntegrationSecretKeyView,
    IntegrationConnectionTestView,
    IntegrationActivityTestView,
    ProjectMatchingSuggestionView,
    ProjectMatchingConfirmView,
)

router = DefaultRouter()
router.register(r'connections', IntegrationConnectionViewSet, basename='integration-connection')
router.register(r'rules', IntegrationRuleViewSet, basename='integration-rule')

urlpatterns = [
    path('providers/', ProviderListView.as_view(), name='integration-providers'),
    path('providers/<str:key>/', ProviderDetailView.as_view(), name='integration-provider-detail'),
    path('providers/<str:key>/objects/', ProviderObjectCatalogView.as_view(), name='integration-provider-objects'),
    path('providers/<str:key>/catalog/', ProviderCatalogView.as_view(), name='integration-provider-catalog'),
    path('providers/<str:key>/credentials/', ProviderCredentialView.as_view(), name='integration-provider-credentials'),
    path('providers/<str:key>/connect/start/', ProviderConnectStartView.as_view(), name='integration-provider-connect-start'),
    path('providers/<str:key>/connect/callback/', ProviderConnectCallbackView.as_view(), name='integration-provider-connect-callback'),
    path('providers/<str:key>/reset/', ProviderResetView.as_view(), name='integration-provider-reset'),
    path('providers/<str:provider_key>/jobs/', IntegrationJobListView.as_view(), name='integration-provider-jobs'),
    path('jobs/<int:pk>/retry/', IntegrationJobRetryView.as_view(), name='integration-job-retry'),
    path('connections/<int:pk>/test/', IntegrationConnectionTestView.as_view(), name='integration-connection-test'),
    path('connections/<int:pk>/test-activity/', IntegrationActivityTestView.as_view(), name='integration-activity-test'),
    path('providers/<str:provider_key>/<str:object_key>/mapping/defaults/', MappingDefaultsView.as_view(), name='integration-mapping-defaults'),
    path('rules/<int:pk>/resync/', IntegrationRuleResyncView.as_view(), name='integration-rule-resync'),
    path('health/', IntegrationHealthView.as_view(), name='integration-health'),
    path('secret-key/', IntegrationSecretKeyView.as_view(), name='integration-secret-key'),
    path('providers/<str:provider_key>/projects/matching/suggestions/', ProjectMatchingSuggestionView.as_view(), name='integration-project-matching-suggestions'),
    path('providers/<str:provider_key>/projects/matching/confirm/', ProjectMatchingConfirmView.as_view(), name='integration-project-matching-confirm'),
    path('', include(router.urls)),
]
