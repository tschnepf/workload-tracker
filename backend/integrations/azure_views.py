from __future__ import annotations

import hmac
import logging
import re
import uuid
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import HttpRequest
from django.utils import timezone
from drf_spectacular.utils import OpenApiTypes, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile
from people.models import Person
from roles.models import Role

from .audit import record_audit_event
from .azure_identity import (
    apply_confirmed_reconciliation,
    ensure_graph_permission_ready,
    get_auth_method_policy,
    get_azure_connection,
    get_graph_permission_status,
    get_latest_scim_bearer,
    list_snapshot_departments,
    list_snapshot_groups,
    graph_reconcile,
    probe_graph_user_read_all,
    refresh_reconciliation,
    set_scim_bearer,
    upsert_azure_principal,
)
from .models import (
    AzureDepartmentMapping,
    AzureIdentityLink,
    AzureReconciliationRecord,
    AzureRoleMapping,
    IntegrationSetting,
)

logger = logging.getLogger(__name__)

SCIM_CONTENT_TYPE = 'application/scim+json'
SCIM_ERR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error'
SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'
SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
SCIM_ENTERPRISE_USER_SCHEMA = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'
SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'
SCIM_RESOURCE_TYPE_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:ResourceType'
SCIM_SCHEMA_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Schema'

SCIM_FILTER_RE = re.compile(r'^\s*([A-Za-z][\w\.\-:]*)\s+eq\s+["\'](.+?)["\']\s*$')


def _azure_connection_or_400():
    connection = get_azure_connection()
    if connection is None:
        return None, Response({'detail': 'Azure connection is not configured.'}, status=status.HTTP_400_BAD_REQUEST)
    return connection, None


def _azure_scim_connection_or_error(*, correlation_id: str | None = None):
    connection = get_azure_connection()
    if connection is None:
        return None, _scim_error(
            'Azure SCIM connection is not configured.',
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            correlation_id=correlation_id,
        )
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


def _scim_strict_mode_enabled() -> bool:
    return bool(getattr(settings, 'AZURE_SCIM_STRICT_MODE', True))


def _scim_response(
    payload: Any,
    *,
    status_code: int = status.HTTP_200_OK,
    correlation_id: str | None = None,
) -> Response:
    if not _scim_strict_mode_enabled():
        response = Response(payload, status=status_code)
    else:
        response = Response(payload, status=status_code, content_type=SCIM_CONTENT_TYPE)
    if correlation_id:
        response['X-Correlation-ID'] = correlation_id
    return response


def _scim_error(
    detail: str,
    *,
    status_code: int,
    scim_type: str | None = None,
    correlation_id: str | None = None,
) -> Response:
    if not _scim_strict_mode_enabled():
        response = Response({'detail': detail}, status=status_code)
        if correlation_id:
            response['X-Correlation-ID'] = correlation_id
        return response
    body: dict[str, Any] = {
        'schemas': [SCIM_ERR_SCHEMA],
        'detail': detail,
        'status': str(status_code),
    }
    if scim_type:
        body['scimType'] = scim_type
    return _scim_response(body, status_code=status_code, correlation_id=correlation_id)


def _as_int(value: Any, default: int) -> int:
    try:
        parsed = int(str(value).strip())
    except Exception:
        return default
    return parsed


def _request_correlation_id(request: HttpRequest) -> str:
    for key in ('HTTP_X_CORRELATION_ID', 'HTTP_X_MS_CORRELATION_ID', 'HTTP_X_MS_CLIENT_REQUEST_ID'):
        raw = str(request.META.get(key) or '').strip()
        if raw:
            return raw[:128]
    return uuid.uuid4().hex


def _log_scim_call(request: HttpRequest, correlation_id: str, *, stage: str, principal_id: str | None = None) -> None:
    logger.info(
        'azure_scim_request',
        extra={
            'correlation_id': correlation_id,
            'stage': stage,
            'method': request.method,
            'path': request.path,
            'principal_id': principal_id,
        },
    )


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
    tenant_id = str(payload.get('tenantId') or '').strip() or (getattr(settings, 'AZURE_SSO_TENANT_ID', '') or '').strip()
    return {
        'tenant_id': tenant_id,
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
        'groups': payload.get('groups') if isinstance(payload.get('groups'), list) else [],
    }


