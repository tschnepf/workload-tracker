from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.throttling import ScopedRateThrottle
from drf_spectacular.utils import extend_schema, inline_serializer, OpenApiParameter
from rest_framework import serializers, status
from django.conf import settings
from django.core.cache import cache
from django.core.paginator import Paginator
from django.db.models import Q, Value, Count
from django.db.models.functions import Coalesce, Lower
import hashlib
import os
import json
from django.db import transaction
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from .serializers import (
    PreDeliverableGlobalSettingsItemSerializer,
    PreDeliverableGlobalSettingsUpdateSerializer,
    UtilizationSchemeSerializer,
    ProjectRoleSerializer,
    CalendarFeedSettingsSerializer,
    DeliverablePhaseMappingSettingsSerializer,
    QATaskSettingsSerializer,
    WebPushGlobalSettingsSerializer,
    NotificationTemplateSerializer,
    WebPushVapidKeysStatusSerializer,
    WebPushVapidKeysGenerateSerializer,
    NetworkGraphSettingsSerializer,
    ProjectVisibilitySettingsSerializer,
    ProjectVisibilitySettingsUpdateSerializer,
    TaskProgressColorSettingsSerializer,
)
from .models import (
    PreDeliverableGlobalSettings,
    UtilizationScheme,
    ProjectRole,
    CalendarFeedSettings,
    DeliverablePhaseMappingSettings,
    DeliverablePhaseDefinition,
    QATaskSettings,
    WebPushGlobalSettings,
    WebPushVapidKeys,
    NotificationDeliveryLog,
    NotificationTemplate,
    TaskProgressColorSettings,
    NetworkGraphSettings,
    ProjectVisibilitySettings,
    AutoHoursRoleSetting,
    AutoHoursGlobalSettings,
    AutoHoursTemplate,
    AutoHoursTemplateRoleSetting,
)
from .notification_matrix import EVENT_CATALOG
from .webpush import (
    web_push_globally_enabled,
    web_push_keys_configured,
    web_push_event_capabilities,
    web_push_feature_capabilities,
    web_push_public_key,
    web_push_vapid_status,
    generate_vapid_keypair,
)
from .cache_keys import build_aggregate_cache_key
from .cache_scopes import request_scope_version
from accounts.permissions import IsAdminOrManager, is_admin_user, is_manager_user
from deliverables.models import PreDeliverableType
from accounts.models import AdminAuditLog  # type: ignore
from assignments.models import Assignment  # type: ignore
from projects.models import ProjectRole as DepartmentProjectRole
from projects.models import ProjectStatusDefinition
from people.models import Person
from people.serializers import PersonSerializer
from departments.models import Department
from departments.serializers import DepartmentSerializer
from core.departments import get_descendant_department_ids
from roles.models import Role
from roles.serializers import RoleSerializer
from verticals.models import Vertical
from verticals.serializers import VerticalSerializer
from skills.models import SkillTag, PersonSkill
from skills.serializers import SkillTagSerializer, PersonSkillSerializer, PersonSkillSummarySerializer
from core.search_tokens import parse_search_tokens, apply_token_filter
from projects.serializers import ProjectStatusDefinitionSerializer
from core.vertical_scope import get_request_enforced_vertical_id

AUTO_HOURS_MAX_WEEKS_BEFORE = 17
AUTO_HOURS_MAX_WEEKS_COUNT = AUTO_HOURS_MAX_WEEKS_BEFORE + 1
AUTO_HOURS_DEFAULT_WEEKS_COUNT = 6


def _bump_analytics_cache_version() -> None:
    key = 'analytics_cache_version'
    try:
        cache.incr(key)
    except Exception:
        current = cache.get(key, 1)
        try:
            cache.set(key, int(current) + 1, None)
        except Exception:
            pass


class UiBootstrapThrottle(ScopedRateThrottle):
    scope = 'ui_bootstrap'


class UiPageSnapshotThrottle(ScopedRateThrottle):
    scope = 'snapshots'


def _build_capabilities_payload():
    push_enabled = bool(web_push_globally_enabled() and web_push_keys_configured())
    caps = {
        'asyncJobs': os.getenv('ASYNC_JOBS', 'false').lower() == 'true',
        'aggregates': {
            'capacityHeatmap': True,
            'projectAvailability': True,
            'findAvailable': True,
            'gridSnapshot': True,
            'skillMatch': True,
        },
        'cache': {
            'shortTtlAggregates': os.getenv('SHORT_TTL_AGGREGATES', 'false').lower() == 'true',
            'aggregateTtlSeconds': int(os.getenv('AGGREGATE_CACHE_TTL', '30')),
        },
        'personalDashboard': True,
        'pwa': {
            'enabled': bool(getattr(settings, 'PWA_ENABLED', True)),
            'pushEnabled': push_enabled,
            'vapidPublicKey': web_push_public_key(),
            'pushEvents': web_push_event_capabilities(),
            'pushFeatures': web_push_feature_capabilities(),
            'offlineMode': 'shell',
        },
    }
    try:
        caps['projectRolesByDepartment'] = bool(settings.FEATURES.get('PROJECT_ROLES_BY_DEPARTMENT', False))
    except Exception:
        caps['projectRolesByDepartment'] = False
    try:
        caps['integrations'] = {'enabled': bool(getattr(settings, 'INTEGRATIONS_ENABLED', False))}
    except Exception:
        caps['integrations'] = {'enabled': False}
    return caps


def _parse_csv_include(raw, default_tokens: list[str], allowed_tokens: set[str], max_tokens: int = 10):
    if raw in (None, ''):
        return sorted(default_tokens), None
    if isinstance(raw, list):
        source = raw
    else:
        source = str(raw).split(',')
    tokens: list[str] = []
    for item in source:
        token = str(item).strip().lower()
        if not token:
            continue
        if token not in tokens:
            tokens.append(token)
    if not tokens:
        return sorted(default_tokens), None
    if len(tokens) > max_tokens:
        return None, f'include supports up to {max_tokens} tokens'
    unknown = sorted([token for token in tokens if token not in allowed_tokens])
    if unknown:
        return None, f"invalid include token(s): {', '.join(unknown)}"
    return sorted(tokens), None


def _parse_bool(raw, default: bool = False) -> bool:
    if raw in (None, ''):
        return default
    return str(raw).strip().lower() in ('1', 'true', 'yes', 'on')


def _bounded_int(raw, default: int, *, min_value: int, max_value: int) -> int:
    try:
        value = int(raw)
    except Exception:
        value = default
    return max(min_value, min(max_value, value))


def _payload_size_bytes(value: object) -> int:
    try:
        return len(json.dumps(value, default=str, separators=(',', ':')).encode('utf-8'))
    except Exception:
        return 0


def _page_urls(request, *, page_number: int, page_size: int, has_next: bool, has_previous: bool):
    def _make(num: int | None):
        if not num:
            return None
        params = request.query_params.copy()
        params['page'] = str(num)
        params['page_size'] = str(page_size)
        base = request.build_absolute_uri(request.path)
        return f"{base}?{params.urlencode()}" if params else base

    next_url = _make(page_number + 1 if has_next else None)
    prev_url = _make(page_number - 1 if has_previous else None)
    return next_url, prev_url


def _department_descendant_ids(root_department_id: int) -> list[int]:
    rows = Department.objects.values_list('id', 'parent_department_id')
    children_map = {}
    for dept_id, parent_id in rows:
        children_map.setdefault(parent_id, []).append(dept_id)
    visited = set()
    stack = [root_department_id]
    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)
        for child_id in children_map.get(current, []):
            if child_id not in visited:
                stack.append(child_id)
    return sorted(visited)


