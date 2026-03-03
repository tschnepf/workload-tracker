from __future__ import annotations

import logging
import secrets
from datetime import date
from typing import Any

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from accounts.models import UserProfile
from assignments.models import Assignment
from core.week_utils import sunday_of_week
from departments.models import Department
from people.models import DeactivationAudit, Person
from roles.models import Role

from .models import (
    AuthMethodPolicy,
    AzureDepartmentMapping,
    AzureIdentityLink,
    AzureReconciliationRecord,
    AzureRoleMapping,
    EncryptedSecret,
    IntegrationConnection,
    IntegrationSetting,
)
from .oauth import OAuthError, get_connection_access_token
from .registry import get_registry

logger = logging.getLogger(__name__)

SNAPSHOT_SETTING_KEY = 'azure.directory_snapshot'
GRAPH_STATE_SETTING_KEY = 'azure.graph_state'
GRAPH_PERMISSION_SETTING_KEY = 'azure.graph_permission'


def _configured_tenant_id() -> str:
    return (getattr(settings, 'AZURE_SSO_TENANT_ID', '') or '').strip()


def _graph_permission_gate_enabled() -> bool:
    return bool(getattr(settings, 'AZURE_GRAPH_PERMISSION_GATE', True))


def get_auth_method_policy() -> AuthMethodPolicy:
    return AuthMethodPolicy.get_solo()


def get_azure_connection() -> IntegrationConnection | None:
    connection = (
        IntegrationConnection.objects.select_related('provider')
        .filter(
            provider__key='azure',
            environment='production',
            is_disabled=False,
        )
        .order_by('-updated_at')
        .first()
    )
    if connection:
        return connection
    return (
        IntegrationConnection.objects.select_related('provider')
        .filter(provider__key='azure', is_disabled=False)
        .order_by('-updated_at')
        .first()
    )


def _norm(value: str | None) -> str:
    return (value or '').strip()


def _norm_lower(value: str | None) -> str:
    return _norm(value).lower()


def _is_guest(principal: dict[str, Any]) -> bool:
    user_type = _norm_lower(principal.get('user_type'))
    upn = _norm_lower(principal.get('upn'))
    return user_type == 'guest' or '#ext#' in upn


def _is_service_account(principal: dict[str, Any]) -> bool:
    if principal.get('is_service_account') is True:
        return True
    upn = _norm_lower(principal.get('upn'))
    email = _norm_lower(principal.get('email'))
    service_markers = ('svc-', 'svc_', 'service-', 'service_')
    return upn.startswith(service_markers) or email.startswith(service_markers)


def is_in_scope(principal: dict[str, Any]) -> bool:
    return not _is_guest(principal) and not _is_service_account(principal)


def _matching_users(upn: str, email: str):
    User = get_user_model()
    query = User.objects.none()
    if upn:
        query = query | User.objects.filter(username__iexact=upn)
        query = query | User.objects.filter(email__iexact=upn)
    if email:
        query = query | User.objects.filter(email__iexact=email)
    return User.objects.filter(id__in=query.values_list('id', flat=True).distinct())


def _username_from_upn(upn: str) -> str:
    User = get_user_model()
    base = (upn or '').strip() or f"azure-{secrets.token_hex(4)}"
    candidate = base[:150]
    if not User.objects.filter(username__iexact=candidate).exists():
        return candidate
    for i in range(2, 1000):
        suffix = f"-{i}"
        head = base[: (150 - len(suffix))]
        alt = f"{head}{suffix}"
        if not User.objects.filter(username__iexact=alt).exists():
            return alt
    return f"azure-{secrets.token_hex(10)}"


def _load_snapshot(connection: IntegrationConnection) -> dict[str, Any]:
    setting = IntegrationSetting.objects.filter(connection=connection, key=SNAPSHOT_SETTING_KEY).first()
    if not setting:
        return {'items': []}
    data = dict(setting.data or {})
    if not isinstance(data.get('items'), list):
        data['items'] = []
    return data


