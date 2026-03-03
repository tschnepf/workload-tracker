from __future__ import annotations

import hmac
import logging
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.http import HttpRequest
from django.utils import timezone
from drf_spectacular.utils import OpenApiTypes, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from people.models import Person
from roles.models import Role

from .audit import record_audit_event
from .azure_identity import (
    apply_confirmed_reconciliation,
    get_auth_method_policy,
    get_azure_connection,
    get_latest_scim_bearer,
    graph_reconcile,
    refresh_reconciliation,
    set_scim_bearer,
    upsert_azure_principal,
)
from .models import (
    AzureDepartmentMapping,
    AzureReconciliationRecord,
    AzureRoleMapping,
    IntegrationSetting,
)

logger = logging.getLogger(__name__)


def _azure_connection_or_400():
    connection = get_azure_connection()
    if connection is None:
        return None, Response({'detail': 'Azure connection is not configured.'}, status=status.HTTP_400_BAD_REQUEST)
    return connection, None


def _scim_token_valid(request: HttpRequest, token: str | None) -> bool:
    if not token:
        return False
    auth_header = (request.headers.get('Authorization') or '').strip()
    if not auth_header.lower().startswith('bearer '):
        return False
    presented = auth_header.split(' ', 1)[1].strip()
    return bool(presented) and hmac.compare_digest(presented, token)


def _require_scim_auth(request: HttpRequest, connection) -> bool:
    token = get_latest_scim_bearer(connection)
    if not token:
        token = (getattr(settings, 'AZURE_SCIM_BEARER_TOKEN', '') or '').strip()
    return _scim_token_valid(request, token)


def _bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in ('1', 'true', 'yes', 'on'):
        return True
    if text in ('0', 'false', 'no', 'off'):
        return False
    return default


def _serialize_mapping_row(row, kind: str) -> dict[str, Any]:
    payload = {
        'id': row.id,
        'sourceValue': row.source_value,
        'createdAt': row.created_at.isoformat(),
        'updatedAt': row.updated_at.isoformat(),
    }
    if kind == 'department':
        payload['departmentId'] = row.department_id
        payload['departmentName'] = row.department.name if row.department else None
    else:
        payload['roleId'] = row.role_id
        payload['roleName'] = row.role.name if row.role else None
    return payload


def _principal_from_scim_payload(payload: dict[str, Any], *, principal_id_override: str | None = None) -> dict[str, Any]:
    emails = payload.get('emails') or []
    primary_email = ''
    if isinstance(emails, list):
        for item in emails:
            if not isinstance(item, dict):
                continue
            if item.get('primary') is True:
                primary_email = str(item.get('value') or '').strip()
                break
        if not primary_email:
            for item in emails:
                if isinstance(item, dict) and item.get('value'):
                    primary_email = str(item.get('value') or '').strip()
                    break
    name = payload.get('name') if isinstance(payload.get('name'), dict) else {}
    enterprise = {}
    schemas = payload.get('schemas') or []
    if isinstance(schemas, list):
        for schema in schemas:
            if str(schema).lower().endswith('enterprise:2.0:user'):
                enterprise = payload.get(str(schema)) if isinstance(payload.get(str(schema)), dict) else {}
                break
    user_type = str(payload.get('userType') or enterprise.get('employeeType') or 'Member').strip()
    upn = str(payload.get('userName') or '').strip()
    principal_id = str(principal_id_override or payload.get('id') or payload.get('externalId') or '').strip()
    return {
        'tenant_id': str(payload.get('tenantId') or '').strip(),
        'azure_oid': principal_id,
        'upn': upn,
        'email': primary_email or upn,
        'display_name': str(payload.get('displayName') or '').strip(),
        'given_name': str(name.get('givenName') or '').strip(),
        'surname': str(name.get('familyName') or '').strip(),
        'department': str(enterprise.get('department') or payload.get('department') or '').strip(),
        'job_title': str(enterprise.get('title') or payload.get('jobTitle') or '').strip(),
        'active': _bool(payload.get('active'), True),
        'assigned_to_app': _bool(payload.get('assignedToApp'), True),
        'user_type': user_type,
        'is_service_account': _bool(payload.get('serviceAccount'), False),
    }


