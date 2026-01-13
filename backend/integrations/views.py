from __future__ import annotations

import json
import logging
from datetime import timedelta
from typing import Any

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets, serializers
from rest_framework.permissions import IsAdminUser, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, inline_serializer, OpenApiParameter, OpenApiResponse, OpenApiTypes
from cryptography.fernet import Fernet
from requests import RequestException, HTTPError

from .models import (
    IntegrationConnection,
    IntegrationSetting,
    IntegrationRule,
    IntegrationJob,
    IntegrationSecretKey,
    IntegrationProvider,
    IntegrationProviderCredential,
)
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
from .matching import suggest_project_matches, confirm_project_matches
from .tasks import run_integration_rule
from .audit import record_audit_event
from .providers.bqe.projects_client import BQEProjectsClient
from .providers.bqe.errors import translate_bqe_error
from .exceptions import IntegrationProviderError
from .logging_utils import integration_log_extra
from .http import IntegrationHttpClient
from .oauth import (
    OAuthError,
    OAuthStateManager,
    build_authorization_url,
    exchange_code_for_connection,
    connection_has_token,
    get_connection_access_token,
    get_connection_endpoint,
)

logger = logging.getLogger(__name__)


ProviderCredentialSerializer = inline_serializer(
    name='ProviderCredential',
    fields={
        'clientId': serializers.CharField(allow_blank=True),
        'redirectUri': serializers.CharField(allow_blank=True),
        'hasClientSecret': serializers.BooleanField(),
        'configured': serializers.BooleanField(),
    },
)

ProviderCredentialRequestSerializer = inline_serializer(
    name='ProviderCredentialRequest',
    fields={
        'clientId': serializers.CharField(),
        'redirectUri': serializers.CharField(),
        'clientSecret': serializers.CharField(required=False, allow_blank=True),
    },
)

ProviderResetRequestSerializer = inline_serializer(
    name='ProviderResetRequest',
    fields={'confirm': serializers.BooleanField()},
)

ProviderResetResponseSerializer = inline_serializer(
    name='ProviderResetResponse',
    fields={'reset': serializers.BooleanField()},
)

ProviderConnectStartRequestSerializer = inline_serializer(
    name='ProviderConnectStartRequest',
    fields={'connectionId': serializers.IntegerField()},
)

ProviderConnectStartResponseSerializer = inline_serializer(
    name='ProviderConnectStartResponse',
    fields={
        'authorizeUrl': serializers.CharField(),
        'state': serializers.CharField(),
    },
)

ProviderCatalogSerializer = inline_serializer(
    name='ProviderCatalog',
    fields={
        'key': serializers.CharField(),
        'displayName': serializers.CharField(),
        'schemaVersion': serializers.CharField(),
        'rateLimits': serializers.DictField(required=False),
        'baseUrlVariants': serializers.DictField(required=False),
        'objects': serializers.ListField(child=serializers.DictField()),
    },
)

MappingDefaultsRequestSerializer = inline_serializer(
    name='MappingDefaultsRequest',
    fields={
        'connectionId': serializers.IntegerField(),
        'version': serializers.CharField(required=False, allow_blank=True),
        'mappings': serializers.ListField(child=serializers.DictField()),
    },
)

MappingDefaultsResponseSerializer = inline_serializer(
    name='MappingDefaultsResponse',
    fields={
        'schemaVersion': serializers.CharField(allow_null=True, required=False),
        'defaults': serializers.ListField(child=serializers.DictField()),
        'fieldSignatureHash': serializers.CharField(),
        'overrides': serializers.DictField(required=False, allow_null=True),
        'stale': serializers.BooleanField(),
    },
)

IntegrationRuleResyncResponseSerializer = inline_serializer(
    name='IntegrationRuleResyncResponse',
    fields={
        'rule': IntegrationRuleSerializer(),
        'state': serializers.DictField(),
    },
)

IntegrationJobListResponseSerializer = inline_serializer(
    name='IntegrationJobListResponse',
    fields={'items': IntegrationJobSerializer(many=True)},
)