def _save_snapshot(connection: IntegrationConnection, data: dict[str, Any]) -> None:
    IntegrationSetting.objects.update_or_create(
        connection=connection,
        key=SNAPSHOT_SETTING_KEY,
        defaults={'data': data},
    )


def update_directory_snapshot(connection: IntegrationConnection, principal: dict[str, Any]) -> None:
    principal_id = _norm(principal.get('azure_oid'))
    if not principal_id:
        return
    configured_tenant = _configured_tenant_id()
    tenant_id = _norm(principal.get('tenant_id'))
    if configured_tenant:
        if tenant_id and tenant_id != configured_tenant:
            return
        if not tenant_id:
            principal = dict(principal)
            principal['tenant_id'] = configured_tenant
    snap = _load_snapshot(connection)
    items = snap.get('items') or []
    updated = False
    now_iso = timezone.now().isoformat()
    for idx, item in enumerate(items):
        if _norm(item.get('azure_oid')) == principal_id:
            payload = dict(principal)
            payload['updated_at'] = now_iso
            items[idx] = payload
            updated = True
            break
    if not updated:
        payload = dict(principal)
        payload['updated_at'] = now_iso
        items.append(payload)
    if len(items) > 20000:
        items = items[-20000:]
    snap['items'] = items
    snap['updated_at'] = now_iso
    _save_snapshot(connection, snap)


def _resolve_department(connection: IntegrationConnection, source: str | None) -> Department | None:
    src = _norm(source)
    if not src:
        return None
    mapping = (
        AzureDepartmentMapping.objects.select_related('department')
        .filter(connection=connection, source_value__iexact=src)
        .first()
    )
    return mapping.department if mapping and mapping.department else None


def _resolve_role(connection: IntegrationConnection, source: str | None) -> Role | None:
    src = _norm(source)
    if not src:
        return None
    mapping = (
        AzureRoleMapping.objects.select_related('role')
        .filter(connection=connection, source_value__iexact=src)
        .first()
    )
    return mapping.role if mapping and mapping.role else None


def _ensure_user_profile_person(user, principal: dict[str, Any], connection: IntegrationConnection) -> tuple[UserProfile, Person]:
    profile, _ = UserProfile.objects.get_or_create(user=user)
    display_name = _norm(principal.get('display_name'))
    if not display_name:
        given = _norm(principal.get('given_name'))
        surname = _norm(principal.get('surname'))
        display_name = _norm(f"{given} {surname}") or _norm(principal.get('upn')) or user.username

    if profile.person:
        person = profile.person
    else:
        person = Person.objects.create(
            name=display_name,
            email=_norm(principal.get('email')) or _norm(principal.get('upn')) or '',
            is_active=True,
        )
        profile.person = person
        profile.save(update_fields=['person', 'updated_at'])

    person.name = display_name
    if _norm(principal.get('email')) or _norm(principal.get('upn')):
        person.email = _norm(principal.get('email')) or _norm(principal.get('upn'))
    person.department = _resolve_department(connection, principal.get('department'))
    person.role = _resolve_role(connection, principal.get('job_title'))
    person.is_active = True
    person.save(update_fields=['name', 'email', 'department', 'role', 'is_active', 'updated_at'])
    return profile, person