class UiBootstrapView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UiBootstrapThrottle]
    _INCLUDE_ALLOWED = {'verticals', 'capabilities', 'departments', 'roles'}

    def _parse_include(self, request) -> tuple[list[str] | None, str | None]:
        raw = (request.query_params.get('include') or '').strip().lower()
        if not raw:
            return sorted(self._INCLUDE_ALLOWED), None
        include_set = set(x.strip() for x in raw.split(',') if x.strip())
        unknown = sorted(x for x in include_set if x not in self._INCLUDE_ALLOWED)
        if unknown:
            return None, f"invalid include token(s): {', '.join(unknown)}"
        return sorted(include_set), None

    def _parse_vertical(self, request) -> tuple[int | None, str | None]:
        raw = request.query_params.get('vertical')
        if raw in (None, ''):
            return None, None
        try:
            return int(raw), None
        except Exception:
            return None, 'vertical must be an integer'

    def _parse_include_inactive(self, request) -> bool:
        raw = request.query_params.get('include_inactive')
        if raw in (None, ''):
            return False
        return str(raw).strip().lower() in ('1', 'true', 'yes', 'on')

    def _capabilities_payload(self):
        return _build_capabilities_payload()

    @extend_schema(
        parameters=[
            OpenApiParameter(name='include', type=str, required=False, description='CSV include: verticals,capabilities,departments,roles'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Department vertical scope'),
            OpenApiParameter(name='include_inactive', type=int, required=False, description='0|1 include inactive verticals/departments/roles'),
        ],
    )
    def get(self, request):
        if not settings.FEATURES.get('FF_UI_BOOTSTRAP', True):
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        include_tokens, include_err = self._parse_include(request)
        if include_err:
            return Response({'error': include_err}, status=status.HTTP_400_BAD_REQUEST)
        vertical_filter, vertical_err = self._parse_vertical(request)
        if vertical_err:
            return Response({'error': vertical_err}, status=status.HTTP_400_BAD_REQUEST)
        enforced_vertical = get_request_enforced_vertical_id(request)
        if enforced_vertical is not None:
            vertical_filter = enforced_vertical
        include_inactive = self._parse_include_inactive(request)

        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = None
        if use_cache:
            try:
                cache_key = build_aggregate_cache_key(
                    'ui.bootstrap',
                    request,
                    filters={
                        'include': include_tokens,
                        'vertical': vertical_filter if vertical_filter is not None else 'all',
                        'include_inactive': 1 if include_inactive else 0,
                    },
                )
                cached = cache.get(cache_key)
                if cached is not None:
                    return Response(cached)
            except Exception:
                cache_key = None

        include_set = set(include_tokens or [])
        payload: dict = {
            'contractVersion': 1,
            'included': include_tokens or [],
        }

        if 'verticals' in include_set:
            verticals_qs = Vertical.objects.order_by('name')
            if not include_inactive:
                verticals_qs = verticals_qs.filter(is_active=True)
            if enforced_vertical is not None:
                verticals_qs = verticals_qs.filter(id=enforced_vertical)
            payload['verticals'] = VerticalSerializer(verticals_qs, many=True).data

        if 'capabilities' in include_set:
            payload['capabilities'] = self._capabilities_payload()

        if 'departments' in include_set:
            departments_qs = Department.objects.select_related('manager').order_by('name')
            if not include_inactive:
                departments_qs = departments_qs.filter(is_active=True)
            if vertical_filter is not None:
                departments_qs = departments_qs.filter(vertical_id=vertical_filter)
            payload['departmentsAll'] = DepartmentSerializer(departments_qs, many=True).data

        if 'roles' in include_set:
            roles_qs = Role.objects.order_by('sort_order', 'name', 'id')
            if not include_inactive:
                roles_qs = roles_qs.filter(is_active=True)
            payload['rolesAll'] = RoleSerializer(roles_qs, many=True).data

        if use_cache and cache_key:
            try:
                cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
            except Exception:
                pass

        return Response(payload)


class PeoplePageSnapshotView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UiPageSnapshotThrottle]
    _INCLUDE_ALLOWED = {'filters', 'people', 'selected_person_skills'}
    _DEFAULT_INCLUDE = ['filters', 'people']
    _MAX_PAGE_SIZE = 200

    def _parse_include(self, request):
        return _parse_csv_include(
            request.query_params.get('include'),
            self._DEFAULT_INCLUDE,
            self._INCLUDE_ALLOWED,
        )

    def _parse_department_filters(self, raw_filters):
        if raw_filters is None:
            return []
        data = raw_filters
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                return []
        if not isinstance(data, list):
            return []
        cleaned = []
        for raw in data:
            if not isinstance(raw, dict):
                continue
            raw_id = raw.get('departmentId') or raw.get('department_id') or raw.get('id')
            dept_id = 0
            if isinstance(raw_id, str) and raw_id.strip().lower() in ('unassigned', 'none', 'null'):
                dept_id = 0
            else:
                try:
                    dept_id = int(raw_id or 0)
                except Exception:
                    dept_id = 0
            if dept_id < 0:
                continue
            if dept_id == 0 and raw_id not in (0, '0', 'unassigned', 'none', 'null'):
                continue
            op = (raw.get('op') or 'and').lower()
            if op not in ('and', 'or', 'not'):
                op = 'and'
            cleaned.append({'departmentId': dept_id, 'op': op})
        return cleaned

    def _apply_department_filters(self, queryset, filters):
        if not filters:
            return queryset
        include_all = set()
        include_any = set()
        exclude_only = set()
        for item in filters:
            op = item.get('op')
            dept_id = item.get('departmentId')
            if dept_id is None:
                continue
            if op == 'not':
                exclude_only.add(dept_id)
            elif op == 'or':
                include_any.add(dept_id)
            else:
                include_all.add(dept_id)

        def _dept_q(ids: set[int]):
            if not ids:
                return Q(pk__in=[])
            include_null = 0 in ids
            normalized_ids = sorted([dept_id for dept_id in ids if dept_id != 0])
            q = Q()
            if normalized_ids:
                q |= Q(department_id__in=normalized_ids)
            if include_null:
                q |= Q(department_id__isnull=True)
            return q

        if len(include_all) > 1:
            return queryset.none()
        if include_all:
            queryset = queryset.filter(_dept_q(include_all))
        if include_any:
            queryset = queryset.filter(_dept_q(include_any))
        if exclude_only:
            q_ex = Q()
            if 0 in exclude_only:
                q_ex |= Q(department_id__isnull=True)
            ids = sorted([dept_id for dept_id in exclude_only if dept_id != 0])
            if ids:
                q_ex |= Q(department_id__in=ids)
            if q_ex:
                queryset = queryset.exclude(q_ex)
        return queryset

    def _build_people_queryset(self, request, *, include_inactive: bool):
        queryset = (
            Person.objects
            .select_related('department', 'department__vertical', 'role')
            .only(
                'id', 'name', 'weekly_capacity', 'role', 'department', 'location', 'notes',
                'created_at', 'updated_at', 'department__name', 'department__vertical_id',
                'department__vertical__name', 'role__name', 'is_active', 'hire_date',
            )
        )
        if not include_inactive:
            queryset = queryset.filter(is_active=True)

        dept_param = request.query_params.get('department')
        include_children = _parse_bool(request.query_params.get('include_children'))
        if dept_param not in (None, ''):
            try:
                dept_id = int(dept_param)
                if include_children:
                    queryset = queryset.filter(department_id__in=_department_descendant_ids(dept_id))
                else:
                    queryset = queryset.filter(department_id=dept_id)
            except Exception:
                pass

        dept_filters_raw = request.query_params.get('department_filters') or request.query_params.get('departmentFilters')
        dept_filters = self._parse_department_filters(dept_filters_raw)
        if dept_filters:
            queryset = self._apply_department_filters(queryset, dept_filters)

        vertical_param = request.query_params.get('vertical')
        if vertical_param not in (None, ''):
            try:
                queryset = queryset.filter(department__vertical_id=int(vertical_param))
            except Exception:
                pass

        locations = request.query_params.getlist('location')
        if not locations:
            csv_locations = request.query_params.get('location')
            if csv_locations:
                locations = [part.strip() for part in str(csv_locations).split(',') if part.strip()]
        if locations:
            location_q = Q()
            for loc in locations:
                if loc == 'Remote':
                    location_q |= Q(location__icontains='remote')
                elif loc == 'unspecified':
                    location_q |= Q(location__isnull=True) | Q(location__exact='')
                else:
                    location_q |= Q(location__iexact=loc)
            queryset = queryset.filter(location_q)

        search = (request.query_params.get('search') or '').strip()
        token_data = {'search_tokens': [{'term': search, 'op': 'and'}]} if search else {}
        tokens = parse_search_tokens(request=request, data=token_data)
        people_fields = ['name', 'role__name', 'department__name', 'location', 'notes']
        queryset = apply_token_filter(queryset, tokens, people_fields)

        ordering = request.query_params.get('ordering') or 'name'
        queryset = queryset.annotate(
            location_sort=Coalesce(Lower('location'), Value('zzz_unspecified')),
            department_sort=Coalesce(Lower('department__name'), Value('zzz_unassigned')),
            role_sort=Coalesce(Lower('role__name'), Value('zzz_no_role')),
        )
        ordering_fields = []
        for raw in str(ordering).split(','):
            token = raw.strip()
            if not token:
                continue
            desc = token.startswith('-')
            key = token[1:] if desc else token
            if key == 'location':
                field = 'location_sort'
            elif key == 'department':
                field = 'department_sort'
            elif key == 'weeklyCapacity':
                field = 'weekly_capacity'
            elif key == 'role':
                field = 'role_sort'
            else:
                field = 'name'
            ordering_fields.append(f"-{field}" if desc else field)
        if ordering_fields:
            ordering_fields.append('id')
            return queryset.order_by(*ordering_fields)
        return queryset.order_by('name', 'id')

    def _build_filters_payload(self, request, *, include_inactive: bool):
        vertical_param = request.query_params.get('vertical')
        people_qs = Person.objects.all()
        if not include_inactive:
            people_qs = people_qs.filter(is_active=True)
        if vertical_param not in (None, ''):
            try:
                people_qs = people_qs.filter(department__vertical_id=int(vertical_param))
            except Exception:
                pass
        locations = list(
            people_qs
            .exclude(location__isnull=True)
            .exclude(location__exact='')
            .values_list('location', flat=True)
            .distinct()
        )

        departments_qs = Department.objects.select_related('manager').order_by('name')
        if not include_inactive:
            departments_qs = departments_qs.filter(is_active=True)
        if vertical_param not in (None, ''):
            try:
                departments_qs = departments_qs.filter(vertical_id=int(vertical_param))
            except Exception:
                pass

        roles_qs = Role.objects.order_by('sort_order', 'name', 'id')
        if not include_inactive:
            roles_qs = roles_qs.filter(is_active=True)

        return {
            'locations': sorted(set(locations), key=lambda value: (str(value).lower(), str(value))),
            'departments': DepartmentSerializer(departments_qs, many=True).data,
            'roles': RoleSerializer(roles_qs, many=True).data,
        }

    def _build_selected_person_skills_payload(self, request):
        person_raw = request.query_params.get('selected_person_id')
        if person_raw in (None, ''):
            return None
        try:
            person_id = int(person_raw)
        except Exception:
            return None
        rows = PersonSkill.objects.filter(person_id=person_id).select_related('skill_tag')
        serialized = PersonSkillSummarySerializer(rows, many=True).data
        grouped = {'strengths': [], 'inProgress': [], 'goals': []}
        for row in serialized:
            skill_type = row.get('skillType')
            if skill_type == 'strength':
                grouped['strengths'].append(row)
            elif skill_type == 'in_progress':
                grouped['inProgress'].append(row)
            elif skill_type == 'goals':
                grouped['goals'].append(row)
        return grouped

    def _apply_payload_guardrails(self, payload: dict):
        try:
            max_bytes = int(getattr(settings, 'UI_PEOPLE_PAGE_MAX_BYTES', 512_000))
        except Exception:
            max_bytes = 512_000
        max_bytes = max(2_048, max_bytes)
        if _payload_size_bytes(payload) <= max_bytes:
            return payload

        truncated = {}
        if 'selectedPersonSkills' in payload:
            payload.pop('selectedPersonSkills', None)
            truncated['selectedPersonSkills'] = 'removed'
            if _payload_size_bytes(payload) <= max_bytes:
                payload['truncated'] = truncated
                return payload

        people_block = payload.get('people')
        results = people_block.get('results') if isinstance(people_block, dict) else None
        if isinstance(results, list):
            omitted = 0
            while results and _payload_size_bytes(payload) > max_bytes:
                results.pop()
                omitted += 1
            if omitted:
                people_block['next'] = None
                truncated['people'] = {'returned': len(results), 'omitted': omitted}
            if _payload_size_bytes(payload) <= max_bytes:
                payload['truncated'] = truncated or {'reason': 'payload_cap_exceeded'}
                return payload

        payload['people'] = {'count': 0, 'next': None, 'previous': None, 'results': []}
        payload['truncated'] = {'reason': 'payload_cap_exceeded'}
        return payload

    @extend_schema(
        parameters=[
            OpenApiParameter(name='include', type=str, required=False, description='CSV include: filters,people,selected_person_skills'),
            OpenApiParameter(name='page', type=int, required=False),
            OpenApiParameter(name='page_size', type=int, required=False),
            OpenApiParameter(name='search', type=str, required=False),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='department_filters', type=str, required=False, description='JSON department clauses'),
            OpenApiParameter(name='vertical', type=int, required=False),
            OpenApiParameter(name='include_inactive', type=int, required=False, description='0|1'),
            OpenApiParameter(name='ordering', type=str, required=False),
            OpenApiParameter(name='selected_person_id', type=int, required=False),
        ],
    )
    def get(self, request):
        if not settings.FEATURES.get('FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS', True):
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        include_tokens, include_err = self._parse_include(request)
        if include_err:
            return Response({'error': include_err}, status=status.HTTP_400_BAD_REQUEST)

        page = _bounded_int(request.query_params.get('page'), 1, min_value=1, max_value=99999)
        page_size = _bounded_int(request.query_params.get('page_size'), 100, min_value=1, max_value=self._MAX_PAGE_SIZE)
        include_inactive = _parse_bool(request.query_params.get('include_inactive'))

        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = None
        if use_cache:
            try:
                cache_key = build_aggregate_cache_key(
                    'ui.people_page',
                    request,
                    filters={
                        'include': include_tokens or [],
                        'page': page,
                        'page_size': page_size,
                        'search': request.query_params.get('search') or '',
                        'department': request.query_params.get('department') or '',
                        'include_children': request.query_params.get('include_children') or '0',
                        'department_filters': request.query_params.get('department_filters') or request.query_params.get('departmentFilters') or '',
                        'vertical': request.query_params.get('vertical') or '',
                        'include_inactive': 1 if include_inactive else 0,
                        'ordering': request.query_params.get('ordering') or '',
                        'selected_person_id': request.query_params.get('selected_person_id') or '',
                    },
                )
                cached = cache.get(cache_key)
                if cached is not None:
                    return Response(cached)
            except Exception:
                cache_key = None

        include_set = set(include_tokens or [])
        payload = {
            'contractVersion': 1,
            'included': include_tokens or [],
        }

        if 'filters' in include_set:
            payload['filters'] = self._build_filters_payload(request, include_inactive=include_inactive)

        if 'people' in include_set:
            queryset = self._build_people_queryset(request, include_inactive=include_inactive)
            paginator = Paginator(queryset, page_size)
            page_obj = paginator.get_page(page)
            next_url, prev_url = _page_urls(
                request,
                page_number=page_obj.number,
                page_size=page_size,
                has_next=page_obj.has_next(),
                has_previous=page_obj.has_previous(),
            )
            payload['people'] = {
                'count': paginator.count,
                'next': next_url,
                'previous': prev_url,
                'results': PersonSerializer(page_obj.object_list, many=True).data,
            }

        if 'selected_person_skills' in include_set:
            selected_payload = self._build_selected_person_skills_payload(request)
            if selected_payload is not None:
                payload['selectedPersonSkills'] = selected_payload

        payload = self._apply_payload_guardrails(payload)
        if use_cache and cache_key:
            try:
                cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
            except Exception:
                pass
        return Response(payload)