def _apply_scim_patch_operations(payload: dict[str, Any]) -> dict[str, Any]:
    merged = dict(payload or {})
    operations = merged.get('Operations') if isinstance(merged.get('Operations'), list) else []
    for operation in operations:
        if not isinstance(operation, dict):
            continue
        op = str(operation.get('op') or 'replace').strip().lower()
        path = str(operation.get('path') or '').strip().lower()
        value = operation.get('value')

        if not path:
            if isinstance(value, dict):
                for key, field_value in value.items():
                    merged[key] = field_value
            continue

        if op == 'remove':
            if path == 'active':
                merged['active'] = False
            elif 'assignedtoapp' in path:
                merged['assignedToApp'] = False
            elif 'department' in path:
                merged['department'] = ''
            elif path.endswith('title') or 'jobtitle' in path:
                merged['jobTitle'] = ''
            elif 'displayname' in path:
                merged['displayName'] = ''
            elif 'username' in path:
                merged['userName'] = ''
            elif path.startswith('emails'):
                merged['emails'] = []
            continue

        if path == 'active':
            merged['active'] = _bool(value, True)
            continue
        if 'assignedtoapp' in path:
            merged['assignedToApp'] = _bool(value, True)
            continue
        if 'displayname' in path:
            merged['displayName'] = str(value or '').strip()
            continue
        if 'username' in path:
            merged['userName'] = str(value or '').strip()
            continue
        if 'givenname' in path:
            name = dict(merged.get('name') or {})
            name['givenName'] = str(value or '').strip()
            merged['name'] = name
            continue
        if 'familyname' in path or 'surname' in path:
            name = dict(merged.get('name') or {})
            name['familyName'] = str(value or '').strip()
            merged['name'] = name
            continue
        if 'department' in path:
            merged['department'] = str(value or '').strip()
            continue
        if path.endswith('title') or 'jobtitle' in path:
            merged['jobTitle'] = str(value or '').strip()
            continue
        if path.startswith('emails'):
            if isinstance(value, list):
                merged['emails'] = value
            elif isinstance(value, dict):
                merged['emails'] = [value]
            else:
                email = str(value or '').strip()
                if email:
                    merged['emails'] = [{'value': email, 'primary': True}]
    return merged


def _scim_user_location(request: HttpRequest, principal_id: str) -> str:
    return request.build_absolute_uri(f"/api/integrations/providers/azure/scim/v2/Users/{principal_id}")


def _split_display_name(display_name: str) -> tuple[str, str]:
    text = str(display_name or '').strip()
    if not text:
        return '', ''
    parts = text.split()
    if len(parts) == 1:
        return parts[0], ''
    return parts[0], ' '.join(parts[1:])