def _ensure_identity_link(connection: IntegrationConnection, user, principal: dict[str, Any]) -> AzureIdentityLink:
    tenant_id = _norm(principal.get('tenant_id')) or 'unknown'
    azure_oid = _norm(principal.get('azure_oid'))
    defaults = {
        'connection': connection,
        'user': user,
        'upn_at_link': _norm(principal.get('upn')),
        'email_at_link': _norm(principal.get('email')),
        'metadata': {
            'display_name': _norm(principal.get('display_name')),
        },
        'is_active': True,
    }
    link, created = AzureIdentityLink.objects.get_or_create(
        tenant_id=tenant_id,
        azure_oid=azure_oid,
        defaults=defaults,
    )
    if not created:
        dirty = False
        if link.user_id != user.id:
            link.user = user
            dirty = True
        if not link.is_active:
            link.is_active = True
            dirty = True
        if link.connection_id != connection.id:
            link.connection = connection
            dirty = True
        if link.upn_at_link != _norm(principal.get('upn')):
            link.upn_at_link = _norm(principal.get('upn'))
            dirty = True
        if link.email_at_link != _norm(principal.get('email')):
            link.email_at_link = _norm(principal.get('email'))
            dirty = True
        if dirty:
            link.save(update_fields=['user', 'is_active', 'connection', 'upn_at_link', 'email_at_link', 'updated_at'])
    return link


def _deprovision_assignments(person: Person, effective_date: date) -> dict[str, Any]:
    # Preserve past allocations, move future hours to unassigned placeholders.
    effective_week = sunday_of_week(effective_date).isoformat()
    touched = 0
    moved_hours = 0.0
    moved_weeks = 0
    assignments = Assignment.objects.select_for_update().filter(person=person, is_active=True)
    for assignment in assignments:
        weekly_hours = dict(assignment.weekly_hours or {})
        future: dict[str, float] = {}
        past: dict[str, Any] = {}
        for key, value in weekly_hours.items():
            try:
                hours = float(value or 0)
            except Exception:
                hours = 0.0
            if key >= effective_week and hours > 0:
                future[key] = hours
            else:
                past[key] = value

        if future:
            placeholder, _ = Assignment.objects.get_or_create(
                person=None,
                project=assignment.project,
                project_name=assignment.project_name,
                department=assignment.department,
                role_on_project_ref=assignment.role_on_project_ref,
                role_on_project=assignment.role_on_project,
                defaults={
                    'weekly_hours': {},
                    'is_active': True,
                    'start_date': effective_date,
                },
            )
            ph_wh = dict(placeholder.weekly_hours or {})
            for wk, hrs in future.items():
                moved_weeks += 1
                moved_hours += float(hrs or 0)
                existing = float(ph_wh.get(wk) or 0)
                ph_wh[wk] = round(existing + float(hrs or 0), 2)
            placeholder.weekly_hours = ph_wh
            placeholder.is_active = True
            placeholder.save(update_fields=['weekly_hours', 'is_active', 'updated_at'])
        assignment.weekly_hours = past
        assignment.is_active = False
        assignment.end_date = effective_date
        assignment.save(update_fields=['weekly_hours', 'is_active', 'end_date', 'updated_at'])
        touched += 1

    audit = None
    try:
        audit = DeactivationAudit.objects.create(
            person=person,
            user_id=None,
            mode='future',
            assignments_touched=touched,
            assignments_deactivated=touched,
            hours_zeroed=round(moved_hours, 2),
            week_keys_touched=[],
            deliverable_links_deactivated=0,
        )
    except Exception:  # nosec B110
        audit = None
    return {
        'assignments_touched': touched,
        'future_hours_moved': round(moved_hours, 2),
        'future_week_slots_moved': moved_weeks,
        'audit_id': audit.id if audit else None,
    }


def _deprovision_user_and_person(user, person: Person | None, *, effective_date: date) -> dict[str, Any]:
    user.is_active = False
    user.set_unusable_password()
    user.save(update_fields=['is_active', 'password'])

    result = {'user_id': user.id, 'person_id': None, 'assignment_result': None}
    if not person:
        return result
    assignment_result = _deprovision_assignments(person, effective_date=effective_date)
    person.is_active = False
    person.save(update_fields=['is_active', 'updated_at'])
    result['person_id'] = person.id
    result['assignment_result'] = assignment_result
    return result