IntegrationHealthResponseSerializer = inline_serializer(
    name='IntegrationHealthResponse',
    fields={
        'healthy': serializers.BooleanField(),
        'workersAvailable': serializers.BooleanField(),
        'cacheAvailable': serializers.BooleanField(),
        'message': serializers.CharField(allow_null=True, required=False),
        'schedulerPaused': serializers.BooleanField(),
        'jobs': inline_serializer(
            name='IntegrationJobHealthSummary',
            fields={
                'running': serializers.IntegerField(),
                'lastJobAt': serializers.CharField(allow_null=True, required=False),
                'lastFailureAt': serializers.CharField(allow_null=True, required=False),
                'recent': inline_serializer(
                    name='IntegrationJobHealthRecent',
                    fields={
                        'windowHours': serializers.IntegerField(),
                        'total': serializers.IntegerField(),
                        'succeeded': serializers.IntegerField(),
                        'failed': serializers.IntegerField(),
                        'successRate': serializers.FloatField(allow_null=True, required=False),
                        'itemsProcessed': serializers.IntegerField(),
                    },
                ),
            },
        ),
    },
)

IntegrationJobRetryResponseSerializer = inline_serializer(
    name='IntegrationJobRetryResponse',
    fields={'queued': serializers.BooleanField()},
)

IntegrationTestResponseSerializer = inline_serializer(
    name='IntegrationTestResponse',
    fields={
        'ok': serializers.BooleanField(),
        'provider': serializers.CharField(),
        'environment': serializers.CharField(),
        'checkedAt': serializers.CharField(),
        'sampleCount': serializers.IntegerField(),
        'message': serializers.CharField(required=False, allow_blank=True),
    },
)

IntegrationSecretKeyRequestSerializer = inline_serializer(
    name='IntegrationSecretKeyRequest',
    fields={'secretKey': serializers.CharField()},
)

IntegrationSecretKeyResponseSerializer = inline_serializer(
    name='IntegrationSecretKeyResponse',
    fields={'configured': serializers.BooleanField()},
)

ProjectMatchingConfirmRequestSerializer = inline_serializer(
    name='ProjectMatchingConfirmRequest',
    fields={
        'connectionId': serializers.IntegerField(),
        'matches': serializers.ListField(child=serializers.DictField(), required=False),
        'enableRule': serializers.BooleanField(required=False),
    },
)


def _job_health_summary() -> dict:
    window_hours = 24
    window_start = timezone.now() - timedelta(hours=window_hours)
    recent_jobs = IntegrationJob.objects.filter(created_at__gte=window_start)
    total = recent_jobs.count()
    succeeded = recent_jobs.filter(status='succeeded').count()
    failed = recent_jobs.filter(status='failed').count()
    running = IntegrationJob.objects.filter(status='running').count()
    last_job = IntegrationJob.objects.order_by('-created_at').first()
    last_failure = IntegrationJob.objects.filter(status='failed').order_by('-finished_at').first()

    items_processed = 0
    for metrics in recent_jobs.values_list('metrics', flat=True):
        if isinstance(metrics, dict):
            for value in metrics.values():
                if isinstance(value, int):
                    items_processed += value

    return {
        'running': running,
        'lastJobAt': (last_job.finished_at or last_job.created_at).isoformat() if last_job else None,
        'lastFailureAt': (
            (last_failure.finished_at or last_failure.created_at).isoformat()
            if last_failure
            else None
        ),
        'recent': {
            'windowHours': window_hours,
            'total': total,
            'succeeded': succeeded,
            'failed': failed,
            'successRate': (succeeded / total) if total else None,
            'itemsProcessed': items_processed,
        },
    }


def _ensure_provider_model(key: str) -> IntegrationProvider | None:
    registry = get_registry()
    meta = registry.get_provider(key)
    if not meta:
        return None
    provider, _ = IntegrationProvider.objects.get_or_create(
        key=meta.key,
        defaults={
            'display_name': meta.display_name,
            'metadata': meta.raw,
            'schema_version': meta.schema_version,
        },
    )
    return provider


class ProviderListView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        operation_id='integrations_providers_list',
        responses=ProviderSerializer(many=True),
    )
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

    @extend_schema(
        operation_id='integrations_providers_detail',
        responses=ProviderSerializer,
    )
    def get(self, request, key: str):
        registry = get_registry()
        provider = registry.get_provider(key)
        if not provider:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProviderSerializer(provider)
        return Response(serializer.data)


class ProviderObjectCatalogView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        responses=OpenApiResponse(
            response=OpenApiTypes.OBJECT,
            description='List of provider object definitions.',
        )
    )
    def get(self, request, key: str):
        registry = get_registry()
        provider = registry.get_provider(key)
        if not provider:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(provider.raw.get('objects', []))