def _scim_user_resource_from_link(request: HttpRequest, link: AzureIdentityLink) -> dict[str, Any]:
    user = link.user
    profile = UserProfile.objects.select_related('person', 'person__department', 'person__role').filter(user=user).first()
    person = profile.person if profile else None
    display_name = (person.name if person else '') or (user.get_full_name() or '') or (link.upn_at_link or user.username)
    given_name, family_name = _split_display_name(display_name)
    emails: list[dict[str, Any]] = []
    if (user.email or '').strip():
        emails.append({'value': user.email, 'type': 'work', 'primary': True})

    enterprise_extension = {
        'department': person.department.name if person and person.department else '',
        'title': person.role.name if person and person.role else '',
        'employeeNumber': str(person.id) if person else '',
    }
    return {
        'schemas': [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
        'id': link.azure_oid,
        'externalId': str(user.id),
        'userName': (link.upn_at_link or user.username or '').strip(),
        'displayName': display_name,
        'name': {
            'givenName': given_name,
            'familyName': family_name,
            'formatted': display_name,
        },
        'emails': emails,
        'active': bool(user.is_active and (person.is_active if person else True)),
        SCIM_ENTERPRISE_USER_SCHEMA: enterprise_extension,
        'meta': {
            'resourceType': 'User',
            'location': _scim_user_location(request, link.azure_oid),
            'lastModified': link.updated_at.isoformat(),
        },
    }


def _scim_list_response(resources: list[dict[str, Any]], *, total: int, start_index: int) -> dict[str, Any]:
    return {
        'schemas': [SCIM_LIST_SCHEMA],
        'totalResults': total,
        'startIndex': start_index,
        'itemsPerPage': len(resources),
        'Resources': resources,
    }


def _parse_scim_filter(filter_value: str | None) -> tuple[str, str] | None:
    if not filter_value:
        return None
    match = SCIM_FILTER_RE.match(filter_value)
    if not match:
        raise ValueError('Unsupported SCIM filter syntax. Only eq filters are supported.')
    attribute = match.group(1).strip().lower()
    value = match.group(2).strip()
    return attribute, value


def _find_scim_link(connection, principal_id: str) -> AzureIdentityLink | None:
    pid = str(principal_id or '').strip()
    if not pid:
        return None
    query = AzureIdentityLink.objects.select_related('user', 'user__profile__person').filter(connection=connection, is_active=True)
    link = query.filter(azure_oid=pid).first()
    if link:
        return link
    if pid.isdigit():
        return query.filter(user_id=int(pid)).first()
    return None


def _scim_links_for_filter(connection, filter_value: str | None):
    query = AzureIdentityLink.objects.select_related('user', 'user__profile__person').filter(connection=connection, is_active=True).order_by('id')
    parsed = _parse_scim_filter(filter_value)
    if not parsed:
        return query
    attribute, value = parsed
    if attribute in ('id',):
        return query.filter(azure_oid=value)
    if attribute in ('externalid',):
        if value.isdigit():
            return query.filter(user_id=int(value))
        return query.none()
    if attribute in ('username', 'username.value', 'username.formatted', 'userName'.lower()):
        return query.filter(
            Q(upn_at_link__iexact=value)
            | Q(user__username__iexact=value)
            | Q(user__email__iexact=value)
        )
    raise ValueError(f'Unsupported SCIM filter attribute: {attribute}')


def _scim_service_provider_config() -> dict[str, Any]:
    return {
        'schemas': [SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA],
        'patch': {'supported': True},
        'bulk': {'supported': False, 'maxOperations': 0, 'maxPayloadSize': 0},
        'filter': {'supported': True, 'maxResults': 200},
        'changePassword': {'supported': False},
        'sort': {'supported': False},
        'etag': {'supported': False},
        'authenticationSchemes': [
            {
                'type': 'oauthbearertoken',
                'name': 'OAuth Bearer Token',
                'description': 'Bearer token supplied via Authorization header',
                'specUri': 'http://www.rfc-editor.org/info/rfc6750',
                'primary': True,
            }
        ],
    }


def _scim_schemas_payload() -> dict[str, Any]:
    resources = [
        {
            'id': SCIM_USER_SCHEMA,
            'name': 'User',
            'description': 'SCIM core user schema',
            'attributes': [],
            'meta': {'resourceType': 'Schema'},
            'schemas': [SCIM_SCHEMA_SCHEMA],
        },
        {
            'id': SCIM_ENTERPRISE_USER_SCHEMA,
            'name': 'EnterpriseUser',
            'description': 'SCIM enterprise user schema extension',
            'attributes': [],
            'meta': {'resourceType': 'Schema'},
            'schemas': [SCIM_SCHEMA_SCHEMA],
        },
    ]
    return _scim_list_response(resources, total=len(resources), start_index=1)


def _scim_resource_types_payload(request: HttpRequest) -> dict[str, Any]:
    base = request.build_absolute_uri('/api/integrations/providers/azure/scim/v2')
    resources = [
        {
            'schemas': [SCIM_RESOURCE_TYPE_SCHEMA],
            'id': 'User',
            'name': 'User',
            'endpoint': '/Users',
            'description': 'User account',
            'schema': SCIM_USER_SCHEMA,
            'schemaExtensions': [{'schema': SCIM_ENTERPRISE_USER_SCHEMA, 'required': False}],
            'meta': {
                'resourceType': 'ResourceType',
                'location': f'{base}/ResourceTypes/User',
            },
        }
    ]
    return _scim_list_response(resources, total=len(resources), start_index=1)


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
                'graphPermissionReady': serializers.BooleanField(),
                'graphPermissionReason': serializers.CharField(allow_null=True, required=False),
                'graphPermissionCheckedAt': serializers.CharField(allow_null=True, required=False),
                'tenantEnforced': serializers.BooleanField(),
                'tenantId': serializers.CharField(allow_null=True, required=False),
            },
        )
    )
    def get(self, request):
        connection = get_azure_connection()
        policy = get_auth_method_policy()
        probe_graph = _bool(request.query_params.get('probeGraph'), False)
        last_reconcile_setting = None
        graph_status = {
            'ready': False,
            'reason': 'Azure connection is not configured.',
            'checkedAt': None,
        }
        if connection:
            last_reconcile_setting = IntegrationSetting.objects.filter(
                connection=connection,
                key='azure.graph_state',
            ).first()
            graph_status = get_graph_permission_status(connection, refresh=probe_graph)
        tenant_id = (getattr(settings, 'AZURE_SSO_TENANT_ID', '') or '').strip()
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
                'graphPermissionReady': bool(graph_status.get('ready')),
                'graphPermissionReason': graph_status.get('reason'),
                'graphPermissionCheckedAt': graph_status.get('checkedAt'),
                'tenantEnforced': bool(tenant_id),
                'tenantId': tenant_id or None,
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