@transaction.atomic
def upsert_azure_principal(
    connection: IntegrationConnection,
    principal: dict[str, Any],
    *,
    source: str,
    allow_create: bool = True,
    linked_user_id: int | None = None,
    linked_person_id: int | None = None,
) -> dict[str, Any]:
    principal = dict(principal or {})
    principal['source'] = source
    upn = _norm_lower(principal.get('upn'))
    email = _norm_lower(principal.get('email'))
    azure_oid = _norm(principal.get('azure_oid'))
    if not azure_oid:
        raise ValueError('azure_oid is required')
    configured_tenant = _configured_tenant_id()
    principal_tenant = _norm(principal.get('tenant_id'))
    if configured_tenant and principal_tenant and principal_tenant != configured_tenant:
        return {
            'status': 'skipped_wrong_tenant',
            'azure_oid': azure_oid,
            'tenant_id': principal_tenant,
        }
    if configured_tenant and not principal_tenant:
        principal['tenant_id'] = configured_tenant
    if not is_in_scope(principal):
        return {'status': 'skipped_out_of_scope', 'azure_oid': azure_oid}

    active = bool(principal.get('active', True))
    assigned_to_app = bool(principal.get('assigned_to_app', True))
    should_deprovision = (not active) or (not assigned_to_app)

    tenant_raw = _norm(principal.get('tenant_id'))
    link_qs = AzureIdentityLink.objects.select_related('user').filter(azure_oid=azure_oid)
    if tenant_raw:
        link_qs = link_qs.filter(tenant_id=tenant_raw)
    existing_link = link_qs.first()

    user = None
    if linked_user_id:
        User = get_user_model()
        user = User.objects.filter(id=linked_user_id).first()
    if not user and existing_link:
        user = existing_link.user

    candidates = list(_matching_users(upn, email)) if not user else []
    if not user and len(candidates) > 1:
        return {
            'status': 'conflict',
            'reason': 'duplicate_local_users',
            'candidate_user_ids': [u.id for u in candidates],
            'azure_oid': azure_oid,
        }
    if not user and len(candidates) == 1:
        user = candidates[0]

    if not user and not allow_create:
        return {'status': 'unmatched', 'azure_oid': azure_oid}
    if should_deprovision and not user and not existing_link:
        return {'status': 'not_found_for_deprovision', 'azure_oid': azure_oid}

    User = get_user_model()
    if not user:
        username = _username_from_upn(upn or email)
        user = User.objects.create_user(
            username=username,
            email=_norm(email or upn),
            password=None,
            is_active=True,
        )
        user.set_unusable_password()
        user.save(update_fields=['password'])
        user_created = True
    else:
        user_created = False
        dirty_fields: list[str] = []
        desired_email = _norm(email or upn)
        if desired_email and _norm_lower(user.email) != _norm_lower(desired_email):
            user.email = desired_email
            dirty_fields.append('email')
        if should_deprovision:
            if user.is_active:
                user.is_active = False
                dirty_fields.append('is_active')
        else:
            if not user.is_active:
                user.is_active = True
                dirty_fields.append('is_active')
        if dirty_fields:
            user.save(update_fields=dirty_fields)

    profile, person = _ensure_user_profile_person(user, principal, connection)
    if linked_person_id and linked_person_id != person.id:
        override_person = Person.objects.filter(id=linked_person_id).first()
        if override_person:
            profile.person = override_person
            profile.save(update_fields=['person', 'updated_at'])
            person = override_person

    link = _ensure_identity_link(connection, user, principal)
    update_directory_snapshot(connection, principal)

    if should_deprovision:
        deprov = _deprovision_user_and_person(user, person, effective_date=timezone.now().date())
        return {
            'status': 'deprovisioned',
            'user_created': user_created,
            'user_id': user.id,
            'person_id': person.id if person else None,
            'azure_oid': azure_oid,
            'link_id': link.id,
            'deprovision': deprov,
        }

    return {
        'status': 'upserted',
        'user_created': user_created,
        'user_id': user.id,
        'person_id': person.id if person else None,
        'azure_oid': azure_oid,
        'link_id': link.id,
    }