class ProviderCatalogView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=ProviderCatalogSerializer)
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


class ProviderCredentialView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=ProviderCredentialSerializer)
    def get(self, request, key: str):
        provider = _ensure_provider_model(key)
        if not provider:
            return Response({'detail': 'Provider not found'}, status=status.HTTP_404_NOT_FOUND)
        credential = getattr(provider, 'credentials', None)
        data = {
            'clientId': credential.client_id if credential else '',
            'redirectUri': credential.redirect_uri if credential else '',
            'hasClientSecret': bool(credential and credential.has_client_secret),
        }
        data['configured'] = bool(data['clientId'] and data['redirectUri'] and data['hasClientSecret'])
        return Response(data)

    @extend_schema(request=ProviderCredentialRequestSerializer, responses=ProviderCredentialSerializer)
    def post(self, request, key: str):
        provider = _ensure_provider_model(key)
        if not provider:
            return Response({'detail': 'Provider not found'}, status=status.HTTP_404_NOT_FOUND)
        payload = request.data or {}
        client_id = (payload.get('clientId') or '').strip()
        redirect_uri = (payload.get('redirectUri') or '').strip()
        client_secret = (payload.get('clientSecret') or '').strip()
        if not client_id:
            return Response({'detail': 'clientId is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not redirect_uri:
            return Response({'detail': 'redirectUri is required'}, status=status.HTTP_400_BAD_REQUEST)
        credential, _ = IntegrationProviderCredential.objects.get_or_create(provider=provider)
        credential.client_id = client_id
        credential.redirect_uri = redirect_uri
        if client_secret:
            credential.set_client_secret(client_secret)
        elif not credential.has_client_secret:
            return Response({'detail': 'clientSecret is required'}, status=status.HTTP_400_BAD_REQUEST)
        credential.save()
        data = {
            'clientId': credential.client_id,
            'redirectUri': credential.redirect_uri,
            'hasClientSecret': credential.has_client_secret,
        }
        data['configured'] = bool(data['clientId'] and data['redirectUri'] and data['hasClientSecret'])
        return Response(data, status=status.HTTP_200_OK)


class ProviderResetView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=ProviderResetRequestSerializer, responses=ProviderResetResponseSerializer)
    def post(self, request, key: str):
        provider = _ensure_provider_model(key)
        if not provider:
            return Response({'detail': 'Provider not found'}, status=status.HTTP_404_NOT_FOUND)
        confirmed = bool((request.data or {}).get('confirm')) if isinstance(request.data, dict) else False
        if not confirmed:
            return Response({'detail': 'confirm=true is required to reset the provider'}, status=status.HTTP_400_BAD_REQUEST)
        IntegrationProviderCredential.objects.filter(provider=provider).delete()
        IntegrationConnection.objects.filter(provider=provider).delete()
        return Response({'reset': True})


class ProviderConnectStartView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=ProviderConnectStartRequestSerializer, responses=ProviderConnectStartResponseSerializer)
    def post(self, request, key: str):
        connection_id = (request.data or {}).get('connectionId')
        if not connection_id:
            return Response({'detail': 'connectionId is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            connection = IntegrationConnection.objects.select_related('provider', 'provider__credentials').get(
                id=connection_id,
                provider__key=key,
            )
        except IntegrationConnection.DoesNotExist:
            return Response({'detail': 'Connection not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            authorize_url, state = build_authorization_url(connection, request.user.id)
        except OAuthError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'authorizeUrl': authorize_url, 'state': state})


def _oauth_callback_response(payload: dict[str, Any]) -> HttpResponse:
    payload = dict(payload)
    payload.setdefault('source', 'integration-oauth')
    payload_json = json.dumps(payload)
    body = f"""<!DOCTYPE html><html><body>
    <script>
      (function() {{
        var data = {payload_json};
        if (window.opener) {{
          window.opener.postMessage(data, '*');
        }}
        window.close();
      }})();
    </script>
    </body></html>"""
    return HttpResponse(body, content_type='text/html')


class ProviderConnectCallbackView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=OpenApiResponse(
            response=OpenApiTypes.STR,
            description='OAuth callback HTML response.',
        )
    )
    def get(self, request, key: str):
        error = request.query_params.get('error')
        state = request.query_params.get('state')
        code = request.query_params.get('code')
        if error:
            return _oauth_callback_response({'ok': False, 'message': error, 'provider': key})
        if not state or not code:
            return _oauth_callback_response({'ok': False, 'message': 'Missing state or code', 'provider': key})
        try:
            connection_id, _ = OAuthStateManager.parse_state(state)
        except OAuthError as exc:
            return _oauth_callback_response({'ok': False, 'message': str(exc), 'provider': key})
        try:
            connection = IntegrationConnection.objects.select_related('provider', 'provider__credentials').get(
                id=connection_id,
                provider__key=key,
            )
        except IntegrationConnection.DoesNotExist:
            return _oauth_callback_response({'ok': False, 'message': 'Connection not found', 'provider': key})
        try:
            exchange_code_for_connection(connection, code, state)
        except OAuthError as exc:
            return _oauth_callback_response({'ok': False, 'message': str(exc), 'provider': key})
        return _oauth_callback_response({'ok': True, 'provider': key})