class SkillsPageSnapshotView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]
    throttle_classes = [UiPageSnapshotThrottle]
    _INCLUDE_ALLOWED = {'departments', 'people', 'skill_tags', 'person_skills'}
    _DEFAULT_INCLUDE = ['departments', 'people', 'skill_tags', 'person_skills']
    _MAX_PAGE_SIZE = 200

    def _parse_include(self, request):
        return _parse_csv_include(
            request.query_params.get('include'),
            self._DEFAULT_INCLUDE,
            self._INCLUDE_ALLOWED,
        )

    def _paginate(self, queryset, *, request, page_key: str, page_size_key: str, default_page_size: int = 100):
        page = _bounded_int(request.query_params.get(page_key), 1, min_value=1, max_value=99999)
        page_size = _bounded_int(
            request.query_params.get(page_size_key),
            default_page_size,
            min_value=1,
            max_value=self._MAX_PAGE_SIZE,
        )
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page)
        next_url, prev_url = _page_urls(
            request,
            page_number=page_obj.number,
            page_size=page_size,
            has_next=page_obj.has_next(),
            has_previous=page_obj.has_previous(),
        )
        return {
            'count': paginator.count,
            'next': next_url,
            'previous': prev_url,
            'results': page_obj.object_list,
        }

    def _parse_int_list(self, raw):
        if raw in (None, ''):
            return []
        values = raw
        if isinstance(values, str):
            values = [part.strip() for part in values.split(',')]
        if not isinstance(values, (list, tuple)):
            return []
        parsed: list[int] = []
        seen: set[int] = set()
        for value in values:
            try:
                num = int(value)
            except Exception:
                continue
            if num <= 0 or num in seen:
                continue
            seen.add(num)
            parsed.append(num)
        return parsed

    def _apply_payload_guardrails(self, payload: dict):
        try:
            max_bytes = int(getattr(settings, 'UI_SKILLS_PAGE_MAX_BYTES', 768_000))
        except Exception:
            max_bytes = 768_000
        max_bytes = max(2_048, max_bytes)
        if _payload_size_bytes(payload) <= max_bytes:
            return payload

        truncated = {}
        person_skills = payload.get('personSkills')
        if isinstance(person_skills, dict) and isinstance(person_skills.get('results'), list):
            omitted = len(person_skills['results'])
            person_skills['results'] = []
            person_skills['next'] = None
            truncated['personSkills'] = {'returned': 0, 'omitted': omitted}
            if _payload_size_bytes(payload) <= max_bytes:
                payload['truncated'] = truncated
                return payload

        people = payload.get('people')
        if isinstance(people, dict) and isinstance(people.get('results'), list):
            omitted = 0
            while people['results'] and _payload_size_bytes(payload) > max_bytes:
                people['results'].pop()
                omitted += 1
            if omitted:
                people['next'] = None
                truncated['people'] = {'returned': len(people['results']), 'omitted': omitted}
            if _payload_size_bytes(payload) <= max_bytes:
                payload['truncated'] = truncated or {'reason': 'payload_cap_exceeded'}
                return payload

        payload['people'] = {'count': 0, 'next': None, 'previous': None, 'results': []}
        payload['personSkills'] = {'count': 0, 'next': None, 'previous': None, 'results': []}
        payload['truncated'] = {'reason': 'payload_cap_exceeded'}
        return payload

    @extend_schema(
        parameters=[
            OpenApiParameter(name='include', type=str, required=False, description='CSV include: departments,people,skill_tags,person_skills'),
            OpenApiParameter(name='vertical', type=int, required=False),
            OpenApiParameter(name='include_inactive', type=int, required=False, description='0|1'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='include_global', type=int, required=False, description='0|1 (when department set)'),
            OpenApiParameter(name='scope', type=str, required=False, description='global|department'),
            OpenApiParameter(name='people_search', type=str, required=False),
            OpenApiParameter(name='skill_search', type=str, required=False),
            OpenApiParameter(name='people_ids', type=str, required=False, description='CSV person ids'),
            OpenApiParameter(name='skill_tag_ids', type=str, required=False, description='CSV skill tag ids'),
            OpenApiParameter(name='people_page', type=int, required=False),
            OpenApiParameter(name='people_page_size', type=int, required=False),
            OpenApiParameter(name='skill_tags_page', type=int, required=False),
            OpenApiParameter(name='skill_tags_page_size', type=int, required=False),
            OpenApiParameter(name='person_skills_page', type=int, required=False),
            OpenApiParameter(name='person_skills_page_size', type=int, required=False),
        ],
    )
    def get(self, request):
        if not settings.FEATURES.get('FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS', True):
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        include_tokens, include_err = self._parse_include(request)
        if include_err:
            return Response({'error': include_err}, status=status.HTTP_400_BAD_REQUEST)

        include_inactive = _parse_bool(request.query_params.get('include_inactive'))
        include_children = _parse_bool(request.query_params.get('include_children'))
        include_global = _parse_bool(request.query_params.get('include_global'), default=True)
        scope = (request.query_params.get('scope') or '').strip().lower()
        people_search = (request.query_params.get('people_search') or '').strip()
        skill_search = (request.query_params.get('skill_search') or '').strip()
        people_ids = self._parse_int_list(request.query_params.get('people_ids'))
        skill_tag_ids = self._parse_int_list(request.query_params.get('skill_tag_ids'))
        vertical_param = request.query_params.get('vertical')
        vertical_filter = None
        if vertical_param not in (None, ''):
            try:
                vertical_filter = int(vertical_param)
            except Exception:
                vertical_filter = None
        enforced_vertical = get_request_enforced_vertical_id(request)
        if enforced_vertical is not None:
            vertical_filter = enforced_vertical
        department_param = request.query_params.get('department')
        department_scope_ids = None
        if department_param not in (None, ''):
            try:
                department_id = int(department_param)
                department_scope_ids = (
                    get_descendant_department_ids(department_id) if include_children else [department_id]
                )
            except Exception:
                department_scope_ids = None

        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = None
        scope_version = request_scope_version(request)
        if use_cache:
            try:
                cache_key = build_aggregate_cache_key(
                    'ui.skills_page',
                    request,
                    filters={
                        'include': include_tokens or [],
                        'vertical': vertical_filter if vertical_filter is not None else 'all',
                        'include_inactive': 1 if include_inactive else 0,
                        'department': request.query_params.get('department') or 'all',
                        'include_children': 1 if include_children else 0,
                        'include_global': 1 if include_global else 0,
                        'scope': scope or 'all',
                        'people_search': people_search,
                        'skill_search': skill_search,
                        'people_ids': ','.join(str(v) for v in people_ids),
                        'skill_tag_ids': ','.join(str(v) for v in skill_tag_ids),
                        'people_page': request.query_params.get('people_page') or '1',
                        'people_page_size': request.query_params.get('people_page_size') or '100',
                        'skill_tags_page': request.query_params.get('skill_tags_page') or '1',
                        'skill_tags_page_size': request.query_params.get('skill_tags_page_size') or '100',
                        'person_skills_page': request.query_params.get('person_skills_page') or '1',
                        'person_skills_page_size': request.query_params.get('person_skills_page_size') or '100',
                        'scope_version': scope_version,
                    },
                )
                cached = cache.get(cache_key)
                if cached is not None:
                    return Response(cached)
            except Exception:
                cache_key = None

        include_set = set(include_tokens or [])
        payload = {
            'contractVersion': 1,
            'included': include_tokens or [],
        }

        if 'departments' in include_set:
            departments_qs = Department.objects.select_related('manager').order_by('name')
            if not include_inactive:
                departments_qs = departments_qs.filter(is_active=True)
            if vertical_filter is not None:
                departments_qs = departments_qs.filter(vertical_id=vertical_filter)
            if department_scope_ids is not None:
                departments_qs = departments_qs.filter(id__in=department_scope_ids)
            payload['departments'] = DepartmentSerializer(departments_qs, many=True).data

        if 'people' in include_set:
            people_qs = (
                Person.objects
                .select_related('department', 'department__vertical', 'role')
                .only(
                    'id', 'name', 'weekly_capacity', 'role', 'department', 'location', 'notes',
                    'created_at', 'updated_at', 'department__name', 'department__vertical_id',
                    'department__vertical__name', 'role__name', 'is_active', 'hire_date',
                )
                .order_by('name', 'id')
            )
            if not include_inactive:
                people_qs = people_qs.filter(is_active=True)
            if vertical_filter is not None:
                people_qs = people_qs.filter(department__vertical_id=vertical_filter)
            if department_scope_ids is not None:
                people_qs = people_qs.filter(department_id__in=department_scope_ids)
            if people_ids:
                people_qs = people_qs.filter(id__in=people_ids)
            if people_search:
                people_qs = people_qs.filter(
                    Q(name__icontains=people_search)
                    | Q(location__icontains=people_search)
                    | Q(role__name__icontains=people_search)
                    | Q(department__name__icontains=people_search)
                )
            people_page = self._paginate(
                people_qs,
                request=request,
                page_key='people_page',
                page_size_key='people_page_size',
            )
            payload['people'] = {
                'count': people_page['count'],
                'next': people_page['next'],
                'previous': people_page['previous'],
                'results': PersonSerializer(people_page['results'], many=True).data,
            }

        if 'skill_tags' in include_set:
            skill_tags_qs = SkillTag.objects.filter(is_active=True).select_related('department').order_by('name')
            if vertical_filter is not None and scope != 'global':
                skill_tags_qs = skill_tags_qs.filter(
                    Q(department__vertical_id=vertical_filter) | Q(department__isnull=True)
                )
            if scope == 'global':
                skill_tags_qs = skill_tags_qs.filter(department__isnull=True)
            elif scope == 'department':
                skill_tags_qs = skill_tags_qs.filter(department__isnull=False)
            if department_scope_ids is not None and scope != 'global':
                scope_q = Q(department_id__in=department_scope_ids)
                if include_global and scope != 'department':
                    scope_q |= Q(department__isnull=True)
                skill_tags_qs = skill_tags_qs.filter(scope_q)
            elif scope not in ('global', 'department') and not include_global:
                skill_tags_qs = skill_tags_qs.filter(department__isnull=False)
            if skill_tag_ids:
                skill_tags_qs = skill_tags_qs.filter(id__in=skill_tag_ids)
            if skill_search:
                skill_tags_qs = skill_tags_qs.filter(
                    Q(name__icontains=skill_search) | Q(category__icontains=skill_search)
                )
            skill_tags_page = self._paginate(
                skill_tags_qs,
                request=request,
                page_key='skill_tags_page',
                page_size_key='skill_tags_page_size',
            )
            payload['skillTags'] = {
                'count': skill_tags_page['count'],
                'next': skill_tags_page['next'],
                'previous': skill_tags_page['previous'],
                'results': SkillTagSerializer(skill_tags_page['results'], many=True).data,
            }

        if 'person_skills' in include_set:
            person_skills_qs = PersonSkill.objects.select_related('person', 'skill_tag').order_by('skill_type', 'skill_tag__name', 'id')
            if vertical_filter is not None:
                person_skills_qs = person_skills_qs.filter(person__department__vertical_id=vertical_filter)
            if department_scope_ids is not None:
                person_skills_qs = person_skills_qs.filter(person__department_id__in=department_scope_ids)
            if people_ids:
                person_skills_qs = person_skills_qs.filter(person_id__in=people_ids)
            if skill_tag_ids:
                person_skills_qs = person_skills_qs.filter(skill_tag_id__in=skill_tag_ids)
            if people_search:
                person_skills_qs = person_skills_qs.filter(person__name__icontains=people_search)
            if skill_search:
                person_skills_qs = person_skills_qs.filter(skill_tag__name__icontains=skill_search)
            person_skills_page = self._paginate(
                person_skills_qs,
                request=request,
                page_key='person_skills_page',
                page_size_key='person_skills_page_size',
            )
            payload['personSkills'] = {
                'count': person_skills_page['count'],
                'next': person_skills_page['next'],
                'previous': person_skills_page['previous'],
                'results': PersonSkillSerializer(person_skills_page['results'], many=True).data,
            }

        payload = self._apply_payload_guardrails(payload)
        if use_cache and cache_key:
            try:
                cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
            except Exception:
                pass
        return Response(payload)