class AzureDirectoryDepartmentsView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        mapped = {
            row.source_value.lower(): row
            for row in AzureDepartmentMapping.objects.select_related('department').filter(connection=connection)
        }
        items: list[dict[str, Any]] = []
        for item in list_snapshot_departments(connection):
            key = str(item.get('value') or '').strip().lower()
            mapping = mapped.get(key)
            items.append(
                {
                    'value': item.get('value'),
                    'count': item.get('count') or 0,
                    'mappedDepartmentId': mapping.department_id if mapping else None,
                    'mappedDepartmentName': mapping.department.name if mapping and mapping.department else None,
                }
            )
        return Response({'items': items})


class AzureDirectoryGroupsView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        return Response({'items': list_snapshot_groups(connection)})


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
                'graphPermission': get_graph_permission_status(connection, refresh=False),
                'updatedAt': timezone.now().isoformat(),
            }
        )


class AzureProvisioningValidateView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def post(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        graph_status = probe_graph_user_read_all(connection)
        tenant_id = (getattr(settings, 'AZURE_SSO_TENANT_ID', '') or '').strip()
        payload = {
            'ok': bool(graph_status.get('ready')),
            'tenantEnforced': bool(tenant_id),
            'tenantId': tenant_id or None,
            'graphPermission': graph_status,
            'scim': {
                'basePath': '/api/integrations/providers/azure/scim/v2',
                'requiredTokenConfigured': bool(get_latest_scim_bearer(connection)),
            },
        }
        return Response(payload, status=status.HTTP_200_OK)


class AzureProvisioningReconcileNowView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        connection, error = _azure_connection_or_400()
        if error:
            return error
        correlation_id = _request_correlation_id(request)
        dry_run = _bool((request.data or {}).get('dryRun'), False)
        include_graph = _bool((request.data or {}).get('includeGraph'), True)
        graph_summary = None
        if include_graph:
            try:
                ensure_graph_permission_ready(connection, refresh=True)
                graph_summary = graph_reconcile(
                    connection,
                    dry_run=dry_run,
                    enforce_permission_check=False,
                    correlation_id=correlation_id,
                )
            except Exception as exc:
                record_audit_event(
                    user=request.user,
                    action='azure.graph.permission.denied',
                    connection=connection,
                    metadata={'reason': str(exc), 'correlationId': correlation_id},
                )
                return Response(
                    {
                        'detail': str(exc),
                        'correlationId': correlation_id,
                        'graphPermission': get_graph_permission_status(connection, refresh=False),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        recon_summary = refresh_reconciliation(connection)
        record_audit_event(
            user=request.user,
            action='azure.reconcile.now',
            connection=connection,
            metadata={'dryRun': dry_run, 'includeGraph': include_graph, 'correlationId': correlation_id},
        )
        return Response({'correlationId': correlation_id, 'graph': graph_summary, 'reconciliation': recon_summary})


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
        record_audit_event(
            user=request.user,
            action='azure.reconciliation.confirm',
            connection=connection,
            metadata={'id': row.id, 'azurePrincipalId': row.azure_principal_id},
        )
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
        record_audit_event(
            user=request.user,
            action='azure.reconciliation.override',
            connection=connection,
            metadata={
                'id': row.id,
                'azurePrincipalId': row.azure_principal_id,
                'candidateUserId': row.candidate_user_id,
                'candidatePersonId': row.candidate_person_id,
            },
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
        record_audit_event(
            user=request.user,
            action='azure.reconciliation.reject',
            connection=connection,
            metadata={'id': row.id, 'azurePrincipalId': row.azure_principal_id},
        )
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


class AzureScimServiceProviderConfigView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        correlation_id = _request_correlation_id(request)
        _log_scim_call(request, correlation_id, stage='service_provider_config')
        connection, error = _azure_scim_connection_or_error(correlation_id=correlation_id)
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return _scim_error('Unauthorized', status_code=status.HTTP_401_UNAUTHORIZED, correlation_id=correlation_id)
        return _scim_response(_scim_service_provider_config(), correlation_id=correlation_id)


class AzureScimSchemasView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        correlation_id = _request_correlation_id(request)
        _log_scim_call(request, correlation_id, stage='schemas')
        connection, error = _azure_scim_connection_or_error(correlation_id=correlation_id)
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return _scim_error('Unauthorized', status_code=status.HTTP_401_UNAUTHORIZED, correlation_id=correlation_id)
        return _scim_response(_scim_schemas_payload(), correlation_id=correlation_id)


class AzureScimResourceTypesView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        correlation_id = _request_correlation_id(request)
        _log_scim_call(request, correlation_id, stage='resource_types')
        connection, error = _azure_scim_connection_or_error(correlation_id=correlation_id)
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return _scim_error('Unauthorized', status_code=status.HTTP_401_UNAUTHORIZED, correlation_id=correlation_id)
        return _scim_response(_scim_resource_types_payload(request), correlation_id=correlation_id)


class AzureScimUsersView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        correlation_id = _request_correlation_id(request)
        _log_scim_call(request, correlation_id, stage='users_list')
        connection, error = _azure_scim_connection_or_error(correlation_id=correlation_id)
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return _scim_error('Unauthorized', status_code=status.HTTP_401_UNAUTHORIZED, correlation_id=correlation_id)

        filter_raw = (request.query_params.get('filter') or '').strip() or None
        try:
            query = _scim_links_for_filter(connection, filter_raw)
        except ValueError as exc:
            record_audit_event(
                user=None,
                action='azure.scim.error',
                connection=connection,
                metadata={
                    'stage': 'list',
                    'reason': str(exc),
                    'scimType': 'invalidFilter',
                    'correlationId': correlation_id,
                },
            )
            return _scim_error(
                str(exc),
                status_code=status.HTTP_400_BAD_REQUEST,
                scim_type='invalidFilter',
                correlation_id=correlation_id,
            )

        start_index = max(1, _as_int(request.query_params.get('startIndex'), 1))
        count = _as_int(request.query_params.get('count'), 100)
        count = max(1, min(count, 200))
        total = query.count()
        start_pos = start_index - 1
        links = list(query[start_pos:start_pos + count])
        resources = [_scim_user_resource_from_link(request, link) for link in links]
        return _scim_response(
            _scim_list_response(resources, total=total, start_index=start_index),
            correlation_id=correlation_id,
        )

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        correlation_id = _request_correlation_id(request)
        _log_scim_call(request, correlation_id, stage='users_create')
        connection, error = _azure_scim_connection_or_error(correlation_id=correlation_id)
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return _scim_error('Unauthorized', status_code=status.HTTP_401_UNAUTHORIZED, correlation_id=correlation_id)
        payload = request.data if isinstance(request.data, dict) else {}
        principal = _principal_from_scim_payload(payload)
        if not (principal.get('azure_oid') or '').strip():
            return _scim_error(
                'externalId is required for SCIM user creation.',
                status_code=status.HTTP_400_BAD_REQUEST,
                scim_type='invalidValue',
                correlation_id=correlation_id,
            )
        existing = AzureIdentityLink.objects.filter(
            connection=connection,
            azure_oid=principal['azure_oid'],
            is_active=True,
        ).first()
        if existing:
            return _scim_error(
                'Resource already exists for this external identity.',
                status_code=status.HTTP_409_CONFLICT,
                scim_type='uniqueness',
                correlation_id=correlation_id,
            )
        try:
            result = upsert_azure_principal(connection, principal, source='scim', allow_create=True)
        except Exception as exc:
            logger.exception('azure_scim_create_failed')
            record_audit_event(
                user=None,
                action='azure.scim.error',
                connection=connection,
                metadata={'stage': 'create', 'reason': str(exc), 'correlationId': correlation_id},
            )
            return _scim_error(str(exc), status_code=status.HTTP_400_BAD_REQUEST, correlation_id=correlation_id)
        if result.get('status') == 'conflict':
            return _scim_error(
                'Multiple matching local users found.',
                status_code=status.HTTP_409_CONFLICT,
                scim_type='uniqueness',
                correlation_id=correlation_id,
            )
        if result.get('status') not in ('upserted', 'deprovisioned'):
            return _scim_error(
                f"Unable to create user: {result.get('status')}",
                status_code=status.HTTP_400_BAD_REQUEST,
                scim_type='invalidValue',
                correlation_id=correlation_id,
            )
        link = _find_scim_link(connection, str(principal.get('azure_oid') or ''))
        if not link:
            return _scim_error(
                'Linked identity was not created.',
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                correlation_id=correlation_id,
            )
        record_audit_event(
            user=None,
            action='azure.scim.create',
            connection=connection,
            metadata={
                'azurePrincipalId': principal.get('azure_oid'),
                'status': result.get('status'),
                'correlationId': correlation_id,
            },
        )
        response = _scim_response(
            _scim_user_resource_from_link(request, link),
            status_code=status.HTTP_201_CREATED,
            correlation_id=correlation_id,
        )
        response['Location'] = _scim_user_location(request, link.azure_oid)
        return response


class AzureScimUserDetailView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request, principal_id: str):
        correlation_id = _request_correlation_id(request)
        _log_scim_call(request, correlation_id, stage='user_get', principal_id=principal_id)
        connection, error = _azure_scim_connection_or_error(correlation_id=correlation_id)
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return _scim_error('Unauthorized', status_code=status.HTTP_401_UNAUTHORIZED, correlation_id=correlation_id)
        link = _find_scim_link(connection, principal_id)
        if not link:
            return _scim_error('User not found', status_code=status.HTTP_404_NOT_FOUND, correlation_id=correlation_id)
        return _scim_response(_scim_user_resource_from_link(request, link), correlation_id=correlation_id)

    @extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def patch(self, request, principal_id: str):
        correlation_id = _request_correlation_id(request)
        _log_scim_call(request, correlation_id, stage='user_patch', principal_id=principal_id)
        connection, error = _azure_scim_connection_or_error(correlation_id=correlation_id)
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return _scim_error('Unauthorized', status_code=status.HTTP_401_UNAUTHORIZED, correlation_id=correlation_id)
        link = _find_scim_link(connection, principal_id)
        if not link:
            return _scim_error('User not found', status_code=status.HTTP_404_NOT_FOUND, correlation_id=correlation_id)

        user = link.user
        profile = UserProfile.objects.select_related('person', 'person__department', 'person__role').filter(user=user).first()
        person = profile.person if profile else None
        base_payload: dict[str, Any] = {
            'id': link.azure_oid,
            'externalId': str(user.id),
            'tenantId': link.tenant_id,
            'userName': (link.upn_at_link or user.username or '').strip(),
            'displayName': person.name if person else (link.upn_at_link or user.username or ''),
            'emails': [{'value': user.email, 'type': 'work', 'primary': True}] if (user.email or '').strip() else [],
            'active': bool(user.is_active and (person.is_active if person else True)),
            'department': person.department.name if person and person.department else '',
            'jobTitle': person.role.name if person and person.role else '',
        }
        payload = request.data if isinstance(request.data, dict) else {}
        merged_input = dict(base_payload)
        for key, value in payload.items():
            if key == 'Operations':
                continue
            merged_input[key] = value
        if isinstance(payload.get('Operations'), list):
            merged_input['Operations'] = payload.get('Operations')
        merged = _apply_scim_patch_operations(merged_input)
        principal = _principal_from_scim_payload(merged, principal_id_override=link.azure_oid)
        try:
            result = upsert_azure_principal(connection, principal, source='scim', allow_create=True)
        except Exception as exc:
            logger.exception('azure_scim_patch_failed')
            record_audit_event(
                user=None,
                action='azure.scim.error',
                connection=connection,
                metadata={
                    'stage': 'patch',
                    'reason': str(exc),
                    'azurePrincipalId': principal_id,
                    'correlationId': correlation_id,
                },
            )
            return _scim_error(str(exc), status_code=status.HTTP_400_BAD_REQUEST, correlation_id=correlation_id)
        if result.get('status') == 'conflict':
            return _scim_error(
                'Multiple matching local users found.',
                status_code=status.HTTP_409_CONFLICT,
                scim_type='uniqueness',
                correlation_id=correlation_id,
            )
        refreshed = _find_scim_link(connection, link.azure_oid)
        if not refreshed:
            return _scim_error('User not found after patch', status_code=status.HTTP_404_NOT_FOUND, correlation_id=correlation_id)
        record_audit_event(
            user=None,
            action='azure.scim.patch',
            connection=connection,
            metadata={
                'azurePrincipalId': refreshed.azure_oid,
                'status': result.get('status'),
                'correlationId': correlation_id,
            },
        )
        return _scim_response(_scim_user_resource_from_link(request, refreshed), correlation_id=correlation_id)

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def delete(self, request, principal_id: str):
        correlation_id = _request_correlation_id(request)
        _log_scim_call(request, correlation_id, stage='user_delete', principal_id=principal_id)
        connection, error = _azure_scim_connection_or_error(correlation_id=correlation_id)
        if error:
            return error
        if not _require_scim_auth(request, connection):
            return _scim_error('Unauthorized', status_code=status.HTTP_401_UNAUTHORIZED, correlation_id=correlation_id)
        link = _find_scim_link(connection, principal_id)
        if not link:
            response = Response(status=status.HTTP_204_NO_CONTENT)
            response['X-Correlation-ID'] = correlation_id
            return response
        principal = {
            'tenant_id': link.tenant_id,
            'azure_oid': link.azure_oid,
            'upn': link.upn_at_link,
            'email': link.email_at_link,
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
            record_audit_event(
                user=None,
                action='azure.scim.error',
                connection=connection,
                metadata={
                    'stage': 'delete',
                    'reason': str(exc),
                    'azurePrincipalId': principal_id,
                    'correlationId': correlation_id,
                },
            )
            return _scim_error(str(exc), status_code=status.HTTP_400_BAD_REQUEST, correlation_id=correlation_id)
        record_audit_event(
            user=None,
            action='azure.scim.delete',
            connection=connection,
            metadata={
                'azurePrincipalId': link.azure_oid,
                'status': result.get('status'),
                'correlationId': correlation_id,
            },
        )
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response['X-Correlation-ID'] = correlation_id
        return response