def refresh_reconciliation(connection: IntegrationConnection) -> dict[str, Any]:
    snapshot = _load_snapshot(connection)
    principals = list(snapshot.get('items') or [])
    proposed = 0
    conflicts = 0
    unmatched = 0
    applied = 0
    skipped_wrong_tenant = 0
    configured_tenant = _configured_tenant_id()

    for principal in principals:
        azure_oid = _norm(principal.get('azure_oid'))
        if not azure_oid:
            continue
        tenant_id = _norm(principal.get('tenant_id'))
        if configured_tenant:
            if tenant_id and tenant_id != configured_tenant:
                skipped_wrong_tenant += 1
                continue
            tenant_id = configured_tenant
        tenant_id = tenant_id or 'unknown'
        upn = _norm_lower(principal.get('upn'))
        email = _norm_lower(principal.get('email'))
        link = AzureIdentityLink.objects.filter(
            tenant_id=tenant_id,
            azure_oid=azure_oid,
            is_active=True,
        ).select_related('user').first()
        candidate_user = None
        candidate_person = None
        confidence = 0.0
        reason_codes: list[str] = []
        status = AzureReconciliationRecord.STATUS_UNMATCHED

        if link:
            status = AzureReconciliationRecord.STATUS_APPLIED
            candidate_user = link.user
            profile = getattr(candidate_user, 'profile', None)
            candidate_person = getattr(profile, 'person', None) if profile else None
            confidence = 1.0
            reason_codes.append('already_linked')
            applied += 1
        else:
            matches = list(_matching_users(upn, email))
            if len(matches) > 1:
                status = AzureReconciliationRecord.STATUS_CONFLICT
                reason_codes.append('duplicate_local_users')
                conflicts += 1
            elif len(matches) == 1:
                candidate_user = matches[0]
                profile = getattr(candidate_user, 'profile', None)
                candidate_person = getattr(profile, 'person', None) if profile else None
                status = AzureReconciliationRecord.STATUS_PROPOSED
                confidence = 0.95
                reason_codes.append('unique_identifier_match')
                proposed += 1
            else:
                status = AzureReconciliationRecord.STATUS_UNMATCHED
                reason_codes.append('no_local_match')
                unmatched += 1

        AzureReconciliationRecord.objects.update_or_create(
            connection=connection,
            azure_principal_id=azure_oid,
            defaults={
                'tenant_id': tenant_id,
                'upn': _norm(principal.get('upn')),
                'email': _norm(principal.get('email')),
                'display_name': _norm(principal.get('display_name')),
                'department': _norm(principal.get('department')),
                'job_title': _norm(principal.get('job_title')),
                'candidate_user': candidate_user,
                'candidate_person': candidate_person,
                'status': status,
                'confidence': confidence,
                'reason_codes': reason_codes,
                'metadata': {'source': principal.get('source')},
            },
        )

    return {
        'total': len(principals),
        'proposed': proposed,
        'conflicts': conflicts,
        'unmatched': unmatched,
        'applied': applied,
        'skippedWrongTenant': skipped_wrong_tenant,
    }