class SettingsPageSnapshotView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UiPageSnapshotThrottle]
    _SECTIONS = [
        {'id': 'role-management', 'title': 'Company Roles', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
        {'id': 'verticals', 'title': 'Company Verticals', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
        {'id': 'department-project-roles', 'title': 'Department Project Roles', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
        {'id': 'project-statuses', 'title': 'Project Status and Colors', 'requires_admin': True, 'allow_manager': True, 'integrations_only': False},
        {'id': 'project-templates', 'title': 'Project Manloader Template', 'requires_admin': True, 'allow_manager': True, 'integrations_only': False},
        {'id': 'pre-deliverables', 'title': 'Pre-Deliverables', 'requires_admin': True, 'allow_manager': True, 'integrations_only': False},
        {'id': 'push-notifications', 'title': 'Notifications', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
        {'id': 'project-task-templates', 'title': 'Project Task Templates', 'requires_admin': True, 'allow_manager': True, 'integrations_only': False},
        {'id': 'calendar-feeds', 'title': 'Calendar Feeds', 'requires_admin': False, 'allow_manager': False, 'integrations_only': False},
        {'id': 'admin-users', 'title': 'Create User & Admin Users', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
        {'id': 'utilization-scheme', 'title': 'Utilization Hours and Color Scheme', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
        {'id': 'network-graph-settings', 'title': 'Network Graph Analytics', 'requires_admin': True, 'allow_manager': True, 'integrations_only': False},
        {'id': 'deliverable-phase-mapping', 'title': 'Deliverable Phase Mapping', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
        {'id': 'backup-restore', 'title': 'Backup & Restore', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
        {'id': 'integrations', 'title': 'Integrations Hub', 'requires_admin': True, 'allow_manager': False, 'integrations_only': True},
        {'id': 'admin-audit-log', 'title': 'Admin Audit Log', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
        {'id': 'project-audit-log', 'title': 'Project Audit Log', 'requires_admin': True, 'allow_manager': True, 'integrations_only': False},
        {'id': 'general-settings', 'title': 'General', 'requires_admin': True, 'allow_manager': False, 'integrations_only': False},
    ]

    def _visible_sections(self, request):
        user = getattr(request, 'user', None)
        is_admin = is_admin_user(user)
        is_manager = is_manager_user(user)
        integrations_enabled = bool(getattr(settings, 'INTEGRATIONS_ENABLED', False))
        visible = []
        for section in self._SECTIONS:
            if section['requires_admin'] and not is_admin and not (section['allow_manager'] and is_manager):
                continue
            if section['integrations_only'] and not integrations_enabled:
                continue
            visible.append(section)
        return visible

    def _build_section_data(self, section_id: str):
        if section_id == 'department-project-roles':
            departments = DepartmentSerializer(
                Department.objects.filter(is_active=True).select_related('manager').order_by('name'),
                many=True,
            ).data
            return {'departments': departments}
        if section_id == 'role-management':
            return {'roles': RoleSerializer(Role.objects.filter(is_active=True).order_by('sort_order', 'name', 'id'), many=True).data}
        if section_id == 'project-statuses':
            rows = ProjectStatusDefinition.objects.all().order_by('sort_order', 'label', 'key')
            return {'projectStatuses': ProjectStatusDefinitionSerializer(rows, many=True).data}
        if section_id == 'verticals':
            return {'verticals': VerticalSerializer(Vertical.objects.order_by('name'), many=True).data}
        if section_id == 'utilization-scheme':
            try:
                return {'utilizationScheme': UtilizationSchemeSerializer(UtilizationScheme.get_active()).data}
            except Exception:
                return {'utilizationScheme': None}
        if section_id == 'network-graph-settings':
            try:
                return {'networkGraphSettings': NetworkGraphSettingsSerializer(NetworkGraphSettings.get_active()).data}
            except Exception:
                return {'networkGraphSettings': None}
        if section_id == 'push-notifications':
            try:
                return {
                    'webPushSettings': WebPushGlobalSettingsSerializer(WebPushGlobalSettings.get_active()).data,
                    'webPushVapidKeys': web_push_vapid_status(),
                }
            except Exception:
                return {'webPushSettings': None, 'webPushVapidKeys': None}
        if section_id == 'integrations':
            return {'integrations': {'enabled': bool(getattr(settings, 'INTEGRATIONS_ENABLED', False))}}
        return {}

    @extend_schema(
        parameters=[
            OpenApiParameter(name='section', type=str, required=False, description='Optional visible section id to include scoped sectionData'),
        ],
    )
    def get(self, request):
        if not settings.FEATURES.get('FF_PEOPLE_SKILLS_SETTINGS_SNAPSHOTS', True):
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        section_id = (request.query_params.get('section') or '').strip()
        all_sections = {item['id'] for item in self._SECTIONS}
        if section_id and section_id not in all_sections:
            return Response({'error': 'invalid section'}, status=status.HTTP_400_BAD_REQUEST)

        visible_sections = self._visible_sections(request)
        visible_ids = [item['id'] for item in visible_sections]
        if section_id and section_id not in visible_ids:
            return Response(
                {'detail': 'forbidden', 'code': 'forbidden', 'contractVersion': 1},
                status=status.HTTP_403_FORBIDDEN,
            )

        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = None
        if use_cache:
            try:
                cache_key = build_aggregate_cache_key(
                    'ui.settings_page',
                    request,
                    filters={
                        'section': section_id or 'none',
                        'visible': visible_ids,
                    },
                )
                cached = cache.get(cache_key)
                if cached is not None:
                    return Response(cached)
            except Exception:
                cache_key = None

        payload = {
            'contractVersion': 1,
            'capabilities': _build_capabilities_payload(),
            'visibleSections': visible_ids,
            'visibleSectionMeta': [{'id': item['id'], 'title': item['title']} for item in visible_sections],
        }
        if section_id:
            payload['sectionData'] = {section_id: self._build_section_data(section_id)}

        if use_cache and cache_key:
            try:
                cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
            except Exception:
                pass
        return Response(payload)


class PreDeliverableGlobalSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(responses=PreDeliverableGlobalSettingsItemSerializer(many=True))
    def get(self, request):
        items = []
        # Join types and global settings
        types = PreDeliverableType.objects.all().order_by('sort_order', 'name')
        settings_map = {g.pre_deliverable_type_id: g for g in PreDeliverableGlobalSettings.objects.all()}
        for t in types:
            g = settings_map.get(t.id)
            items.append({
                'typeId': t.id,
                'typeName': t.name,
                'defaultDaysBefore': g.default_days_before if g else t.default_days_before,
                'isEnabledByDefault': g.is_enabled_by_default if g else t.is_active,
                'sortOrder': t.sort_order,
                'isActive': t.is_active,
            })
        return Response(items)

    @extend_schema(
        request=inline_serializer(name='GlobalSettingsUpdate', fields={'settings': PreDeliverableGlobalSettingsUpdateSerializer(many=True)}),
        responses=PreDeliverableGlobalSettingsItemSerializer(many=True),
    )
    def put(self, request):
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        payload = request.data or {}
        weeks_count = None
        if 'weeksCount' in payload:
            weeks_count, weeks_err = self._coerce_weeks_count(payload.get('weeksCount'))
            if weeks_err:
                return Response({'error': weeks_err}, status=400)
        settings = payload.get('settings') or []
        if not isinstance(settings, list):
            return Response({'error': 'settings must be a list'}, status=400)
        for item in settings:
            try:
                type_id = int(item.get('typeId'))
                days = int(item.get('defaultDaysBefore'))
                enabled = bool(item.get('isEnabledByDefault'))
            except Exception:
                return Response({'error': 'invalid setting entry'}, status=400)
            if days < 0:
                return Response({'error': 'defaultDaysBefore must be >= 0'}, status=400)
            t = PreDeliverableType.objects.filter(id=type_id).first()
            if not t:
                return Response({'error': f'unknown typeId {type_id}'}, status=400)
            obj, _ = PreDeliverableGlobalSettings.objects.get_or_create(pre_deliverable_type=t)
            obj.default_days_before = days
            obj.is_enabled_by_default = enabled
            obj.save(update_fields=['default_days_before', 'is_enabled_by_default', 'updated_at'])
        return self.get(request)


class AutoHoursRoleSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]
    MAX_WEEKS_BEFORE = AUTO_HOURS_MAX_WEEKS_BEFORE

    def _coerce_weeks_count(self, value) -> tuple[int | None, str | None]:
        try:
            count = int(value)
        except Exception:
            return None, 'weeksCount must be an integer'
        if count < 0 or count > (self.MAX_WEEKS_BEFORE + 1):
            return None, f'weeksCount must be between 0 and {self.MAX_WEEKS_BEFORE + 1}'
        return count, None

    def _get_weeks_count(self, phase: str | None) -> int:
        if not phase:
            return self.MAX_WEEKS_BEFORE + 1
        settings = AutoHoursGlobalSettings.get_active()
        raw = (settings.weeks_by_phase or {}).get(phase)
        try:
            return int(raw)
        except Exception:
            return AUTO_HOURS_DEFAULT_WEEKS_COUNT

    def _set_weeks_count(self, phase: str | None, count: int) -> None:
        if not phase:
            return
        settings = AutoHoursGlobalSettings.get_active()
        weeks_by_phase = settings.weeks_by_phase or {}
        weeks_by_phase[str(phase).strip().lower()] = int(count)
        settings.weeks_by_phase = weeks_by_phase
        settings.save(update_fields=['weeks_by_phase', 'updated_at'])

    def _empty_hours_by_week(self) -> dict:
        return {str(i): 0 for i in range(self.MAX_WEEKS_BEFORE + 1)}

    def _normalize_hours_by_week(self, raw) -> tuple[dict, str | None]:
        if raw is None:
            return self._empty_hours_by_week(), None

        normalized = self._empty_hours_by_week()
        if isinstance(raw, list):
            for idx, value in enumerate(raw):
                if idx > self.MAX_WEEKS_BEFORE:
                    continue
                try:
                    hours = Decimal(str(value))
                except Exception:
                    return {}, f'invalid percent value at index {idx}'
                if hours < 0 or hours > 100:
                    return {}, 'percentPerWeek must be between 0 and 100'
                normalized[str(idx)] = float(hours)
            return normalized, None

        if isinstance(raw, dict):
            for key, value in raw.items():
                try:
                    week = int(key)
                except Exception:
                    return {}, f'invalid week key {key}'
                if week < 0 or week > self.MAX_WEEKS_BEFORE:
                    return {}, f'weeksBefore must be between 0 and {self.MAX_WEEKS_BEFORE}'
                try:
                    hours = Decimal(str(value))
                except Exception:
                    return {}, f'invalid percent value for week {week}'
                if hours < 0 or hours > 100:
                    return {}, 'percentPerWeek must be between 0 and 100'
                normalized[str(week)] = float(hours)
            return normalized, None

        return {}, 'percentByWeek must be a list or object'

    def _parse_phase(self, request) -> tuple[str | None, str | None]:
        phase = request.query_params.get('phase')
        if not phase:
            return None, None
        norm = str(phase).strip().lower()
        valid = set(DeliverablePhaseDefinition.objects.values_list('key', flat=True))
        if norm in valid:
            return norm, None
        return None, 'phase must match an existing phase mapping'

    def _parse_phases(self, request) -> tuple[list[str] | None, str | None]:
        raw = request.query_params.get('phases')
        if not raw:
            return None, None
        if request.query_params.get('phase'):
            return None, 'phase and phases cannot be combined'
        tokens = []
        for token in str(raw).split(','):
            norm = str(token).strip().lower()
            if not norm:
                continue
            if norm not in tokens:
                tokens.append(norm)
        if not tokens:
            return None, 'phases must include at least one phase'
        valid = list(DeliverablePhaseDefinition.objects.order_by('sort_order', 'id').values_list('key', flat=True))
        valid_set = set(valid)
        invalid = [p for p in tokens if p not in valid_set]
        if invalid:
            return None, 'phases must match existing phase mappings'
        ordered = [p for p in valid if p in set(tokens)]
        return ordered, None

    def _build_settings_items(self, phase: str | None, dept_id_int: int | None, weeks_count: int):
        roles_qs = DepartmentProjectRole.objects.select_related('department')
        if dept_id_int is not None:
            roles_qs = roles_qs.filter(department_id=dept_id_int)
        roles = list(roles_qs.order_by('department_id', 'sort_order', 'name'))
        role_ids = [r.id for r in roles]
        settings_map = {
            s.role_id: s
            for s in AutoHoursRoleSetting.objects.filter(role_id__in=role_ids).prefetch_related('people_roles')
        }
        items = []
        for role in roles:
            setting = settings_map.get(role.id)
            hours_by_week = self._empty_hours_by_week()
            if setting:
                raw = None
                if phase:
                    raw_phase = (setting.ramp_percent_by_phase or {}).get(phase)
                    if isinstance(raw_phase, dict) or isinstance(raw_phase, list):
                        raw = raw_phase
                if raw is None:
                    raw = setting.ramp_percent_by_week or {}
                if isinstance(raw, dict):
                    for key, value in raw.items():
                        if str(key) in hours_by_week:
                            try:
                                hours_by_week[str(int(key))] = float(Decimal(str(value)))
                            except Exception:
                                pass
                if not raw:
                    try:
                        hours_by_week['0'] = float(setting.standard_percent_of_capacity)
                    except Exception:
                        pass
            role_count = 1
            if setting and phase:
                try:
                    count_raw = (setting.role_count_by_phase or {}).get(phase)
                    if count_raw is not None:
                        role_count = max(0, int(count_raw))
                except Exception:
                    role_count = 1
            people_role_ids: list[int] = []
            if setting:
                try:
                    people_role_ids = sorted(int(rid) for rid in setting.people_roles.values_list('id', flat=True))
                except Exception:
                    people_role_ids = []
            items.append({
                'roleId': role.id,
                'roleName': role.name,
                'departmentId': role.department_id,
                'departmentName': getattr(role.department, 'name', ''),
                'percentByWeek': hours_by_week,
                'roleCount': role_count,
                'peopleRoleIds': people_role_ids,
                'weeksCount': weeks_count,
                'isActive': role.is_active,
                'sortOrder': role.sort_order,
            })
        return items

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursRoleSettingsResponse',
            fields={
                'settings': inline_serializer(
                    name='AutoHoursRoleSettingItem',
                    fields={
                        'roleId': serializers.IntegerField(),
                        'roleName': serializers.CharField(),
                        'departmentId': serializers.IntegerField(),
                        'departmentName': serializers.CharField(),
                        'percentByWeek': serializers.DictField(child=serializers.FloatField()),
                        'roleCount': serializers.IntegerField(),
                        'peopleRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                        'weeksCount': serializers.IntegerField(),
                        'isActive': serializers.BooleanField(),
                        'sortOrder': serializers.IntegerField(),
                    },
                    many=True,
                ),
                'weekLimits': inline_serializer(
                    name='AutoHoursWeekLimits',
                    fields={
                        'maxWeeksCount': serializers.IntegerField(),
                        'defaultWeeksCount': serializers.IntegerField(),
                    },
                ),
            },
        ),
    )
    def get(self, request):
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        phases, phases_err = self._parse_phases(request)
        if phases_err:
            return Response({'error': phases_err}, status=400)
        weeks_count = self._get_weeks_count(phase)
        dept_id = request.query_params.get('department_id')
        dept_id_int = None
        if dept_id:
            try:
                dept_id_int = int(dept_id)
            except Exception:
                return Response({'error': 'department_id must be an integer'}, status=400)
        if phases:
            settings_by_phase = {}
            week_limits_by_phase = {}
            for phase_key in phases:
                phase_weeks_count = self._get_weeks_count(phase_key)
                settings_by_phase[phase_key] = self._build_settings_items(phase_key, dept_id_int, phase_weeks_count)
                week_limits_by_phase[phase_key] = {
                    'maxWeeksCount': AUTO_HOURS_MAX_WEEKS_COUNT,
                    'defaultWeeksCount': AUTO_HOURS_DEFAULT_WEEKS_COUNT,
                    'weeksCount': phase_weeks_count,
                }
            return Response({
                'settingsByPhase': settings_by_phase,
                'weekLimitsByPhase': week_limits_by_phase,
                'weekLimits': {
                    'maxWeeksCount': AUTO_HOURS_MAX_WEEKS_COUNT,
                    'defaultWeeksCount': AUTO_HOURS_DEFAULT_WEEKS_COUNT,
                },
            })

        items = self._build_settings_items(phase, dept_id_int, weeks_count)
        return Response({
            'settings': items,
            'weekLimits': {
                'maxWeeksCount': AUTO_HOURS_MAX_WEEKS_COUNT,
                'defaultWeeksCount': AUTO_HOURS_DEFAULT_WEEKS_COUNT,
            },
        })

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursRoleSettingsUpdate',
            fields={
                'weeksCount': serializers.IntegerField(required=False),
                'settings': inline_serializer(
                    name='AutoHoursRoleSettingUpdateItem',
                    fields={
                        'roleId': serializers.IntegerField(),
                        'percentByWeek': serializers.DictField(child=serializers.FloatField(), required=False),
                        'percentPerWeek': serializers.FloatField(required=False),
                        'roleCount': serializers.IntegerField(required=False),
                        'peopleRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                    },
                    many=True,
                ),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursRoleSettingItemResponse',
            fields={
                'settings': inline_serializer(
                    name='AutoHoursRoleSettingItemResponseItem',
                    fields={
                        'roleId': serializers.IntegerField(),
                        'roleName': serializers.CharField(),
                        'departmentId': serializers.IntegerField(),
                        'departmentName': serializers.CharField(),
                        'percentByWeek': serializers.DictField(child=serializers.FloatField()),
                        'roleCount': serializers.IntegerField(),
                        'peopleRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                        'weeksCount': serializers.IntegerField(),
                        'isActive': serializers.BooleanField(),
                        'sortOrder': serializers.IntegerField(),
                    },
                    many=True,
                ),
                'weekLimits': inline_serializer(
                    name='AutoHoursWeekLimitsResponse',
                    fields={
                        'maxWeeksCount': serializers.IntegerField(),
                        'defaultWeeksCount': serializers.IntegerField(),
                    },
                ),
            },
        ),
    )
    def put(self, request):
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        payload = request.data or {}
        weeks_count = None
        if 'weeksCount' in payload:
            weeks_count, weeks_err = self._coerce_weeks_count(payload.get('weeksCount'))
            if weeks_err:
                return Response({'error': weeks_err}, status=400)
        settings = payload.get('settings') or []
        if not isinstance(settings, list):
            return Response({'error': 'settings must be a list'}, status=400)

        dept_id = request.query_params.get('department_id')
        dept_id_int = None
        if dept_id:
            try:
                dept_id_int = int(dept_id)
            except Exception:
                return Response({'error': 'department_id must be an integer'}, status=400)

        updates: list[tuple[int, dict, int | None, list[int] | None]] = []
        role_ids: list[int] = []
        all_people_role_ids: set[int] = set()
        for item in settings:
            try:
                role_id = int(item.get('roleId'))
            except Exception:
                return Response({'error': 'invalid roleId'}, status=400)
            hours_by_week_raw = item.get('percentByWeek')
            hours_by_week, err = self._normalize_hours_by_week(hours_by_week_raw)
            if err:
                return Response({'error': err}, status=400)
            if hours_by_week_raw is None and item.get('percentPerWeek') is not None:
                try:
                    hours = Decimal(str(item.get('percentPerWeek')))
                except Exception:
                    return Response({'error': f'invalid percentPerWeek for roleId {role_id}'}, status=400)
                if hours < 0 or hours > 100:
                    return Response({'error': 'percentPerWeek must be between 0 and 100'}, status=400)
                hours_by_week['0'] = float(hours)
            role_count = None
            if 'roleCount' in item:
                try:
                    role_count = int(item.get('roleCount'))
                except Exception:
                    return Response({'error': f'invalid roleCount for roleId {role_id}'}, status=400)
                if role_count < 0:
                    return Response({'error': 'roleCount must be >= 0'}, status=400)
            people_role_ids: list[int] | None = None
            if 'peopleRoleIds' in item:
                raw_people_role_ids = item.get('peopleRoleIds')
                if raw_people_role_ids is None:
                    people_role_ids = []
                elif not isinstance(raw_people_role_ids, list):
                    return Response({'error': f'peopleRoleIds must be a list for roleId {role_id}'}, status=400)
                else:
                    try:
                        people_role_ids = sorted({int(rid) for rid in raw_people_role_ids})
                    except Exception:
                        return Response({'error': f'invalid peopleRoleIds for roleId {role_id}'}, status=400)
                    all_people_role_ids.update(people_role_ids)
            updates.append((role_id, hours_by_week, role_count, people_role_ids))
            role_ids.append(role_id)

        if role_ids:
            existing_qs = DepartmentProjectRole.objects.filter(id__in=role_ids)
            if dept_id_int is not None:
                existing_qs = existing_qs.filter(department_id=dept_id_int)
            existing = set(existing_qs.values_list('id', flat=True))
            missing = [rid for rid in role_ids if rid not in existing]
            if missing:
                return Response({'error': f'unknown roleId(s): {missing}'}, status=400)

        if all_people_role_ids:
            existing_people_roles = set(Role.objects.filter(id__in=all_people_role_ids).values_list('id', flat=True))
            missing_people_roles = sorted(rid for rid in all_people_role_ids if rid not in existing_people_roles)
            if missing_people_roles:
                return Response({'error': f'unknown peopleRoleIds: {missing_people_roles}'}, status=400)

        if weeks_count is not None:
            self._set_weeks_count(phase, weeks_count)

        with transaction.atomic():
            for role_id, hours_by_week, role_count, people_role_ids in updates:
                obj, _ = AutoHoursRoleSetting.objects.get_or_create(role_id=role_id)
                try:
                    obj.standard_percent_of_capacity = Decimal(str(hours_by_week.get('0', 0)))
                except Exception:
                    obj.standard_percent_of_capacity = 0
                if phase:
                    by_phase = obj.ramp_percent_by_phase or {}
                    by_phase[phase] = hours_by_week
                    obj.ramp_percent_by_phase = by_phase
                    if role_count is not None:
                        count_by_phase = obj.role_count_by_phase or {}
                        count_by_phase[phase] = int(role_count)
                        obj.role_count_by_phase = count_by_phase
                        obj.save(update_fields=['standard_percent_of_capacity', 'ramp_percent_by_phase', 'role_count_by_phase', 'updated_at'])
                    else:
                        obj.save(update_fields=['standard_percent_of_capacity', 'ramp_percent_by_phase', 'updated_at'])
                else:
                    obj.ramp_percent_by_week = hours_by_week
                    obj.save(update_fields=['standard_percent_of_capacity', 'ramp_percent_by_week', 'updated_at'])
                if people_role_ids is not None:
                    obj.people_roles.set(people_role_ids)

        _bump_analytics_cache_version()
        return self.get(request)


class AutoHoursTemplatesView(APIView):
    permission_classes = [IsAuthenticated]

    def _parse_exclusions(self, data) -> tuple[list[int] | None, list[int] | None, str | None]:
        excluded_roles = None
        excluded_departments = None
        if 'excludedRoleIds' in data:
            raw = data.get('excludedRoleIds')
            if raw is None:
                excluded_roles = []
            elif not isinstance(raw, list):
                return None, None, 'excludedRoleIds must be a list'
            else:
                try:
                    excluded_roles = sorted({int(x) for x in raw})
                except Exception:
                    return None, None, 'excludedRoleIds must be a list of integers'
                existing = set(DepartmentProjectRole.objects.filter(id__in=excluded_roles).values_list('id', flat=True))
                missing = [rid for rid in excluded_roles if rid not in existing]
                if missing:
                    return None, None, f'unknown roleId(s): {missing}'
        if 'excludedDepartmentIds' in data:
            raw = data.get('excludedDepartmentIds')
            if raw is None:
                excluded_departments = []
            elif not isinstance(raw, list):
                return None, None, 'excludedDepartmentIds must be a list'
            else:
                try:
                    excluded_departments = sorted({int(x) for x in raw})
                except Exception:
                    return None, None, 'excludedDepartmentIds must be a list of integers'
                existing = set(Department.objects.filter(id__in=excluded_departments).values_list('id', flat=True))
                missing = [did for did in excluded_departments if did not in existing]
                if missing:
                    return None, None, f'unknown departmentId(s): {missing}'
        return excluded_roles, excluded_departments, None

    def _valid_phase_keys(self) -> list[str]:
        return list(DeliverablePhaseDefinition.objects.order_by('sort_order', 'id').values_list('key', flat=True))

    def _normalize_weeks_by_phase(self, data) -> tuple[dict[str, int] | None, str | None]:
        if 'weeksByPhase' not in data:
            return None, None
        raw = data.get('weeksByPhase')
        if raw is None:
            return {}, None
        if not isinstance(raw, dict):
            return None, 'weeksByPhase must be an object'
        valid = set(self._valid_phase_keys())
        normalized: dict[str, int] = {}
        for key, value in raw.items():
            phase = str(key).strip().lower()
            if phase not in valid:
                return None, 'weeksByPhase must match existing phase mappings'
            try:
                count = int(value)
            except Exception:
                return None, f'weeksByPhase[{phase}] must be an integer'
            if count < 0 or count > AUTO_HOURS_MAX_WEEKS_COUNT:
                return None, f'weeksByPhase[{phase}] must be between 0 and {AUTO_HOURS_MAX_WEEKS_COUNT}'
            normalized[phase] = count
        return normalized, None

    def _weeks_by_phase_response(self, template: AutoHoursTemplate) -> dict[str, int]:
        valid = self._valid_phase_keys()
        raw = template.weeks_by_phase or {}
        return {phase: int(raw.get(phase, AUTO_HOURS_DEFAULT_WEEKS_COUNT)) for phase in valid}

    def _parse_phase_keys(self, data) -> tuple[list[str] | None, str | None]:
        if 'phaseKeys' not in data:
            return None, None
        raw = data.get('phaseKeys')
        if raw is None:
            return None, 'phaseKeys must include at least one phase'
        if not isinstance(raw, list):
            return None, 'phaseKeys must be a list'
        valid = self._valid_phase_keys()
        normalized: list[str] = []
        for item in raw:
            key = str(item).strip().lower()
            if key not in valid:
                return None, 'phaseKeys must match existing phase mappings'
            if key not in normalized:
                normalized.append(key)
        if not normalized:
            return None, 'phaseKeys must include at least one phase'
        ordered = [k for k in valid if k in normalized]
        return ordered, None

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursTemplateListItem',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'maxWeeksCount': serializers.IntegerField(),
                'defaultWeeksCount': serializers.IntegerField(),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
            many=True,
        ),
    )
    def get(self, request):
        items = []
        for t in AutoHoursTemplate.objects.all().prefetch_related('excluded_roles', 'excluded_departments').order_by('name'):
            excluded_role_ids = list(t.excluded_roles.values_list('id', flat=True))
            excluded_department_ids = list(t.excluded_departments.values_list('id', flat=True))
            items.append({
                'id': t.id,
                'name': t.name,
                'description': t.description or '',
                'excludedRoleIds': excluded_role_ids,
                'excludedDepartmentIds': excluded_department_ids,
                'isActive': t.is_active,
                'phaseKeys': t.phase_keys or [],
                'weeksByPhase': self._weeks_by_phase_response(t),
                'maxWeeksCount': AUTO_HOURS_MAX_WEEKS_COUNT,
                'defaultWeeksCount': AUTO_HOURS_DEFAULT_WEEKS_COUNT,
                'createdAt': t.created_at,
                'updatedAt': t.updated_at,
            })
        return Response(items)

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateCreate',
            fields={
                'name': serializers.CharField(),
                'description': serializers.CharField(required=False),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'isActive': serializers.BooleanField(required=False),
                'phaseKeys': serializers.ListField(child=serializers.CharField(), required=False),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField(), required=False),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateCreateResponse',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'maxWeeksCount': serializers.IntegerField(),
                'defaultWeeksCount': serializers.IntegerField(),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def post(self, request):
        if not (is_admin_user(request.user) or is_manager_user(request.user)):
            return Response({'detail': IsAdminOrManager.message}, status=status.HTTP_403_FORBIDDEN)
        name = (request.data or {}).get('name') or ''
        name = str(name).strip()
        if not name:
            return Response({'error': 'name is required'}, status=400)
        if AutoHoursTemplate.objects.filter(name__iexact=name).exists():
            return Response({'error': 'template name already exists'}, status=400)
        data = request.data or {}
        description = str(data.get('description') or '').strip()
        is_active = bool(data.get('isActive', True))
        excluded_roles, excluded_departments, excl_err = self._parse_exclusions(data)
        if excl_err:
            return Response({'error': excl_err}, status=400)
        phase_keys, phase_err = self._parse_phase_keys(data)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        weeks_by_phase, weeks_err = self._normalize_weeks_by_phase(data)
        if weeks_err:
            return Response({'error': weeks_err}, status=400)
        obj = AutoHoursTemplate.objects.create(
            name=name,
            description=description,
            is_active=is_active,
            phase_keys=phase_keys if phase_keys is not None else self._valid_phase_keys(),
            weeks_by_phase=weeks_by_phase or {},
        )
        if excluded_roles is not None:
            obj.excluded_roles.set(excluded_roles)
        if excluded_departments is not None:
            obj.excluded_departments.set(excluded_departments)
        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'maxWeeksCount': AUTO_HOURS_MAX_WEEKS_COUNT,
            'defaultWeeksCount': AUTO_HOURS_DEFAULT_WEEKS_COUNT,
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        }, status=201)


class AutoHoursTemplateDetailView(AutoHoursTemplatesView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def _parse_phase_keys(self, data) -> tuple[list[str] | None, str | None]:
        if 'phaseKeys' not in data:
            return None, None
        raw = data.get('phaseKeys')
        if raw is None:
            return None, 'phaseKeys must include at least one phase'
        if not isinstance(raw, list):
            return None, 'phaseKeys must be a list'
        valid = list(DeliverablePhaseDefinition.objects.order_by('sort_order', 'id').values_list('key', flat=True))
        normalized: list[str] = []
        for item in raw:
            key = str(item).strip().lower()
            if key not in valid:
                return None, 'phaseKeys must match existing phase mappings'
            if key not in normalized:
                normalized.append(key)
        if not normalized:
            return None, 'phaseKeys must include at least one phase'
        ordered = [k for k in valid if k in normalized]
        return ordered, None

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursTemplateDetail',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'maxWeeksCount': serializers.IntegerField(),
                'defaultWeeksCount': serializers.IntegerField(),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def get(self, request, template_id: int):
        obj = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not obj:
            return Response({'error': 'template not found'}, status=404)
        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'maxWeeksCount': AUTO_HOURS_MAX_WEEKS_COUNT,
            'defaultWeeksCount': AUTO_HOURS_DEFAULT_WEEKS_COUNT,
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        })

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateUpdate',
            fields={
                'name': serializers.CharField(required=False),
                'description': serializers.CharField(required=False),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'isActive': serializers.BooleanField(required=False),
                'phaseKeys': serializers.ListField(child=serializers.CharField(), required=False),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField(), required=False),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateUpdateResponse',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'maxWeeksCount': serializers.IntegerField(),
                'defaultWeeksCount': serializers.IntegerField(),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def put(self, request, template_id: int):
        obj = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not obj:
            return Response({'error': 'template not found'}, status=404)
        data = request.data or {}
        if 'name' in data:
            name = str(data.get('name') or '').strip()
            if not name:
                return Response({'error': 'name is required'}, status=400)
            if AutoHoursTemplate.objects.filter(name__iexact=name).exclude(id=obj.id).exists():
                return Response({'error': 'template name already exists'}, status=400)
            obj.name = name
        if 'description' in data:
            obj.description = str(data.get('description') or '').strip()
        excluded_roles, excluded_departments, excl_err = self._parse_exclusions(data)
        if excl_err:
            return Response({'error': excl_err}, status=400)
        if 'isActive' in data:
            obj.is_active = bool(data.get('isActive'))
        phase_keys, phase_err = self._parse_phase_keys(data)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        weeks_by_phase, weeks_err = self._normalize_weeks_by_phase(data)
        if weeks_err:
            return Response({'error': weeks_err}, status=400)
        if phase_keys is not None:
            obj.phase_keys = phase_keys
        if weeks_by_phase is not None:
            next_weeks = obj.weeks_by_phase or {}
            next_weeks.update(weeks_by_phase)
            obj.weeks_by_phase = next_weeks
        obj.save(update_fields=['name', 'description', 'is_active', 'phase_keys', 'weeks_by_phase', 'updated_at'])
        if excluded_roles is not None:
            obj.excluded_roles.set(excluded_roles)
        if excluded_departments is not None:
            obj.excluded_departments.set(excluded_departments)
        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'maxWeeksCount': AUTO_HOURS_MAX_WEEKS_COUNT,
            'defaultWeeksCount': AUTO_HOURS_DEFAULT_WEEKS_COUNT,
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        })

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursTemplateDeleteResponse',
            fields={'detail': serializers.CharField()},
        ),
    )
    def delete(self, request, template_id: int):
        obj = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not obj:
            return Response({'error': 'template not found'}, status=404)
        if obj.projects.exists():
            return Response({'error': 'template is assigned to one or more projects'}, status=400)
        obj.delete()
        return Response({'detail': 'deleted'})