class AzureStatusView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        responses=inline_serializer(
            name='AzureProviderStatus',
            fields={
                'connected': serializers.BooleanField(),
                'connectionId': serializers.IntegerField(allow_null=True),
                'environment': serializers.CharField(allow_null=True),
                'hasScimToken': serializers.BooleanField(),
                'policy': serializers.DictField(),
                'lastReconcileAt': serializers.CharField(allow_null=True),
            },
        )
    )
    def get(self, request):
        connection = get_azure_connection()
        policy = get_auth_method_policy()
        last_reconcile_setting = None
        if connection:
            last_reconcile_setting = IntegrationSetting.objects.filter(
                connection=connection,
                key='azure.graph_state',
            ).first()
        return Response(
            {
                'connected': bool(connection),
                'connectionId': connection.id if connection else None,
                'environment': connection.environment if connection else None,
                'hasScimToken': bool(connection and get_latest_scim_bearer(connection)),
                'policy': {
                    'azureSsoEnabled': policy.azure_sso_enabled,
                    'azureSsoEnforced': policy.azure_sso_enforced,
                    'passwordLoginEnabledNonBreakGlass': policy.password_login_enabled_non_break_glass,
                    'breakGlassUserId': policy.break_glass_user_id,
                },
                'lastReconcileAt': (
                    (last_reconcile_setting.data or {}).get('last_success_at')
                    if last_reconcile_setting
                    else None
                ),
            }
        )

    @extend_schema(
        request=inline_serializer(
            name='AzurePolicyUpdateRequest',
            fields={
                'azureSsoEnabled': serializers.BooleanField(required=False),
                'azureSsoEnforced': serializers.BooleanField(required=False),
                'passwordLoginEnabledNonBreakGlass': serializers.BooleanField(required=False),
                'breakGlassUserId': serializers.IntegerField(required=False, allow_null=True),
            },
        ),
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request):
        policy = get_auth_method_policy()
        data = request.data or {}
        if 'azureSsoEnabled' in data:
            policy.azure_sso_enabled = bool(data.get('azureSsoEnabled'))
        if 'azureSsoEnforced' in data:
            policy.azure_sso_enforced = bool(data.get('azureSsoEnforced'))
        if 'passwordLoginEnabledNonBreakGlass' in data:
            policy.password_login_enabled_non_break_glass = bool(data.get('passwordLoginEnabledNonBreakGlass'))
        if 'breakGlassUserId' in data:
            user_id = data.get('breakGlassUserId')
            if user_id in (None, ''):
                policy.break_glass_user = None
            else:
                User = get_user_model()
                policy.break_glass_user = User.objects.filter(id=int(user_id)).first()
        policy.save()
        return self.get(request)


class AzureScimTokenView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        request=inline_serializer(
            name='AzureScimTokenRequest',
            fields={'token': serializers.CharField()},
        ),
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        token = str((request.data or {}).get('token') or '').strip()
        if not token:
            return Response({'detail': 'token is required'}, status=status.HTTP_400_BAD_REQUEST)
        set_scim_bearer(connection, token)
        return Response({'saved': True})


class AzureDepartmentMappingsView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        rows = AzureDepartmentMapping.objects.select_related('department').filter(connection=connection).order_by('source_value')
        return Response({'items': [_serialize_mapping_row(row, 'department') for row in rows]})

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        payload = request.data or {}
        items = payload.get('mappings') if isinstance(payload.get('mappings'), list) else [payload]
        for item in items:
            if not isinstance(item, dict):
                continue
            source = str(item.get('sourceValue') or '').strip()
            if not source:
                continue
            department_id = item.get('departmentId')
            department = None
            if department_id not in (None, ''):
                department = Department.objects.filter(id=int(department_id)).first()
            AzureDepartmentMapping.objects.update_or_create(
                connection=connection,
                source_value=source,
                defaults={'department': department},
            )
        record_audit_event(
            user=request.user,
            action='azure.department_mapping.updated',
            connection=connection,
            metadata={'count': len(items)},
        )
        return self.get(request)