def apply_confirmed_reconciliation(connection: IntegrationConnection, actor=None) -> dict[str, Any]:
    records = (
        AzureReconciliationRecord.objects.select_related('candidate_user', 'candidate_person')
        .filter(connection=connection, status=AzureReconciliationRecord.STATUS_CONFIRMED)
        .order_by('id')
    )
    applied = 0
    failed = 0
    errors: list[dict[str, Any]] = []
    snapshot = _load_snapshot(connection)
    snapshot_map = {
        _norm(item.get('azure_oid')): item for item in list(snapshot.get('items') or [])
    }
    for record in records:
        principal = snapshot_map.get(record.azure_principal_id)
        if not principal:
            failed += 1
            errors.append({'id': record.id, 'reason': 'principal_missing_from_snapshot'})
            continue
        try:
            outcome = upsert_azure_principal(
                connection,
                principal,
                source='reconciliation',
                allow_create=True,
                linked_user_id=record.candidate_user_id,
                linked_person_id=record.candidate_person_id,
            )
            if outcome.get('status') in ('upserted', 'deprovisioned'):
                record.status = AzureReconciliationRecord.STATUS_APPLIED
                record.resolved_by = actor if getattr(actor, 'is_authenticated', False) else None
                record.resolved_at = timezone.now()
                record.metadata = {**(record.metadata or {}), 'applyOutcome': outcome}
                record.save(update_fields=['status', 'resolved_by', 'resolved_at', 'metadata', 'updated_at'])
                applied += 1
            else:
                failed += 1
                errors.append({'id': record.id, 'reason': outcome.get('status')})
        except Exception as exc:  # nosec B110
            failed += 1
            errors.append({'id': record.id, 'reason': str(exc)})
    return {'applied': applied, 'failed': failed, 'errors': errors}


def _load_graph_state(connection: IntegrationConnection) -> dict[str, Any]:
    setting = IntegrationSetting.objects.filter(connection=connection, key=GRAPH_STATE_SETTING_KEY).first()
    if not setting:
        return {}
    return dict(setting.data or {})


def _save_graph_state(connection: IntegrationConnection, state: dict[str, Any]) -> None:
    IntegrationSetting.objects.update_or_create(
        connection=connection,
        key=GRAPH_STATE_SETTING_KEY,
        defaults={'data': state},
    )


def _save_graph_permission_state(connection: IntegrationConnection, state: dict[str, Any]) -> None:
    IntegrationSetting.objects.update_or_create(
        connection=connection,
        key=GRAPH_PERMISSION_SETTING_KEY,
        defaults={'data': state},
    )


def get_graph_permission_status(connection: IntegrationConnection, *, refresh: bool = False) -> dict[str, Any]:
    if refresh:
        return probe_graph_user_read_all(connection)
    if not _graph_permission_gate_enabled():
        return {
            'ready': True,
            'reason': 'Graph permission gate disabled',
            'requiredPermission': 'User.Read.All',
            'checkedAt': None,
        }
    setting = IntegrationSetting.objects.filter(connection=connection, key=GRAPH_PERMISSION_SETTING_KEY).first()
    if setting and isinstance(setting.data, dict):
        return dict(setting.data)
    return {
        'ready': False,
        'reason': 'Graph permission status has not been validated.',
        'requiredPermission': 'User.Read.All',
        'checkedAt': None,
    }


def probe_graph_user_read_all(connection: IntegrationConnection) -> dict[str, Any]:
    checked_at = timezone.now().isoformat()
    if not _graph_permission_gate_enabled():
        state = {
            'ready': True,
            'reason': 'Graph permission gate disabled',
            'requiredPermission': 'User.Read.All',
            'statusCode': None,
            'errorCode': None,
            'checkedAt': checked_at,
        }
        _save_graph_permission_state(connection, state)
        return state

    provider = get_registry().get_provider('azure')
    if not provider:
        state = {
            'ready': False,
            'reason': 'Azure provider metadata is missing',
            'requiredPermission': 'User.Read.All',
            'statusCode': None,
            'errorCode': 'provider_missing',
            'checkedAt': checked_at,
        }
        _save_graph_permission_state(connection, state)
        return state

    try:
        access_token = get_connection_access_token(connection, provider_meta=provider)
    except Exception as exc:  # nosec B110
        state = {
            'ready': False,
            'reason': f'Azure OAuth token unavailable: {exc}',
            'requiredPermission': 'User.Read.All',
            'statusCode': None,
            'errorCode': 'oauth_unavailable',
            'checkedAt': checked_at,
        }
        _save_graph_permission_state(connection, state)
        return state

    url = 'https://graph.microsoft.com/v1.0/users?$top=1&$select=id'
    status_code: int | None = None
    error_code = None
    reason = None
    ready = False
    try:
        resp = requests.get(
            url,
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=(5, 20),
        )
        status_code = int(resp.status_code)
        if resp.status_code < 400:
            ready = True
            reason = None
        else:
            payload = resp.json() if 'application/json' in (resp.headers.get('Content-Type') or '').lower() else {}
            err = payload.get('error') if isinstance(payload, dict) else {}
            if isinstance(err, dict):
                error_code = _norm(err.get('code'))
                reason = _norm(err.get('message'))
            if not reason:
                reason = f'Graph permission probe failed ({resp.status_code}). Admin consent for User.Read.All is required.'
    except Exception as exc:  # nosec B110
        reason = f'Graph permission probe failed: {exc}'
        error_code = 'probe_failed'

    state = {
        'ready': bool(ready),
        'reason': reason,
        'requiredPermission': 'User.Read.All',
        'statusCode': status_code,
        'errorCode': error_code,
        'checkedAt': checked_at,
    }
    _save_graph_permission_state(connection, state)
    return state


