from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ProviderListView,
    ProviderDetailView,
    ProviderObjectCatalogView,
    ProviderCatalogView,
    MappingDefaultsView,
    IntegrationConnectionViewSet,
    IntegrationRuleViewSet,
    IntegrationRuleResyncView,
    IntegrationJobListView,
    IntegrationHealthView,
    IntegrationSecretKeyView,
)

router = DefaultRouter()
router.register(r'connections', IntegrationConnectionViewSet, basename='integration-connection')
router.register(r'rules', IntegrationRuleViewSet, basename='integration-rule')

urlpatterns = [
    path('providers/', ProviderListView.as_view(), name='integration-providers'),
    path('providers/<str:key>/', ProviderDetailView.as_view(), name='integration-provider-detail'),
    path('providers/<str:key>/objects/', ProviderObjectCatalogView.as_view(), name='integration-provider-objects'),
    path('providers/<str:key>/catalog/', ProviderCatalogView.as_view(), name='integration-provider-catalog'),
    path('providers/<str:provider_key>/jobs/', IntegrationJobListView.as_view(), name='integration-provider-jobs'),
    path('providers/<str:provider_key>/<str:object_key>/mapping/defaults/', MappingDefaultsView.as_view(), name='integration-mapping-defaults'),
    path('rules/<int:pk>/resync/', IntegrationRuleResyncView.as_view(), name='integration-rule-resync'),
    path('health/', IntegrationHealthView.as_view(), name='integration-health'),
    path('secret-key/', IntegrationSecretKeyView.as_view(), name='integration-secret-key'),
    path('', include(router.urls)),
]