class AzureRoleMappingsView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        rows = AzureRoleMapping.objects.select_related('role').filter(connection=connection).order_by('source_value')
        return Response({'items': [_serialize_mapping_row(row, 'role') for row in rows]})

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        payload = request.data or {}
        items = payload.get('mappings') if isinstance(payload.get('mappings'), list) else [payload]
        for item in items:
            if not isinstance(item, dict):
                continue
            source = str(item.get('sourceValue') or '').strip()
            if not source:
                continue
            role = None
            role_id = item.get('roleId')
            if role_id not in (None, ''):
                role = Role.objects.filter(id=int(role_id)).first()
            AzureRoleMapping.objects.update_or_create(
                connection=connection,
                source_value=source,
                defaults={'role': role},
            )
        record_audit_event(
            user=request.user,
            action='azure.role_mapping.updated',
            connection=connection,
            metadata={'count': len(items)},
        )
        return self.get(request)


class AzureProvisioningStatusView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        recon_counts = {
            'proposed': AzureReconciliationRecord.objects.filter(connection=connection, status=AzureReconciliationRecord.STATUS_PROPOSED).count(),
            'conflict': AzureReconciliationRecord.objects.filter(connection=connection, status=AzureReconciliationRecord.STATUS_CONFLICT).count(),
            'confirmed': AzureReconciliationRecord.objects.filter(connection=connection, status=AzureReconciliationRecord.STATUS_CONFIRMED).count(),
            'applied': AzureReconciliationRecord.objects.filter(connection=connection, status=AzureReconciliationRecord.STATUS_APPLIED).count(),
            'unmatched': AzureReconciliationRecord.objects.filter(connection=connection, status=AzureReconciliationRecord.STATUS_UNMATCHED).count(),
        }
        graph_state = IntegrationSetting.objects.filter(connection=connection, key='azure.graph_state').first()
        return Response(
            {
                'connectionId': connection.id,
                'reconciliation': recon_counts,
                'graphState': graph_state.data if graph_state else {},
                'updatedAt': timezone.now().isoformat(),
            }
        )


class AzureProvisioningReconcileNowView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        dry_run = _bool((request.data or {}).get('dryRun'), False)
        include_graph = _bool((request.data or {}).get('includeGraph'), True)
        graph_summary = None
        if include_graph:
            try:
                graph_summary = graph_reconcile(connection, dry_run=dry_run)
            except Exception as exc:
                graph_summary = {'error': str(exc)}
        recon_summary = refresh_reconciliation(connection)
        record_audit_event(
            user=request.user,
            action='azure.reconcile.now',
            connection=connection,
            metadata={'dryRun': dry_run, 'includeGraph': include_graph},
        )
        return Response({'graph': graph_summary, 'reconciliation': recon_summary})


class AzureReconciliationListView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        records = (
            AzureReconciliationRecord.objects.select_related('candidate_user', 'candidate_person')
            .filter(connection=connection)
            .order_by('status', '-updated_at', 'id')[:2000]
        )
        users = (
            get_user_model()
            .objects.select_related('profile__person')
            .order_by('username')
            .values('id', 'username', 'email')
        )
        people = Person.objects.order_by('name').values('id', 'name', 'email', 'is_active')
        items = []
        for row in records:
            items.append(
                {
                    'id': row.id,
                    'azurePrincipalId': row.azure_principal_id,
                    'tenantId': row.tenant_id,
                    'upn': row.upn,
                    'email': row.email,
                    'displayName': row.display_name,
                    'department': row.department,
                    'jobTitle': row.job_title,
                    'status': row.status,
                    'confidence': row.confidence,
                    'reasonCodes': row.reason_codes,
                    'candidateUser': (
                        {
                            'id': row.candidate_user_id,
                            'username': row.candidate_user.username if row.candidate_user else None,
                            'email': row.candidate_user.email if row.candidate_user else None,
                        }
                        if row.candidate_user_id
                        else None
                    ),
                    'candidatePerson': (
                        {
                            'id': row.candidate_person_id,
                            'name': row.candidate_person.name if row.candidate_person else None,
                        }
                        if row.candidate_person_id
                        else None
                    ),
                    'updatedAt': row.updated_at.isoformat(),
                }
            )
        return Response({'items': items, 'users': list(users), 'people': list(people)})


