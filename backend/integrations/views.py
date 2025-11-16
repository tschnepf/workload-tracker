from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from cryptography.fernet import Fernet

from .models import IntegrationConnection, IntegrationSetting, IntegrationRule, IntegrationJob, IntegrationSecretKey
from .serializers import (
    IntegrationConnectionSerializer,
    IntegrationRuleSerializer,
    ProviderSerializer,
    IntegrationJobSerializer,
)
from .registry import get_registry
from .scheduler import scheduler_health
from .services import clear_resync_and_schedule
from .encryption import reset_key_cache


class ProviderListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        registry = get_registry()
        providers = []
        for meta in registry.list_providers():
            providers.append({
                'key': meta.key,
                'displayName': meta.display_name,
                'schemaVersion': meta.schema_version,
                'metadata': meta.raw,
            })
        return Response(providers)


class ProviderDetailView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, key: str):
        registry = get_registry()
        provider = registry.get_provider(key)
        if not provider:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProviderSerializer(provider)
        return Response(serializer.data)


class ProviderObjectCatalogView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, key: str):
        registry = get_registry()
        provider = registry.get_provider(key)
        if not provider:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(provider.raw.get('objects', []))


class ProviderCatalogView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, key: str):
        registry = get_registry()
        provider = registry.get_provider(key)
        if not provider:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        catalog = {
            'key': provider.key,
            'displayName': provider.display_name,
            'schemaVersion': provider.schema_version,
            'rateLimits': provider.raw.get('rateLimits', {}),
            'baseUrlVariants': provider.raw.get('baseUrlVariants', {}),
            'objects': [],
        }
        for obj in provider.objects():
            entry = dict(obj)
            entry['fieldSignatureHash'] = provider.field_signature(obj.get('key', '')) or ''
            catalog['objects'].append(entry)
        return Response(catalog)


class MappingDefaultsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, provider_key: str, object_key: str):
        connection_id = request.query_params.get('connectionId')
        registry = get_registry()
        provider = registry.get_provider(provider_key)
        if not provider:
            return Response({'detail': 'Provider not found'}, status=status.HTTP_404_NOT_FOUND)
        obj = registry.get_object_catalog(provider_key, object_key)
        if not obj:
            return Response({'detail': 'Object not found'}, status=status.HTTP_404_NOT_FOUND)
        signature = provider.field_signature(object_key) or ''
        mapping_meta = (obj.get('mapping') or {})
        resp = {
            'schemaVersion': mapping_meta.get('schemaVersion'),
            'defaults': mapping_meta.get('defaults', []),
            'fieldSignatureHash': signature,
            'overrides': None,
            'stale': False,
        }
        if connection_id:
            try:
                connection = IntegrationConnection.objects.select_related('provider').get(id=connection_id, provider__key=provider_key)
            except IntegrationConnection.DoesNotExist:
                return Response({'detail': 'Connection not found'}, status=status.HTTP_404_NOT_FOUND)
            setting = IntegrationSetting.objects.filter(connection=connection, key=f"mapping.{object_key}").first()
            if setting:
                resp['overrides'] = setting.data
                resp['stale'] = (
                    setting.data.get('version') != mapping_meta.get('schemaVersion')
                    or setting.data.get('fieldSignatureHash') != signature
                )
        return Response(resp)

    def post(self, request, provider_key: str, object_key: str):
        registry = get_registry()
        provider = registry.get_provider(provider_key)
        if not provider:
            return Response({'detail': 'Provider not found'}, status=status.HTTP_404_NOT_FOUND)
        obj = registry.get_object_catalog(provider_key, object_key)
        if not obj:
            return Response({'detail': 'Object not found'}, status=status.HTTP_404_NOT_FOUND)
        connection_id = request.data.get('connectionId')
        if not connection_id:
            return Response({'detail': 'connectionId is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            connection = IntegrationConnection.objects.select_related('provider').get(id=connection_id, provider__key=provider_key)
        except IntegrationConnection.DoesNotExist:
            return Response({'detail': 'Connection not found'}, status=status.HTTP_404_NOT_FOUND)
        payload = {
            'version': request.data.get('version') or obj.get('mapping', {}).get('schemaVersion'),
            'fieldSignatureHash': provider.field_signature(object_key),
            'mappings': request.data.get('mappings', []),
        }
        if not isinstance(payload['mappings'], list):
            return Response({'detail': 'mappings must be a list'}, status=status.HTTP_400_BAD_REQUEST)
        setting, _ = IntegrationSetting.objects.update_or_create(
            connection=connection,
            key=f"mapping.{object_key}",
            defaults={'data': payload},
        )
        return Response(setting.data, status=status.HTTP_200_OK)


class IntegrationConnectionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminUser]
    serializer_class = IntegrationConnectionSerializer
    queryset = IntegrationConnection.objects.select_related('provider').all()

    def get_queryset(self):
        qs = super().get_queryset()
        provider = self.request.query_params.get('provider')
        if provider:
            qs = qs.filter(provider__key=provider)
        return qs


class IntegrationRuleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminUser]
    serializer_class = IntegrationRuleSerializer
    queryset = IntegrationRule.objects.select_related('connection', 'connection__provider').all()

    def get_queryset(self):
        qs = super().get_queryset()
        connection = self.request.query_params.get('connection')
        if connection:
            qs = qs.filter(connection_id=connection)
        provider = self.request.query_params.get('provider')
        if provider:
            qs = qs.filter(connection__provider__key=provider)
        return qs


class IntegrationRuleResyncView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk: int):
        scope = (request.data or {}).get('scope') if isinstance(request.data, dict) else None
        rule = get_object_or_404(
            IntegrationRule.objects.select_related('connection', 'connection__provider'),
            pk=pk,
        )
        state = clear_resync_and_schedule(rule, scope=scope or 'delta')
        serializer = IntegrationRuleSerializer(rule)
        return Response({
            'rule': serializer.data,
            'state': state,
        })


class IntegrationJobListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, provider_key: str):
        qs = IntegrationJob.objects.select_related('connection', 'provider').filter(provider__key=provider_key).order_by('-created_at')
        connection_id = request.query_params.get('connection')
        if connection_id:
            qs = qs.filter(connection_id=connection_id)
        object_key = request.query_params.get('object')
        if object_key:
            qs = qs.filter(object_key=object_key)
        try:
            limit = int(request.query_params.get('limit', 50))
        except Exception:
            limit = 50
        limit = max(1, min(limit, 200))
        qs = qs[:limit]
        serializer = IntegrationJobSerializer(qs, many=True)
        return Response({'items': serializer.data})


class IntegrationHealthView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        health = scheduler_health()
        status_code = status.HTTP_200_OK if health.get('healthy') else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response(health, status=status_code)


class IntegrationSecretKeyView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        configured = IntegrationSecretKey.configured()
        return Response({'configured': configured})

    def post(self, request):
        secret = (request.data or {}).get('secretKey') if isinstance(request.data, dict) else None
        if not isinstance(secret, str) or not secret.strip():
            return Response({'detail': 'secretKey is required'}, status=status.HTTP_400_BAD_REQUEST)
        value = secret.strip()
        try:
            # Validate key shape
            Fernet(value.encode('utf-8'))
        except Exception:
            return Response({'detail': 'secretKey must be a valid Fernet key'}, status=status.HTTP_400_BAD_REQUEST)
        IntegrationSecretKey.set_plaintext(value)
        reset_key_cache()
        return Response({'configured': True}, status=status.HTTP_200_OK)