class AutoHoursTemplateDuplicateView(AutoHoursTemplatesView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateDuplicate',
            fields={
                'name': serializers.CharField(),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateDuplicateResponse',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'maxWeeksCount': serializers.IntegerField(),
                'defaultWeeksCount': serializers.IntegerField(),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def post(self, request, template_id: int):
        base = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not base:
            return Response({'error': 'template not found'}, status=404)
        name = str((request.data or {}).get('name') or '').strip()
        if not name:
            return Response({'error': 'name is required'}, status=400)
        if AutoHoursTemplate.objects.filter(name__iexact=name).exists():
            return Response({'error': 'template name already exists'}, status=400)

        with transaction.atomic():
            obj = AutoHoursTemplate.objects.create(
                name=name,
                description=base.description or '',
                is_active=base.is_active,
                phase_keys=base.phase_keys or [],
                weeks_by_phase=base.weeks_by_phase or {},
            )
            obj.excluded_roles.set(base.excluded_roles.all())
            obj.excluded_departments.set(base.excluded_departments.all())

            base_settings = list(
                AutoHoursTemplateRoleSetting.objects.filter(template_id=base.id).prefetch_related('people_roles')
            )
            for setting in base_settings:
                cloned = AutoHoursTemplateRoleSetting.objects.create(
                    template_id=obj.id,
                    role_id=setting.role_id,
                    ramp_percent_by_phase=setting.ramp_percent_by_phase or {},
                    role_count_by_phase=setting.role_count_by_phase or {},
                )
                cloned.people_roles.set(setting.people_roles.values_list('id', flat=True))

        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'maxWeeksCount': AUTO_HOURS_MAX_WEEKS_COUNT,
            'defaultWeeksCount': AUTO_HOURS_DEFAULT_WEEKS_COUNT,
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        })