def ensure_graph_permission_ready(connection: IntegrationConnection, *, refresh: bool = False) -> dict[str, Any]:
    if not _graph_permission_gate_enabled():
        return {
            'ready': True,
            'reason': 'Graph permission gate disabled',
            'requiredPermission': 'User.Read.All',
            'checkedAt': timezone.now().isoformat(),
        }
    state = get_graph_permission_status(connection, refresh=refresh)
    if state.get('ready'):
        return state
    reason = _norm(state.get('reason')) or 'Missing admin consent for User.Read.All.'
    raise OAuthError(reason)


def graph_reconcile(
    connection: IntegrationConnection,
    *,
    dry_run: bool = False,
    enforce_permission_check: bool = True,
    correlation_id: str | None = None,
) -> dict[str, Any]:
    provider = get_registry().get_provider('azure')
    if not provider:
        raise ValueError('Azure provider metadata is missing')
    if enforce_permission_check:
        ensure_graph_permission_ready(connection, refresh=True)
    access_token = get_connection_access_token(connection, provider_meta=provider)
    state = _load_graph_state(connection)
    configured_tenant = _configured_tenant_id()
    if configured_tenant and not _norm(state.get('tenant_id')):
        state['tenant_id'] = configured_tenant
    next_url = _norm(state.get('next_url')) or 'https://graph.microsoft.com/v1.0/users/delta?$select=id,userPrincipalName,mail,displayName,givenName,surname,department,jobTitle,accountEnabled,userType'
    processed = 0
    upserted = 0
    deprovisioned = 0
    skipped = 0
    if correlation_id:
        logger.info(
            'azure_graph_reconcile_started',
            extra={'correlation_id': correlation_id, 'connection_id': connection.id, 'dry_run': dry_run},
        )

    while next_url:
        resp = requests.get(
            next_url,
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=(5, 45),
        )
        if resp.status_code >= 400:
            raise OAuthError(f'Graph delta request failed ({resp.status_code})')
        body = resp.json()
        values = list(body.get('value') or [])
        for item in values:
            principal = {
                'tenant_id': _norm(state.get('tenant_id')) or configured_tenant or '',
                'azure_oid': _norm(item.get('id')),
                'upn': _norm(item.get('userPrincipalName')),
                'email': _norm(item.get('mail')) or _norm(item.get('userPrincipalName')),
                'display_name': _norm(item.get('displayName')),
                'given_name': _norm(item.get('givenName')),
                'surname': _norm(item.get('surname')),
                'department': _norm(item.get('department')),
                'job_title': _norm(item.get('jobTitle')),
                'active': bool(item.get('accountEnabled', True)),
                'assigned_to_app': True,
                'user_type': _norm(item.get('userType')),
            }
            processed += 1
            if dry_run:
                continue
            outcome = upsert_azure_principal(connection, principal, source='graph', allow_create=True)
            status = outcome.get('status')
            if status == 'upserted':
                upserted += 1
            elif status == 'deprovisioned':
                deprovisioned += 1
            else:
                skipped += 1

        next_url = _norm(body.get('@odata.nextLink'))
        if not next_url:
            delta_link = _norm(body.get('@odata.deltaLink'))
            if delta_link:
                state['next_url'] = delta_link
            else:
                state['next_url'] = ''
            state['last_success_at'] = timezone.now().isoformat()
            _save_graph_state(connection, state)
            break
    summary = {
        'processed': processed,
        'upserted': upserted,
        'deprovisioned': deprovisioned,
        'skipped': skipped,
        'dryRun': dry_run,
        'lastSuccessAt': state.get('last_success_at'),
    }
    if correlation_id:
        logger.info(
            'azure_graph_reconcile_completed',
            extra={
                'correlation_id': correlation_id,
                'connection_id': connection.id,
                'processed': processed,
                'upserted': upserted,
                'deprovisioned': deprovisioned,
                'skipped': skipped,
                'dry_run': dry_run,
            },
        )
    return summary