class AzureReconciliationRefreshView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def post(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        summary = refresh_reconciliation(connection)
        record_audit_event(
            user=request.user,
            action='azure.reconciliation.refresh',
            connection=connection,
            metadata=summary,
        )
        return Response(summary)


class AzureReconciliationConfirmView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request, id: int):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        row = AzureReconciliationRecord.objects.filter(connection=connection, id=id).first()
        if not row:
            return Response({'detail': 'Reconciliation row not found'}, status=status.HTTP_404_NOT_FOUND)
        row.status = AzureReconciliationRecord.STATUS_CONFIRMED
        row.resolved_by = request.user
        row.resolved_at = timezone.now()
        row.save(update_fields=['status', 'resolved_by', 'resolved_at', 'updated_at'])
        return Response({'confirmed': True, 'id': row.id})


class AzureReconciliationOverrideView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request, id: int):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        row = AzureReconciliationRecord.objects.filter(connection=connection, id=id).first()
        if not row:
            return Response({'detail': 'Reconciliation row not found'}, status=status.HTTP_404_NOT_FOUND)
        user_id = (request.data or {}).get('userId')
        person_id = (request.data or {}).get('personId')
        User = get_user_model()
        row.candidate_user = User.objects.filter(id=int(user_id)).first() if user_id not in (None, '') else None
        row.candidate_person = Person.objects.filter(id=int(person_id)).first() if person_id not in (None, '') else None
        row.status = AzureReconciliationRecord.STATUS_CONFIRMED
        row.resolved_by = request.user
        row.resolved_at = timezone.now()
        row.save(
            update_fields=[
                'candidate_user',
                'candidate_person',
                'status',
                'resolved_by',
                'resolved_at',
                'updated_at',
            ]
        )
        return Response({'confirmed': True, 'id': row.id})


class AzureReconciliationRejectView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request, id: int):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        row = AzureReconciliationRecord.objects.filter(connection=connection, id=id).first()
        if not row:
            return Response({'detail': 'Reconciliation row not found'}, status=status.HTTP_404_NOT_FOUND)
        row.status = AzureReconciliationRecord.STATUS_REJECTED
        row.resolved_by = request.user
        row.resolved_at = timezone.now()
        row.save(update_fields=['status', 'resolved_by', 'resolved_at', 'updated_at'])
        return Response({'rejected': True, 'id': row.id})


class AzureMigrationApplyView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        summary = apply_confirmed_reconciliation(connection, actor=request.user)
        record_audit_event(
            user=request.user,
            action='azure.migration.apply',
            connection=connection,
            metadata=summary,
        )
        return Response(summary)


class AzureScimUserCreateView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        payload = request.data if isinstance(request.data, dict) else {}
        principal = _principal_from_scim_payload(payload)
        try:
            result = upsert_azure_principal(connection, principal, source='scim', allow_create=True)
        except Exception as exc:
            logger.exception('azure_scim_create_failed')
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_201_CREATED)


class AzureScimUserPatchView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def patch(self, request, principal_id: str):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        payload = request.data if isinstance(request.data, dict) else {}
        principal = _principal_from_scim_payload(payload, principal_id_override=principal_id)
        operations = payload.get('Operations') if isinstance(payload.get('Operations'), list) else []
        for operation in operations:
            if not isinstance(operation, dict):
                continue
            op = str(operation.get('op') or '').lower()
            path = str(operation.get('path') or '').lower()
            value = operation.get('value')
            if path == 'active':
                principal['active'] = _bool(value, True)
            if op == 'remove' and path == 'assignedtoapp':
                principal['assigned_to_app'] = False
        try:
            result = upsert_azure_principal(connection, principal, source='scim', allow_create=True)
        except Exception as exc:
            logger.exception('azure_scim_patch_failed')
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def delete(self, request, principal_id: str):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return Response({'detail': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)
        principal = {
            'tenant_id': '',
            'azure_oid': principal_id,
            'upn': '',
            'email': '',
            'display_name': '',
            'given_name': '',
            'surname': '',
            'department': '',
            'job_title': '',
            'active': False,
            'assigned_to_app': False,
            'user_type': 'Member',
        }
        try:
            result = upsert_azure_principal(connection, principal, source='scim', allow_create=False)
        except Exception as exc:
            logger.exception('azure_scim_delete_failed')
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)