class MappingDefaultsView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='connectionId', type=int, required=False, description='Optional connection id'),
        ],
        responses=MappingDefaultsResponseSerializer,
    )
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

    @extend_schema(request=MappingDefaultsRequestSerializer, responses=MappingDefaultsResponseSerializer)
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
    queryset = IntegrationConnection.objects.select_related('provider').prefetch_related('secrets').all()

    def get_queryset(self):
        qs = super().get_queryset()
        provider = self.request.query_params.get('provider')
        if provider:
            qs = qs.filter(provider__key=provider)
        return qs

    def perform_create(self, serializer):
        connection = serializer.save()
        record_audit_event(user=self.request.user, action='connection.created', connection=connection)

    def perform_update(self, serializer):
        connection = serializer.save()
        record_audit_event(
            user=self.request.user,
            action='connection.updated',
            connection=connection,
            metadata={'fields': list(serializer.validated_data.keys())},
        )

    def perform_destroy(self, instance):
        record_audit_event(user=self.request.user, action='connection.deleted', connection=instance)
        return super().perform_destroy(instance)


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

    def perform_create(self, serializer):
        rule = serializer.save()
        record_audit_event(user=self.request.user, action='rule.created', rule=rule)

    def perform_update(self, serializer):
        rule = serializer.save()
        record_audit_event(
            user=self.request.user,
            action='rule.updated',
            rule=rule,
            metadata={'fields': list(serializer.validated_data.keys())},
        )

    def perform_destroy(self, instance):
        record_audit_event(user=self.request.user, action='rule.deleted', rule=instance)
        return super().perform_destroy(instance)


class IntegrationRuleResyncView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        request=inline_serializer(
            name='IntegrationRuleResyncRequest',
            fields={'scope': serializers.CharField(required=False)},
        ),
        responses=IntegrationRuleResyncResponseSerializer,
    )
    def post(self, request, pk: int):
        scope = (request.data or {}).get('scope') if isinstance(request.data, dict) else None
        rule = get_object_or_404(
            IntegrationRule.objects.select_related('connection', 'connection__provider'),
            pk=pk,
        )
        state = clear_resync_and_schedule(rule, scope=scope or 'delta')
        record_audit_event(
            user=request.user,
            action='rule.resync',
            rule=rule,
            metadata={'scope': scope or 'delta'},
        )
        serializer = IntegrationRuleSerializer(rule)
        return Response({
            'rule': serializer.data,
            'state': state,
        })


class IntegrationJobListView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='connection', type=int, required=False),
            OpenApiParameter(name='object', type=str, required=False),
            OpenApiParameter(name='status', type=str, required=False, description='Comma-separated status values'),
            OpenApiParameter(name='limit', type=int, required=False),
        ],
        responses=IntegrationJobListResponseSerializer,
    )
    def get(self, request, provider_key: str):
        qs = IntegrationJob.objects.select_related('connection', 'provider').filter(provider__key=provider_key).order_by('-created_at')
        connection_id = request.query_params.get('connection')
        if connection_id:
            qs = qs.filter(connection_id=connection_id)
        object_key = request.query_params.get('object')
        if object_key:
            qs = qs.filter(object_key=object_key)
        status_values = request.query_params.get('status')
        if status_values:
            statuses = [value.strip() for value in status_values.split(',') if value.strip()]
            if statuses:
                qs = qs.filter(status__in=statuses)
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

    @extend_schema(responses=IntegrationHealthResponseSerializer)
    def get(self, request):
        health = scheduler_health()
        jobs = _job_health_summary()
        status_code = status.HTTP_200_OK if health.get('healthy') else status.HTTP_503_SERVICE_UNAVAILABLE
        payload = dict(health)
        payload['schedulerPaused'] = not health.get('healthy')
        payload['jobs'] = jobs
        return Response(payload, status=status_code)