class AutoHoursTemplateDuplicateDefaultView(AutoHoursTemplatesView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]
    MAX_WEEKS_BEFORE = AUTO_HOURS_MAX_WEEKS_BEFORE

    def _empty_hours_by_week(self) -> dict:
        return {str(i): 0 for i in range(self.MAX_WEEKS_BEFORE + 1)}

    def _resolve_hours_by_week(self, setting: AutoHoursRoleSetting | None, phase: str | None) -> dict:
        hours_by_week = self._empty_hours_by_week()
        if not setting:
            return hours_by_week
        raw = None
        if phase:
            raw_phase = (setting.ramp_percent_by_phase or {}).get(phase)
            if isinstance(raw_phase, dict) or isinstance(raw_phase, list):
                raw = raw_phase
        if raw is None:
            raw = setting.ramp_percent_by_week or {}
        if isinstance(raw, dict):
            for key, value in raw.items():
                if str(key) in hours_by_week:
                    try:
                        hours_by_week[str(int(key))] = float(Decimal(str(value)))
                    except Exception:  # nosec B110
                        pass
        if not raw:
            try:
                hours_by_week['0'] = float(setting.standard_percent_of_capacity)
            except Exception:  # nosec B110
                pass
        return hours_by_week

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateDuplicateDefault',
            fields={
                'name': serializers.CharField(),
                'description': serializers.CharField(required=False),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'isActive': serializers.BooleanField(required=False),
                'phaseKeys': serializers.ListField(child=serializers.CharField(), required=False),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateDuplicateDefaultResponse',
            fields={
                'id': serializers.IntegerField(),
                'name': serializers.CharField(),
                'description': serializers.CharField(),
                'excludedRoleIds': serializers.ListField(child=serializers.IntegerField()),
                'excludedDepartmentIds': serializers.ListField(child=serializers.IntegerField()),
                'isActive': serializers.BooleanField(),
                'phaseKeys': serializers.ListField(child=serializers.CharField()),
                'weeksByPhase': serializers.DictField(child=serializers.IntegerField()),
                'maxWeeksCount': serializers.IntegerField(),
                'defaultWeeksCount': serializers.IntegerField(),
                'createdAt': serializers.DateTimeField(),
                'updatedAt': serializers.DateTimeField(),
            },
        ),
    )
    def post(self, request):
        data = request.data or {}
        name = str(data.get('name') or '').strip()
        if not name:
            return Response({'error': 'name is required'}, status=400)
        if AutoHoursTemplate.objects.filter(name__iexact=name).exists():
            return Response({'error': 'template name already exists'}, status=400)
        description = str(data.get('description') or '').strip()
        is_active = bool(data.get('isActive', True))
        excluded_roles, excluded_departments, excl_err = self._parse_exclusions(data)
        if excl_err:
            return Response({'error': excl_err}, status=400)
        phase_keys, phase_err = self._parse_phase_keys(data)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        if phase_keys is None:
            phase_keys = self._valid_phase_keys()
        if not phase_keys:
            return Response({'error': 'phaseKeys must include at least one phase'}, status=400)

        excluded_role_set = set(excluded_roles or [])
        excluded_department_set = set(excluded_departments or [])

        roles = list(DepartmentProjectRole.objects.select_related('department').order_by('department_id', 'sort_order', 'name'))
        role_ids = [r.id for r in roles]
        settings_map = {
            s.role_id: s for s in AutoHoursRoleSetting.objects.filter(role_id__in=role_ids)
        }

        global_settings = AutoHoursGlobalSettings.get_active()
        with transaction.atomic():
            obj = AutoHoursTemplate.objects.create(
                name=name,
                description=description,
                is_active=is_active,
                phase_keys=phase_keys,
                weeks_by_phase=global_settings.weeks_by_phase or {},
            )
            if excluded_roles is not None:
                obj.excluded_roles.set(excluded_roles)
            if excluded_departments is not None:
                obj.excluded_departments.set(excluded_departments)

            new_settings = []
            for role in roles:
                if role.id in excluded_role_set or role.department_id in excluded_department_set:
                    continue
                setting = settings_map.get(role.id)
                by_phase = {}
                for phase in phase_keys:
                    by_phase[phase] = self._resolve_hours_by_week(setting, phase)
                new_settings.append(AutoHoursTemplateRoleSetting(
                    template_id=obj.id,
                    role_id=role.id,
                    ramp_percent_by_phase=by_phase,
                    role_count_by_phase={phase: 1 for phase in phase_keys},
                ))
            if new_settings:
                AutoHoursTemplateRoleSetting.objects.bulk_create(new_settings)

        return Response({
            'id': obj.id,
            'name': obj.name,
            'description': obj.description or '',
            'excludedRoleIds': list(obj.excluded_roles.values_list('id', flat=True)),
            'excludedDepartmentIds': list(obj.excluded_departments.values_list('id', flat=True)),
            'isActive': obj.is_active,
            'phaseKeys': obj.phase_keys or [],
            'weeksByPhase': self._weeks_by_phase_response(obj),
            'maxWeeksCount': AUTO_HOURS_MAX_WEEKS_COUNT,
            'defaultWeeksCount': AUTO_HOURS_DEFAULT_WEEKS_COUNT,
            'createdAt': obj.created_at,
            'updatedAt': obj.updated_at,
        })


class AutoHoursTemplateRoleSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]
    MAX_WEEKS_BEFORE = AUTO_HOURS_MAX_WEEKS_BEFORE

    def _coerce_weeks_count(self, value) -> tuple[int | None, str | None]:
        try:
            count = int(value)
        except Exception:
            return None, 'weeksCount must be an integer'
        if count < 0 or count > (self.MAX_WEEKS_BEFORE + 1):
            return None, f'weeksCount must be between 0 and {self.MAX_WEEKS_BEFORE + 1}'
        return count, None

    def _get_weeks_count(self, template: AutoHoursTemplate, phase: str) -> int:
        raw = (template.weeks_by_phase or {}).get(phase)
        try:
            return int(raw)
        except Exception:
            return AUTO_HOURS_DEFAULT_WEEKS_COUNT

    def _set_weeks_count(self, template: AutoHoursTemplate, phase: str, count: int) -> None:
        weeks_by_phase = template.weeks_by_phase or {}
        weeks_by_phase[str(phase).strip().lower()] = int(count)
        template.weeks_by_phase = weeks_by_phase
        template.save(update_fields=['weeks_by_phase', 'updated_at'])

    def _empty_hours_by_week(self) -> dict:
        return {str(i): 0 for i in range(self.MAX_WEEKS_BEFORE + 1)}

    def _normalize_hours_by_week(self, raw) -> tuple[dict, str | None]:
        if raw is None:
            return self._empty_hours_by_week(), None

        normalized = self._empty_hours_by_week()
        if isinstance(raw, list):
            for idx, value in enumerate(raw):
                if idx > self.MAX_WEEKS_BEFORE:
                    continue
                try:
                    hours = Decimal(str(value))
                except Exception:
                    return {}, f'invalid percent value at index {idx}'
                if hours < 0 or hours > 100:
                    return {}, 'percentPerWeek must be between 0 and 100'
                normalized[str(idx)] = float(hours)
            return normalized, None

        if isinstance(raw, dict):
            for key, value in raw.items():
                try:
                    week = int(key)
                except Exception:
                    return {}, f'invalid week key {key}'
                if week < 0 or week > self.MAX_WEEKS_BEFORE:
                    return {}, f'weeksBefore must be between 0 and {self.MAX_WEEKS_BEFORE}'
                try:
                    hours = Decimal(str(value))
                except Exception:
                    return {}, f'invalid percent value for week {week}'
                if hours < 0 or hours > 100:
                    return {}, 'percentPerWeek must be between 0 and 100'
                normalized[str(week)] = float(hours)
            return normalized, None

        return {}, 'percentByWeek must be a list or object'

    def _parse_phase(self, request) -> tuple[str | None, str | None]:
        phase = request.query_params.get('phase')
        if not phase:
            return None, 'phase is required'
        norm = str(phase).strip().lower()
        valid = set(DeliverablePhaseDefinition.objects.values_list('key', flat=True))
        if norm in valid:
            return norm, None
        return None, 'phase must match an existing phase mapping'

    @extend_schema(
        responses=inline_serializer(
            name='AutoHoursTemplateRoleSettingItem',
            fields={
                'roleId': serializers.IntegerField(),
                'roleName': serializers.CharField(),
                'departmentId': serializers.IntegerField(),
                'departmentName': serializers.CharField(),
                'percentByWeek': serializers.DictField(child=serializers.FloatField()),
                'roleCount': serializers.IntegerField(),
                'peopleRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'weeksCount': serializers.IntegerField(),
                'isActive': serializers.BooleanField(),
                'sortOrder': serializers.IntegerField(),
            },
            many=True,
        ),
    )
    def get(self, request, template_id: int):
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        template = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not template:
            return Response({'error': 'template not found'}, status=404)
        if phase not in (template.phase_keys or []):
            return Response([])
        weeks_count = self._get_weeks_count(template, phase)
        dept_id = request.query_params.get('department_id')
        dept_id_int = None
        if dept_id:
            try:
                dept_id_int = int(dept_id)
            except Exception:
                return Response({'error': 'department_id must be an integer'}, status=400)
        roles_qs = DepartmentProjectRole.objects.select_related('department')
        if dept_id_int is not None:
            roles_qs = roles_qs.filter(department_id=dept_id_int)
        excluded_departments = set(template.excluded_departments.values_list('id', flat=True))
        excluded_roles = set(template.excluded_roles.values_list('id', flat=True))
        if excluded_departments:
            roles_qs = roles_qs.exclude(department_id__in=excluded_departments)
        if excluded_roles:
            roles_qs = roles_qs.exclude(id__in=excluded_roles)
        roles = list(roles_qs.order_by('department_id', 'sort_order', 'name'))
        role_ids = [r.id for r in roles]
        settings_map = {
            s.role_id: s
            for s in AutoHoursTemplateRoleSetting.objects.filter(
                template_id=template_id,
                role_id__in=role_ids,
            ).prefetch_related('people_roles')
        }
        items = []
        for role in roles:
            setting = settings_map.get(role.id)
            hours_by_week = self._empty_hours_by_week()
            role_count = 1
            people_role_ids: list[int] = []
            if setting:
                raw = (setting.ramp_percent_by_phase or {}).get(phase) or {}
                if isinstance(raw, dict):
                    for key, value in raw.items():
                        if str(key) in hours_by_week:
                            try:
                                hours_by_week[str(int(key))] = float(Decimal(str(value)))
                            except Exception:
                                pass
                try:
                    count_raw = (setting.role_count_by_phase or {}).get(phase)
                    if count_raw is not None:
                        role_count = max(0, int(count_raw))
                except Exception:
                    role_count = 1
                try:
                    people_role_ids = sorted(int(rid) for rid in setting.people_roles.values_list('id', flat=True))
                except Exception:
                    people_role_ids = []
            items.append({
                'roleId': role.id,
                'roleName': role.name,
                'departmentId': role.department_id,
                'departmentName': getattr(role.department, 'name', ''),
                'percentByWeek': hours_by_week,
                'roleCount': role_count,
                'peopleRoleIds': people_role_ids,
                'weeksCount': weeks_count,
                'isActive': role.is_active,
                'sortOrder': role.sort_order,
            })
        return Response(items)

    @extend_schema(
        request=inline_serializer(
            name='AutoHoursTemplateRoleSettingsUpdate',
            fields={
                'weeksCount': serializers.IntegerField(required=False),
                'settings': inline_serializer(
                    name='AutoHoursTemplateRoleSettingUpdateItem',
                    fields={
                        'roleId': serializers.IntegerField(),
                        'percentByWeek': serializers.DictField(child=serializers.FloatField(), required=False),
                        'roleCount': serializers.IntegerField(required=False),
                        'peopleRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                    },
                    many=True,
                ),
            },
        ),
        responses=inline_serializer(
            name='AutoHoursTemplateRoleSettingItemResponse',
            fields={
                'roleId': serializers.IntegerField(),
                'roleName': serializers.CharField(),
                'departmentId': serializers.IntegerField(),
                'departmentName': serializers.CharField(),
                'percentByWeek': serializers.DictField(child=serializers.FloatField()),
                'roleCount': serializers.IntegerField(),
                'peopleRoleIds': serializers.ListField(child=serializers.IntegerField(), required=False),
                'weeksCount': serializers.IntegerField(),
                'isActive': serializers.BooleanField(),
                'sortOrder': serializers.IntegerField(),
            },
            many=True,
        ),
    )
    def put(self, request, template_id: int):
        phase, phase_err = self._parse_phase(request)
        if phase_err:
            return Response({'error': phase_err}, status=400)
        template = AutoHoursTemplate.objects.filter(id=template_id).first()
        if not template:
            return Response({'error': 'template not found'}, status=404)
        if phase not in (template.phase_keys or []):
            return Response({'error': 'phase is not enabled for this template'}, status=400)
        payload = request.data or {}
        weeks_count = None
        if 'weeksCount' in payload:
            weeks_count, weeks_err = self._coerce_weeks_count(payload.get('weeksCount'))
            if weeks_err:
                return Response({'error': weeks_err}, status=400)
        settings = payload.get('settings') or []
        if not isinstance(settings, list):
            return Response({'error': 'settings must be a list'}, status=400)

        dept_id = request.query_params.get('department_id')
        dept_id_int = None
        if dept_id:
            try:
                dept_id_int = int(dept_id)
            except Exception:
                return Response({'error': 'department_id must be an integer'}, status=400)

        updates: list[tuple[int, dict, int | None, list[int] | None]] = []
        role_ids: list[int] = []
        all_people_role_ids: set[int] = set()
        for item in settings:
            try:
                role_id = int(item.get('roleId'))
            except Exception:
                return Response({'error': 'invalid roleId'}, status=400)
            hours_by_week_raw = item.get('percentByWeek')
            hours_by_week, err = self._normalize_hours_by_week(hours_by_week_raw)
            if err:
                return Response({'error': err}, status=400)
            role_count = None
            if 'roleCount' in item:
                try:
                    role_count = int(item.get('roleCount'))
                except Exception:
                    return Response({'error': f'invalid roleCount for roleId {role_id}'}, status=400)
                if role_count < 0:
                    return Response({'error': 'roleCount must be >= 0'}, status=400)
            people_role_ids: list[int] | None = None
            if 'peopleRoleIds' in item:
                raw_people_role_ids = item.get('peopleRoleIds')
                if raw_people_role_ids is None:
                    people_role_ids = []
                elif not isinstance(raw_people_role_ids, list):
                    return Response({'error': f'peopleRoleIds must be a list for roleId {role_id}'}, status=400)
                else:
                    try:
                        people_role_ids = sorted({int(rid) for rid in raw_people_role_ids})
                    except Exception:
                        return Response({'error': f'invalid peopleRoleIds for roleId {role_id}'}, status=400)
                    all_people_role_ids.update(people_role_ids)
            updates.append((role_id, hours_by_week, role_count, people_role_ids))
            role_ids.append(role_id)

        if role_ids:
            existing_qs = DepartmentProjectRole.objects.filter(id__in=role_ids)
            if dept_id_int is not None:
                existing_qs = existing_qs.filter(department_id=dept_id_int)
            excluded_departments = set(template.excluded_departments.values_list('id', flat=True))
            excluded_roles = set(template.excluded_roles.values_list('id', flat=True))
            if excluded_departments:
                existing_qs = existing_qs.exclude(department_id__in=excluded_departments)
            if excluded_roles:
                existing_qs = existing_qs.exclude(id__in=excluded_roles)
            existing = set(existing_qs.values_list('id', flat=True))
            missing = [rid for rid in role_ids if rid not in existing]
            if missing:
                return Response({'error': f'unknown or excluded roleId(s): {missing}'}, status=400)

        if all_people_role_ids:
            existing_people_roles = set(Role.objects.filter(id__in=all_people_role_ids).values_list('id', flat=True))
            missing_people_roles = sorted(rid for rid in all_people_role_ids if rid not in existing_people_roles)
            if missing_people_roles:
                return Response({'error': f'unknown peopleRoleIds: {missing_people_roles}'}, status=400)

        if weeks_count is not None:
            self._set_weeks_count(template, phase, weeks_count)

        with transaction.atomic():
            for role_id, hours_by_week, role_count, people_role_ids in updates:
                obj, _ = AutoHoursTemplateRoleSetting.objects.get_or_create(template_id=template_id, role_id=role_id)
                by_phase = obj.ramp_percent_by_phase or {}
                by_phase[phase] = hours_by_week
                obj.ramp_percent_by_phase = by_phase
                if role_count is not None:
                    count_by_phase = obj.role_count_by_phase or {}
                    count_by_phase[phase] = int(role_count)
                    obj.role_count_by_phase = count_by_phase
                    obj.save(update_fields=['ramp_percent_by_phase', 'role_count_by_phase', 'updated_at'])
                else:
                    obj.save(update_fields=['ramp_percent_by_phase', 'updated_at'])
                if people_role_ids is not None:
                    obj.people_roles.set(people_role_ids)

        _bump_analytics_cache_version()
        return self.get(request, template_id=template_id)


class UtilizationSchemeView(APIView):
    """Singleton endpoint for utilization scheme.

    - GET: returns the current scheme with ETag/Last-Modified. Requires auth.
    - PUT: admin-only, requires If-Match ETag; increments version on success.
    - When feature flag is disabled: GET returns defaults; PUT returns 403.
    """
    permission_classes = [IsAuthenticated]

    def _current_etag(self, obj: UtilizationScheme) -> str:
        payload = f"{obj.version}-{obj.updated_at.isoformat() if obj.updated_at else ''}"
        return hashlib.sha256(payload.encode()).hexdigest()

    @extend_schema(responses=UtilizationSchemeSerializer)
    def get(self, request):
        obj = UtilizationScheme.get_active()
        etag = self._current_etag(obj)
        inm = request.META.get('HTTP_IF_NONE_MATCH')
        if inm and inm.strip('"') == etag:
            from django.utils.http import http_date
            resp = Response(status=status.HTTP_304_NOT_MODIFIED)
            resp['ETag'] = f'"{etag}"'
            resp['Last-Modified'] = http_date(obj.updated_at.timestamp())
            return resp

        # When feature flag is disabled, serve defaults (read-only) per rollout spec
        if not settings.FEATURES.get('UTILIZATION_SCHEME_ENABLED', True):
            data = {
                'mode': UtilizationScheme.MODE_ABSOLUTE,
                'blue_min': 1, 'blue_max': 29,
                'green_min': 30, 'green_max': 36,
                'orange_min': 37, 'orange_max': 40,
                'red_min': 41,
                'full_capacity_hours': 36,
                'zero_is_blank': True,
                'version': obj.version,
                'updated_at': obj.updated_at,
            }
        else:
            data = UtilizationSchemeSerializer(obj).data

        resp = Response(data)
        from django.utils.http import http_date
        resp['ETag'] = f'"{etag}"'
        resp['Last-Modified'] = http_date(obj.updated_at.timestamp())
        return resp

    @extend_schema(request=UtilizationSchemeSerializer, responses=UtilizationSchemeSerializer)
    def put(self, request):
        if not settings.FEATURES.get('UTILIZATION_SCHEME_ENABLED', True):
            return Response({'detail': 'Utilization scheme editing is disabled'}, status=status.HTTP_403_FORBIDDEN)
        # Admin-only
        for cls in self.permission_classes:
            pass
        if not request.user or not request.user.is_staff:
            return Response({'detail': 'Admin required'}, status=status.HTTP_403_FORBIDDEN)

        obj = UtilizationScheme.get_active()
        # If-Match required
        if_match = request.META.get('HTTP_IF_MATCH')
        current = self._current_etag(obj)
        if not if_match or if_match.strip('"') != current:
            return Response({'detail': 'Precondition failed'}, status=status.HTTP_412_PRECONDITION_FAILED)

        before = UtilizationSchemeSerializer(obj).data
        ser = UtilizationSchemeSerializer(instance=obj, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        # increment version and save
        obj.version = (obj.version or 0) + 1
        for k, v in ser.validated_data.items():
            setattr(obj, k, v)
        obj.save()
        after = UtilizationSchemeSerializer(obj).data
        # Audit log (non-blocking)
        try:
            AdminAuditLog.objects.create(
                actor=request.user if request.user.is_authenticated else None,
                action='utilization_scheme_update',
                target_user=None,
                detail={'before': before, 'after': after},
            )
        except Exception:  # nosec B110
            pass
        # Return with new ETag
        etag = self._current_etag(obj)
        resp = Response(after)
        from django.utils.http import http_date
        resp['ETag'] = f'"{etag}"'
        resp['Last-Modified'] = http_date(obj.updated_at.timestamp())
        return resp


class ProjectRoleView(APIView):
    """List/add project roles for suggestions/settings.

    - GET: returns union of catalog roles and distinct existing assignment roles.
    - POST: admin-only; adds a role to the catalog.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses=inline_serializer(
            name='ProjectRoleListResponse',
            fields={'roles': serializers.ListField(child=serializers.CharField())},
        )
    )
    def get(self, request):
        # Legacy union: catalog + existing assignments
        names = set()
        try:
            for pr in ProjectRole.objects.all():
                if pr.name:
                    names.add(pr.name.strip())
        except Exception:  # nosec B110
            pass
        try:
            qs = Assignment.objects.exclude(role_on_project__isnull=True).exclude(role_on_project__exact='')
            for r in qs.values_list('role_on_project', flat=True).distinct():
                if r:
                    names.add(str(r).strip())
        except Exception:  # nosec B110
            pass
        out = sorted(names, key=lambda s: s.lower())
        return Response({'roles': out})


class DeliverablePhaseMappingSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(responses=DeliverablePhaseMappingSettingsSerializer)
    def get(self, request):
        obj = DeliverablePhaseMappingSettings.get_active()
        phases = DeliverablePhaseDefinition.objects.all().order_by('sort_order', 'id')
        payload = {
            'useDescriptionMatch': bool(obj.use_description_match),
            'phases': [
                {
                    'key': p.key,
                    'label': p.label,
                    'descriptionTokens': p.description_tokens or [],
                    'rangeMin': p.range_min,
                    'rangeMax': p.range_max,
                    'sortOrder': p.sort_order,
                }
                for p in phases
            ],
            'updatedAt': obj.updated_at,
        }
        return Response(payload)

    @extend_schema(request=DeliverablePhaseMappingSettingsSerializer, responses=DeliverablePhaseMappingSettingsSerializer)
    def put(self, request):
        obj = DeliverablePhaseMappingSettings.get_active()
        ser = DeliverablePhaseMappingSettingsSerializer(data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        phases = data.get('phases') or []
        use_desc = bool(data.get('useDescriptionMatch'))

        incoming_keys = []
        for phase in phases:
            key = str(phase.get('key') or '').strip().lower()
            incoming_keys.append(key)

        existing_keys = set(DeliverablePhaseDefinition.objects.values_list('key', flat=True))
        remove_keys = [k for k in existing_keys if k not in set(incoming_keys)]

        with transaction.atomic():
            obj.use_description_match = use_desc
            obj.save(update_fields=['use_description_match', 'updated_at'])

            for idx, phase in enumerate(phases):
                key = str(phase.get('key') or '').strip().lower()
                label = str(phase.get('label') or '').strip()
                tokens = phase.get('descriptionTokens') or []
                normalized_tokens = []
                for token in tokens:
                    t = str(token).strip().lower()
                    if not t:
                        continue
                    if t in normalized_tokens:
                        continue
                    normalized_tokens.append(t)
                rmin = phase.get('rangeMin', None)
                rmax = phase.get('rangeMax', None)
                sort_order = phase.get('sortOrder', idx)
                incoming_keys.append(key)
                obj_phase, _ = DeliverablePhaseDefinition.objects.get_or_create(
                    key=key,
                    defaults={
                        'label': label,
                        'description_tokens': normalized_tokens,
                        'range_min': rmin,
                        'range_max': rmax,
                        'sort_order': sort_order,
                    },
                )
                obj_phase.label = label
                obj_phase.description_tokens = normalized_tokens
                obj_phase.range_min = rmin
                obj_phase.range_max = rmax
                obj_phase.sort_order = sort_order
                obj_phase.save(update_fields=['label', 'description_tokens', 'range_min', 'range_max', 'sort_order', 'updated_at'])

            if remove_keys:
                DeliverablePhaseDefinition.objects.filter(key__in=remove_keys).delete()
        # Invalidate classifier cache
        try:
            from core.deliverable_phase import clear_phase_mapping_cache
            clear_phase_mapping_cache()
        except Exception:  # nosec B110
            pass
        return self.get(request)

    @extend_schema(
        request=inline_serializer(
            name='ProjectRoleCreateRequest',
            fields={'name': serializers.CharField()},
        ),
        responses=ProjectRoleSerializer,
    )
    def post(self, request):
        if not request.user or not request.user.is_staff:
            return Response({'detail': 'Admin required'}, status=status.HTTP_403_FORBIDDEN)
        name = (request.data or {}).get('name')
        if not name or not isinstance(name, str) or not name.strip():
            return Response({'detail': 'name is required'}, status=400)
        try:
            obj, created = ProjectRole.objects.get_or_create(name_key=name.strip().lower(), defaults={'name': name.strip()})
            ser = ProjectRoleSerializer(obj)
            return Response(ser.data, status=201 if created else 200)
        except Exception as e:
            return Response({'detail': str(e)}, status=400)

    @extend_schema(
        request=inline_serializer(name='ProjectRoleDeleteReq', fields={'name': serializers.CharField(required=False)}),
        responses=inline_serializer(name='ProjectRoleDeleteResp', fields={
            'detail': serializers.CharField(),
            'removedFromAssignments': serializers.IntegerField(),
            'catalogDeleted': serializers.BooleanField(),
        })
    )
    def delete(self, request):
        """Remove a project role from the catalog and clear assignments using it.

        Behavior:
        - Admin only.
        - Accepts role name via query param (?name=...) or JSON body { name }.
        - Clears `Assignment.role_on_project` wherever it matches (case-insensitive).
        - If a catalog ProjectRole exists for that normalized name, it is deleted.
        """
        if not request.user or not request.user.is_staff:
            return Response({'detail': 'Admin required'}, status=status.HTTP_403_FORBIDDEN)

        # Accept name from query (?name=) or body { name }
        name = request.query_params.get('name')
        if not name:
            body = request.data or {}
            name = body.get('name') if isinstance(body, dict) else None
        if not isinstance(name, str) or not name.strip():
            return Response({'detail': 'name is required'}, status=400)

        norm = ' '.join(name.strip().split())
        key = norm.lower()

        from assignments.models import Assignment  # local import to avoid cycles in schema generation

        with transaction.atomic():
            # Clear from assignments (case-insensitive comparison)
            removed_count = Assignment.objects.filter(role_on_project__iexact=norm).update(role_on_project=None)

            from .models import ProjectRole
            pr = ProjectRole.objects.filter(name_key=key).first()
            catalog_deleted = False
            if pr:
                pr.delete()
                catalog_deleted = True

        # Best-effort audit log
        try:
            from accounts.models import AdminAuditLog  # type: ignore
            AdminAuditLog.objects.create(
                actor=request.user if request.user and request.user.is_authenticated else None,
                action='project_roles_remove',
                target_user=None,
                detail={'name': norm, 'removedFromAssignments': removed_count, 'catalogDeleted': catalog_deleted},
            )
        except Exception:  # nosec B110
            pass

        return Response({'detail': 'deleted', 'removedFromAssignments': removed_count, 'catalogDeleted': catalog_deleted})


class QATaskSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(responses=QATaskSettingsSerializer)
    def get(self, request):
        obj = QATaskSettings.get_active()
        return Response(QATaskSettingsSerializer(obj).data)

    @extend_schema(request=QATaskSettingsSerializer, responses=QATaskSettingsSerializer)
    def put(self, request):
        obj = QATaskSettings.get_active()
        ser = QATaskSettingsSerializer(instance=obj, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(QATaskSettingsSerializer(obj).data)


class WebPushGlobalSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(responses=WebPushGlobalSettingsSerializer)
    def get(self, request):
        obj = WebPushGlobalSettings.get_active()
        return Response(WebPushGlobalSettingsSerializer(obj).data)

    @extend_schema(request=WebPushGlobalSettingsSerializer, responses=WebPushGlobalSettingsSerializer)
    def put(self, request):
        obj = WebPushGlobalSettings.get_active()
        ser = WebPushGlobalSettingsSerializer(instance=obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(WebPushGlobalSettingsSerializer(obj).data)


class NotificationTemplatesView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @staticmethod
    def _default_template_payload(event_key: str, label: str, description: str) -> dict:
        subject = f"{label} - Workload Tracker"
        body = description or label
        return {
            'event_key': event_key,
            'push_title_template': label,
            'push_body_template': body,
            'email_subject_template': subject,
            'email_body_template': body,
            'in_app_title_template': label,
            'in_app_body_template': body,
            'push_ttl_seconds': 3600,
            'push_urgency': NotificationTemplate.PUSH_URGENCY_NORMAL,
            'push_topic_mode': NotificationTemplate.PUSH_TOPIC_EVENT,
        }

    @classmethod
    def _ensure_seed_templates(cls):
        existing = set(NotificationTemplate.objects.values_list('event_key', flat=True))
        missing_rows = []
        for item in EVENT_CATALOG:
            event_key = str(item.get('key') or '').strip()
            if not event_key or event_key in existing:
                continue
            missing_rows.append(NotificationTemplate(**cls._default_template_payload(
                event_key,
                str(item.get('label') or event_key),
                str(item.get('description') or ''),
            )))
        if missing_rows:
            NotificationTemplate.objects.bulk_create(missing_rows, ignore_conflicts=True)

    @extend_schema(responses=NotificationTemplateSerializer(many=True))
    def get(self, request):
        self._ensure_seed_templates()
        rows = NotificationTemplate.objects.order_by('event_key')
        return Response(NotificationTemplateSerializer(rows, many=True).data)

    @extend_schema(
        request=inline_serializer(
            name='NotificationTemplatesPutRequest',
            fields={
                'templates': NotificationTemplateSerializer(many=True, required=False),
            },
        ),
        responses=NotificationTemplateSerializer(many=True),
    )
    def put(self, request):
        payload = request.data
        if isinstance(payload, list):
            items = payload
        elif isinstance(payload, dict) and isinstance(payload.get('templates'), list):
            items = payload.get('templates')
        else:
            return Response(
                {'detail': 'Expected request body to be a list or {"templates":[...]}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = NotificationTemplateSerializer(data=items, many=True, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_keys: set[str] = set()
        with transaction.atomic():
            for item in serializer.validated_data:
                event_key = str(item.get('event_key') or '').strip()
                if not event_key:
                    continue
                defaults = dict(item)
                defaults.pop('event_key', None)
                defaults['updated_by'] = request.user if request.user.is_authenticated else None
                NotificationTemplate.objects.update_or_create(
                    event_key=event_key,
                    defaults=defaults,
                )
                updated_keys.add(event_key)
        if not updated_keys:
            return Response([], status=status.HTTP_200_OK)
        rows = NotificationTemplate.objects.filter(event_key__in=sorted(updated_keys)).order_by('event_key')
        return Response(NotificationTemplateSerializer(rows, many=True).data)


class NotificationAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='days', type=int, required=False, description='Window size in days (1-90)'),
        ],
        responses=inline_serializer(
            name='NotificationAnalyticsResponse',
            fields={
                'windowDays': serializers.IntegerField(),
                'generatedAt': serializers.DateTimeField(),
                'total': serializers.IntegerField(),
                'byEventChannelStatus': serializers.ListField(child=serializers.DictField()),
                'byChannel': serializers.ListField(child=serializers.DictField()),
                'byStatus': serializers.ListField(child=serializers.DictField()),
            },
        ),
    )
    def get(self, request):
        try:
            window_days = int(request.query_params.get('days') or 7)
        except Exception:
            window_days = 7
        window_days = max(1, min(90, window_days))
        since = timezone.now() - timedelta(days=window_days)

        qs = NotificationDeliveryLog.objects.filter(created_at__gte=since)
        grouped_rows = list(
            qs.values('event_key', 'channel', 'status')
            .annotate(count=Count('id'))
            .order_by('event_key', 'channel', 'status')
        )
        by_event_channel_status = [
            {
                'eventKey': row['event_key'],
                'channel': row['channel'],
                'status': row['status'],
                'count': int(row['count']),
            }
            for row in grouped_rows
        ]
        by_channel_rows = list(
            qs.values('channel')
            .annotate(count=Count('id'))
            .order_by('channel')
        )
        by_status_rows = list(
            qs.values('status')
            .annotate(count=Count('id'))
            .order_by('status')
        )
        return Response(
            {
                'windowDays': window_days,
                'generatedAt': timezone.now(),
                'total': int(sum(int(row['count']) for row in grouped_rows)),
                'byEventChannelStatus': by_event_channel_status,
                'byChannel': [
                    {'channel': row['channel'], 'count': int(row['count'])}
                    for row in by_channel_rows
                ],
                'byStatus': [
                    {'status': row['status'], 'count': int(row['count'])}
                    for row in by_status_rows
                ],
            }
        )


class WebPushVapidKeysView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(responses=WebPushVapidKeysStatusSerializer)
    def get(self, request):
        return Response(web_push_vapid_status())

    @extend_schema(request=WebPushVapidKeysGenerateSerializer, responses=WebPushVapidKeysStatusSerializer)
    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        ser = WebPushVapidKeysGenerateSerializer(data=payload)
        ser.is_valid(raise_exception=True)

        obj = WebPushVapidKeys.get_active()
        fallback_subject = str(obj.subject or getattr(settings, 'WEB_PUSH_SUBJECT', '') or '').strip()
        subject = str(ser.validated_data.get('subject') or fallback_subject).strip()
        if not subject:
            return Response(
                {'detail': "subject is required and must start with 'mailto:', 'https://', or 'http://'"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lowered = subject.lower()
        if not (lowered.startswith('mailto:') or lowered.startswith('https://') or lowered.startswith('http://')):
            return Response(
                {'detail': "subject must start with 'mailto:', 'https://', or 'http://'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        public_key, private_key = generate_vapid_keypair()
        obj.set_values(public_key=public_key, private_key=private_key, subject=subject)
        return Response(web_push_vapid_status(), status=status.HTTP_200_OK)


class NetworkGraphSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(responses=NetworkGraphSettingsSerializer)
    def get(self, request):
        obj = NetworkGraphSettings.get_active()
        return Response(NetworkGraphSettingsSerializer(obj).data)

    @extend_schema(request=NetworkGraphSettingsSerializer, responses=NetworkGraphSettingsSerializer)
    def put(self, request):
        if not is_admin_user(getattr(request, 'user', None)):
            return Response({'detail': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        obj = NetworkGraphSettings.get_active()
        ser = NetworkGraphSettingsSerializer(instance=obj, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(NetworkGraphSettingsSerializer(obj).data)


class ProjectVisibilitySettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(responses=ProjectVisibilitySettingsSerializer)
    def get(self, request):
        if not is_admin_user(getattr(request, 'user', None)):
            return Response({'detail': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        obj = ProjectVisibilitySettings.get_active()
        return Response(ProjectVisibilitySettingsSerializer(obj).data)

    @extend_schema(request=ProjectVisibilitySettingsUpdateSerializer, responses=ProjectVisibilitySettingsSerializer)
    def put(self, request):
        if not is_admin_user(getattr(request, 'user', None)):
            return Response({'detail': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        obj = ProjectVisibilitySettings.get_active()
        ser = ProjectVisibilitySettingsUpdateSerializer(data=request.data or {})
        ser.is_valid(raise_exception=True)
        obj.config_json = ser.validated_data['config']
        obj.updated_by = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
        obj.save(update_fields=['config_json', 'updated_by', 'updated_at'])
        _bump_analytics_cache_version()
        return Response(ProjectVisibilitySettingsSerializer(obj).data)


class TaskProgressColorSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    @extend_schema(responses=TaskProgressColorSettingsSerializer)
    def get(self, request):
        obj = TaskProgressColorSettings.get_active()
        return Response(TaskProgressColorSettingsSerializer(obj).data)

    @extend_schema(request=TaskProgressColorSettingsSerializer, responses=TaskProgressColorSettingsSerializer)
    def put(self, request):
        obj = TaskProgressColorSettings.get_active()
        ser = TaskProgressColorSettingsSerializer(instance=obj, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(TaskProgressColorSettingsSerializer(obj).data)


class CalendarFeedsView(APIView):
    """Endpoint to view/update tokens for calendar feeds (read-only ICS).

    - GET: all authenticated users can view current token values
    - PATCH: admin-only update or regenerate with {regenerate: true}
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=CalendarFeedSettingsSerializer)
    def get(self, request):
        obj = CalendarFeedSettings.get_active()
        return Response(CalendarFeedSettingsSerializer(obj).data)

    @extend_schema(
        request=inline_serializer(name='CalendarFeedsPatch', fields={
            'deliverables_token': serializers.CharField(required=False),
            'regenerate': serializers.BooleanField(required=False),
        }),
        responses=CalendarFeedSettingsSerializer,
    )
    def patch(self, request):
        if not is_admin_user(getattr(request, 'user', None)):
            return Response({'detail': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        obj = CalendarFeedSettings.get_active()
        regen = bool(request.data.get('regenerate'))
        token = request.data.get('deliverables_token')
        if regen:
            obj.rotate_deliverables_token()
        elif token is not None:
            t = str(token).strip()
            if len(t) < 16:
                return Response({'detail': 'token too short'}, status=400)
            obj.deliverables_token = t
            obj.save(update_fields=['deliverables_token', 'updated_at'])
        return Response(CalendarFeedSettingsSerializer(obj).data)