def get_latest_scim_bearer(connection: IntegrationConnection) -> str | None:
    secret = connection.secrets.order_by('-created_at').first()
    # Search newest to oldest for kind-specific payload.
    for record in connection.secrets.all().order_by('-created_at'):
        try:
            payload = record.decrypt()
        except Exception:  # nosec B110
            continue
        if payload.get('kind') == 'azure_scim_token':
            token = _norm(payload.get('token'))
            if token:
                return token
    if secret:
        try:
            payload = secret.decrypt()
            if payload.get('kind') == 'azure_scim_token':
                return _norm(payload.get('token')) or None
        except Exception:  # nosec B110
            return None
    return None


def set_scim_bearer(connection: IntegrationConnection, token: str) -> None:
    EncryptedSecret.store(
        connection,
        {
            'kind': 'azure_scim_token',
            'token': token,
            'updated_at': timezone.now().isoformat(),
        },
    )


def list_snapshot_departments(connection: IntegrationConnection) -> list[dict[str, Any]]:
    snapshot = _load_snapshot(connection)
    counts: dict[str, int] = {}
    configured_tenant = _configured_tenant_id()
    for item in list(snapshot.get('items') or []):
        tenant_id = _norm(item.get('tenant_id'))
        if configured_tenant and tenant_id and tenant_id != configured_tenant:
            continue
        value = _norm(item.get('department'))
        if not value:
            continue
        counts[value] = counts.get(value, 0) + 1
    return [
        {'value': key, 'count': counts[key]}
        for key in sorted(counts.keys(), key=lambda v: v.lower())
    ]


def list_snapshot_groups(connection: IntegrationConnection) -> list[dict[str, Any]]:
    snapshot = _load_snapshot(connection)
    counts: dict[str, int] = {}
    configured_tenant = _configured_tenant_id()

    for item in list(snapshot.get('items') or []):
        tenant_id = _norm(item.get('tenant_id'))
        if configured_tenant and tenant_id and tenant_id != configured_tenant:
            continue
        groups: list[Any] = []
        raw = item.get('groups')
        if isinstance(raw, list):
            groups.extend(raw)
        raw_ids = item.get('group_ids')
        if isinstance(raw_ids, list):
            groups.extend(raw_ids)
        for group in groups:
            if isinstance(group, dict):
                name = _norm(group.get('displayName')) or _norm(group.get('name')) or _norm(group.get('id'))
            else:
                name = _norm(str(group))
            if not name:
                continue
            counts[name] = counts.get(name, 0) + 1

    return [
        {'value': key, 'count': counts[key]}
        for key in sorted(counts.keys(), key=lambda v: v.lower())
    ]