class IntegrationJobRetryView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=None, responses=IntegrationJobRetryResponseSerializer)
    def post(self, request, pk: int):
        job = get_object_or_404(
            IntegrationJob.objects.select_related('connection', 'connection__provider'),
            pk=pk,
        )
        payload = job.payload or {}
        rule_id = payload.get('rule_id') if isinstance(payload, dict) else None
        if not rule_id:
            return Response({'detail': 'Job cannot be retried (missing rule reference)'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rule = IntegrationRule.objects.select_related('connection', 'connection__provider').get(id=rule_id)
        except IntegrationRule.DoesNotExist:
            return Response({'detail': 'Rule not found'}, status=status.HTTP_404_NOT_FOUND)
        run_integration_rule.apply_async(args=[rule.id], kwargs={'expected_revision': rule.revision})
        record_audit_event(user=request.user, action='job.retry', rule=rule, metadata={'jobId': job.id})
        return Response({'queued': True}, status=status.HTTP_202_ACCEPTED)


def _test_bqe_connection(connection: IntegrationConnection, provider) -> dict:
    client = BQEProjectsClient(connection, provider)
    iterator = client.fetch(updated_since=None, extra_params={'page': '1,1'})
    first_batch = next(iterator, [])
    sample_count = len(first_batch)
    message = 'Fetched sample project list successfully.' if sample_count else 'Connected but no projects returned.'
    return {'sampleCount': sample_count, 'message': message}


def _test_bqe_activity_probe(connection: IntegrationConnection, provider) -> dict:
    base_url = get_connection_endpoint(connection, provider)
    token = get_connection_access_token(connection, provider_meta=provider)
    http = IntegrationHttpClient(base_url, enable_legacy_tls_fallback=True)
    headers = dict(connection.extra_headers or {})
    headers['Authorization'] = f'Bearer {token}'
    headers['X-UTC-OFFSET'] = str(_connection_utc_offset(connection))
    try:
        response = http.request('GET', '/activity', params={'page': '1,1'}, headers=headers, timeout=(5, 60))
        response.raise_for_status()
    except HTTPError as exc:
        translate_bqe_error(
            response,
            exc,
            connection=connection,
            object_key='activities',
        )
        raise
    payload = response.json()

    def _coerce_items(body: Any) -> list[dict[str, Any]]:
        if isinstance(body, list):
            return [dict(item or {}) for item in body]
        if isinstance(body, dict):
            for key in ('items', 'results', 'data'):
                if isinstance(body.get(key), list):
                    return [dict(item or {}) for item in body[key]]
        return []

    items = _coerce_items(payload)
    sample_count = len(items)
    message = 'Fetched sample activity list successfully.' if sample_count else 'Connected but no activities returned.'
    return {'sampleCount': sample_count, 'message': message}


def _connection_utc_offset(connection: IntegrationConnection) -> int:
    try:
        value = int(connection.utc_offset_minutes)
    except (TypeError, ValueError):
        value = 0
    return max(-720, min(840, value))


def _test_connection(connection: IntegrationConnection) -> dict:
    provider_meta = get_registry().get_provider(connection.provider.key)
    if not provider_meta:
        raise ValueError('Provider metadata missing')
    if provider_meta.key == 'bqe':
        return _test_bqe_connection(connection, provider_meta)
    raise ValueError('Connection testing not implemented for this provider yet')


class IntegrationConnectionTestView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=None, responses=IntegrationTestResponseSerializer)
    def post(self, request, pk: int):
        connection = get_object_or_404(
            IntegrationConnection.objects.select_related('provider'),
            pk=pk,
        )
        try:
            result = _test_connection(connection)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except OAuthError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except IntegrationProviderError as exc:
            payload = {'detail': str(exc)}
            if exc.provider_message:
                payload['providerMessage'] = exc.provider_message
            if exc.code:
                payload['providerCode'] = exc.code
            status_code = status.HTTP_409_CONFLICT if exc.status_code == 409 else status.HTTP_400_BAD_REQUEST
            return Response(payload, status=status_code)
        except RequestException as exc:
            logger.exception(
                'integration_connection_test_http_error',
                extra=integration_log_extra(connection=connection),
            )
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.exception(
                'integration_connection_test_failed',
                extra=integration_log_extra(connection=connection),
            )
            return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        payload = {
            'ok': True,
            'provider': connection.provider.display_name,
            'environment': connection.environment,
            'checkedAt': timezone.now().isoformat(),
            'sampleCount': result.get('sampleCount', 0),
        }
        if result.get('message'):
            payload['message'] = result['message']
        return Response(payload, status=status.HTTP_200_OK)


class IntegrationActivityTestView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=None, responses=IntegrationTestResponseSerializer)
    def post(self, request, pk: int):
        connection = get_object_or_404(
            IntegrationConnection.objects.select_related('provider'),
            pk=pk,
        )
        provider_meta = get_registry().get_provider(connection.provider.key)
        if not provider_meta:
            return Response({'detail': 'Provider metadata missing'}, status=status.HTTP_400_BAD_REQUEST)
        if provider_meta.key != 'bqe':
            return Response({'detail': 'Activity probe is only available for BQE connections'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = _test_bqe_activity_probe(connection, provider_meta)
        except OAuthError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except IntegrationProviderError as exc:
            payload = {'detail': str(exc)}
            if exc.provider_message:
                payload['providerMessage'] = exc.provider_message
            if exc.code:
                payload['providerCode'] = exc.code
            status_code = status.HTTP_409_CONFLICT if exc.status_code == 409 else status.HTTP_400_BAD_REQUEST
            return Response(payload, status=status_code)
        except RequestException as exc:
            logger.exception(
                'integration_activity_test_http_error',
                extra=integration_log_extra(connection=connection),
            )
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.exception(
                'integration_activity_test_failed',
                extra=integration_log_extra(connection=connection),
            )
            return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        payload = {
            'ok': True,
            'provider': connection.provider.display_name,
            'environment': connection.environment,
            'checkedAt': timezone.now().isoformat(),
            'sampleCount': result.get('sampleCount', 0),
        }
        if result.get('message'):
            payload['message'] = result['message']
        return Response(payload, status=status.HTTP_200_OK)


class IntegrationSecretKeyView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=IntegrationSecretKeyResponseSerializer)
    def get(self, request):
        configured = IntegrationSecretKey.configured()
        return Response({'configured': configured})

    @extend_schema(request=IntegrationSecretKeyRequestSerializer, responses=IntegrationSecretKeyResponseSerializer)
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


class ProjectMatchingSuggestionView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        parameters=[OpenApiParameter(name='connectionId', type=int, required=True)],
        responses=OpenApiResponse(response=OpenApiTypes.OBJECT),
    )
    def get(self, request, provider_key: str):
        connection_id = request.query_params.get('connectionId')
        if not connection_id:
            return Response({'detail': 'connectionId is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            connection = IntegrationConnection.objects.select_related('provider').get(
                id=connection_id,
                provider__key=provider_key,
            )
        except IntegrationConnection.DoesNotExist:
            return Response({'detail': 'Connection not found'}, status=status.HTTP_404_NOT_FOUND)
        if not connection_has_token(connection):
            return Response({'detail': 'Authorize the provider before loading matching data.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            data = suggest_project_matches(connection)
        except OAuthError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(data)


class ProjectMatchingConfirmView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        request=ProjectMatchingConfirmRequestSerializer,
        responses=OpenApiResponse(response=OpenApiTypes.OBJECT),
    )
    def post(self, request, provider_key: str):
        connection_id = (request.data or {}).get('connectionId')
        if not connection_id:
            return Response({'detail': 'connectionId is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            connection = IntegrationConnection.objects.select_related('provider').get(
                id=connection_id,
                provider__key=provider_key,
            )
        except IntegrationConnection.DoesNotExist:
            return Response({'detail': 'Connection not found'}, status=status.HTTP_404_NOT_FOUND)
        matches = (request.data or {}).get('matches') or []
        if not isinstance(matches, list):
            return Response({'detail': 'matches must be a list'}, status=status.HTTP_400_BAD_REQUEST)
        enable_rule = bool((request.data or {}).get('enableRule'))
        try:
            if not connection_has_token(connection):
                raise OAuthError('Authorize the provider before confirming matches.')
            summary = confirm_project_matches(connection, matches, enable_rule=enable_rule)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except OAuthError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(summary, status=status.HTTP_200_OK)
