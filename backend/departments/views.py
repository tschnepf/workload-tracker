import os
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from functools import lru_cache
from django.conf import settings
from django.core.cache import cache
from django.core.paginator import Paginator
from accounts.permissions import IsAdminOrManager, is_admin_or_manager
from .models import (
    Department,
    DepartmentOrgChartLayout,
    DepartmentReportingGroup,
    DepartmentReportingGroupMember,
)
from .serializers import (
    DepartmentSerializer,
    ReportingGroupCreateSerializer,
    ReportingGroupUpdateSerializer,
    ReportingGroupLayoutSaveSerializer,
)
from .reporting_groups_service import build_workspace_payload, reporting_groups_feature_enabled
from people.models import Person
from people.serializers import PersonSerializer
from core.cache_keys import build_aggregate_cache_key
from core.vertical_scope import get_request_enforced_vertical_id


@lru_cache(maxsize=1)
def _has_secondary_manager_m2m_table() -> bool:
    """Best-effort check for the secondary manager m2m table.

    Some running environments may have code deployed before migrations are applied.
    In that case, prefetching the m2m relation raises a database error and breaks
    all department reads.
    """
    try:
        table_name = Department.secondary_managers.through._meta.db_table
        with connection.cursor() as cursor:
            return table_name in set(connection.introspection.table_names(cursor))
    except Exception:
        return False


class DepartmentsSnapshotThrottle(ScopedRateThrottle):
    scope = 'snapshots'


def _parse_csv_include(raw, default_tokens: list[str], allowed_tokens: set[str], max_tokens: int = 10):
    if raw in (None, ''):
        return sorted(default_tokens), None
    source = str(raw).split(',')
    tokens = []
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


def _parse_int(raw, default=None):
    if raw in (None, ''):
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _bounded_int(raw, default: int, *, min_value: int, max_value: int) -> int:
    try:
        value = int(raw)
    except Exception:
        value = default
    return max(min_value, min(max_value, value))


def _page_urls(request, *, page_key: str, page_size_key: str, page_number: int, page_size: int, has_next: bool, has_previous: bool):
    def _make(num: int | None):
        if not num:
            return None
        params = request.query_params.copy()
        params[page_key] = str(num)
        params[page_size_key] = str(page_size)
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


class DepartmentsPageSnapshotView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [DepartmentsSnapshotThrottle]
    _INCLUDE_ALLOWED = {'departments', 'people'}
    _DEFAULT_INCLUDE = ['departments', 'people']
    _MAX_PAGE_SIZE = 500

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
            page_key=page_key,
            page_size_key=page_size_key,
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

    def get(self, request):
        if not settings.FEATURES.get('FF_MODERATE_PAGES_SNAPSHOTS', True):
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        include_tokens, include_err = _parse_csv_include(
            request.query_params.get('include'),
            self._DEFAULT_INCLUDE,
            self._INCLUDE_ALLOWED,
        )
        if include_err:
            return Response({'error': include_err}, status=status.HTTP_400_BAD_REQUEST)

        include_inactive = _parse_bool(request.query_params.get('include_inactive'))
        vertical_filter = _parse_int(request.query_params.get('vertical'))
        enforced_vertical = get_request_enforced_vertical_id(request)
        if enforced_vertical is not None:
            vertical_filter = enforced_vertical
        department_filter = _parse_int(request.query_params.get('department'))
        include_children = _parse_bool(request.query_params.get('include_children'))

        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = None
        if use_cache:
            try:
                cache_key = build_aggregate_cache_key(
                    'departments.snapshot',
                    request,
                    filters={
                        'include': include_tokens or [],
                        'vertical': vertical_filter if vertical_filter is not None else 'all',
                        'department': department_filter if department_filter is not None else 'all',
                        'include_children': 1 if include_children else 0,
                        'include_inactive': 1 if include_inactive else 0,
                        'page': request.query_params.get('page') or '1',
                        'page_size': request.query_params.get('page_size') or '100',
                        'people_page': request.query_params.get('people_page') or '1',
                        'people_page_size': request.query_params.get('people_page_size') or '100',
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

        department_scope_ids = None
        if department_filter is not None:
            if include_children:
                department_scope_ids = _department_descendant_ids(department_filter)
            else:
                department_scope_ids = [department_filter]

        if 'departments' in include_set:
            departments_qs = Department.objects.select_related('manager').order_by('name')
            if not include_inactive:
                departments_qs = departments_qs.filter(is_active=True)
            if vertical_filter is not None:
                departments_qs = departments_qs.filter(vertical_id=vertical_filter)
            if department_scope_ids is not None:
                departments_qs = departments_qs.filter(id__in=department_scope_ids)
            departments_page = self._paginate(
                departments_qs,
                request=request,
                page_key='page',
                page_size_key='page_size',
            )
            payload['departments'] = {
                'count': departments_page['count'],
                'next': departments_page['next'],
                'previous': departments_page['previous'],
                'results': DepartmentSerializer(departments_page['results'], many=True).data,
            }

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

        if use_cache and cache_key:
            try:
                cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
            except Exception:
                pass

        return Response(payload)


class DepartmentViewSet(viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    # Use global default permissions (IsAuthenticated)

    def get_queryset(self):
        qs = Department.objects.select_related('manager')
        if _has_secondary_manager_m2m_table():
            qs = qs.prefetch_related('secondary_managers')
        qs = qs.order_by('name')
        include_inactive = False
        try:
            raw = self.request.query_params.get('include_inactive') if self.request else None
            if raw is not None and str(raw).strip().lower() in ('1', 'true', 'yes', 'on'):
                include_inactive = True
        except Exception:
            include_inactive = False
        if not include_inactive:
            qs = qs.filter(is_active=True)
        vertical_param = None
        try:
            vertical_param = self.request.query_params.get('vertical') if self.request else None
        except Exception:
            vertical_param = None
        enforced_vertical = get_request_enforced_vertical_id(getattr(self, 'request', None))
        if enforced_vertical is not None:
            vertical_param = enforced_vertical
        if vertical_param not in (None, ""):
            try:
                qs = qs.filter(vertical_id=int(vertical_param))
            except Exception:
                pass
        return qs
    
    def list(self, request, *args, **kwargs):
        """Get all departments with bulk loading support"""
        # Check if bulk loading is requested
        if request.query_params.get('all') == 'true':
            # Return all departments without pagination (Phase 2 optimization)
            queryset = self.get_queryset()
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        
        # Use default pagination
        return super().list(request, *args, **kwargs)


def _serialize_reporting_group(group: DepartmentReportingGroup) -> dict:
    return {
        'id': int(group.id),
        'name': group.name,
        'managerId': int(group.manager_id) if group.manager_id else None,
        'card': {'x': int(group.card_x), 'y': int(group.card_y)},
        'memberIds': list(
            DepartmentReportingGroupMember.objects.filter(reporting_group=group)
            .order_by('sort_order', 'id')
            .values_list('person_id', flat=True)
        ),
        'sortOrder': int(group.sort_order or 0),
        'updatedAt': group.updated_at.isoformat() if group.updated_at else None,
    }


def _active_department_or_404(department_id: int) -> Department:
    return get_object_or_404(Department.objects.filter(is_active=True), pk=department_id)


def _validate_manager_candidate(*, department: Department, manager_id: int | None, group_id: int | None = None) -> Person | None:
    if manager_id is None:
        return None
    manager = Person.objects.filter(id=manager_id, is_active=True, department=department).first()
    if not manager:
        raise ValueError('Manager must be an active person in the selected department.')
    existing_manager = DepartmentReportingGroup.objects.filter(
        department=department,
        is_active=True,
        manager_id=manager_id,
    )
    if group_id is not None:
        existing_manager = existing_manager.exclude(id=group_id)
    if existing_manager.exists():
        raise ValueError('This person already manages another reporting group in the department.')
    existing_membership = DepartmentReportingGroupMember.objects.filter(
        department=department,
        person_id=manager_id,
        reporting_group__is_active=True,
    )
    if group_id is not None:
        existing_membership = existing_membership.exclude(reporting_group_id=group_id)
    if existing_membership.exists():
        raise ValueError('A manager cannot also be assigned as a member in a different reporting group.')
    return manager


class DepartmentOrgChartWorkspaceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, department_id: int):
        if not reporting_groups_feature_enabled():
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        department = _active_department_or_404(department_id)
        payload = build_workspace_payload(
            department,
            can_edit=is_admin_or_manager(getattr(request, 'user', None)),
        )
        return Response(payload)


class DepartmentReportingGroupCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def post(self, request, department_id: int):
        if not reporting_groups_feature_enabled():
            return Response({'detail': 'Reporting groups are disabled'}, status=status.HTTP_403_FORBIDDEN)
        department = _active_department_or_404(department_id)
        serializer = ReportingGroupCreateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        manager_id = data.get('managerId')
        try:
            manager = _validate_manager_candidate(
                department=department,
                manager_id=manager_id,
                group_id=None,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        active_count = DepartmentReportingGroup.objects.filter(department=department, is_active=True).count()
        max_sort = (
            DepartmentReportingGroup.objects.filter(department=department, is_active=True)
            .order_by('-sort_order')
            .values_list('sort_order', flat=True)
            .first()
        )
        sort_order = int(max_sort or 0) + 10
        group = DepartmentReportingGroup.objects.create(
            department=department,
            name=(data.get('name') or '').strip() or 'New Reporting Group',
            manager=manager,
            card_x=int(data.get('x', 64 + (active_count * 260))),
            card_y=int(data.get('y', 240)),
            sort_order=sort_order,
            is_active=True,
        )
        if manager_id is not None:
            DepartmentReportingGroupMember.objects.filter(
                department=department,
                person_id=manager_id,
            ).delete()
        layout = DepartmentOrgChartLayout.get_or_create_for_department(department)
        layout.bump_workspace_version()
        return Response(
            {
                'group': _serialize_reporting_group(group),
                'workspaceVersion': int(layout.workspace_version or 1),
            },
            status=status.HTTP_201_CREATED,
        )


class DepartmentReportingGroupDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def patch(self, request, department_id: int, group_id: int):
        if not reporting_groups_feature_enabled():
            return Response({'detail': 'Reporting groups are disabled'}, status=status.HTTP_403_FORBIDDEN)
        department = _active_department_or_404(department_id)
        group = get_object_or_404(
            DepartmentReportingGroup.objects.filter(
                department=department,
                is_active=True,
            ),
            pk=group_id,
        )
        serializer = ReportingGroupUpdateSerializer(data=request.data or {}, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        manager_updated = False
        if 'managerId' in data:
            manager_updated = True
            try:
                manager = _validate_manager_candidate(
                    department=department,
                    manager_id=data.get('managerId'),
                    group_id=group.id,
                )
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            group.manager = manager
        if 'name' in data:
            group.name = (data.get('name') or '').strip() or group.name
        if 'x' in data:
            group.card_x = int(data['x'])
        if 'y' in data:
            group.card_y = int(data['y'])
        if 'sortOrder' in data:
            group.sort_order = int(data['sortOrder'])
        group.save()

        if manager_updated and group.manager_id:
            DepartmentReportingGroupMember.objects.filter(
                department=department,
                person_id=group.manager_id,
            ).delete()

        layout = DepartmentOrgChartLayout.get_or_create_for_department(department)
        layout.bump_workspace_version()
        return Response(
            {
                'group': _serialize_reporting_group(group),
                'workspaceVersion': int(layout.workspace_version or 1),
            }
        )

    def delete(self, request, department_id: int, group_id: int):
        if not reporting_groups_feature_enabled():
            return Response({'detail': 'Reporting groups are disabled'}, status=status.HTTP_403_FORBIDDEN)
        department = _active_department_or_404(department_id)
        group = get_object_or_404(
            DepartmentReportingGroup.objects.filter(
                department=department,
                is_active=True,
            ),
            pk=group_id,
        )
        with transaction.atomic():
            group.is_active = False
            group.save(update_fields=['is_active', 'updated_at'])
            DepartmentReportingGroupMember.objects.filter(
                department=department,
                reporting_group=group,
            ).delete()
            layout = DepartmentOrgChartLayout.get_or_create_for_department(department)
            layout.bump_workspace_version()
        return Response({'workspaceVersion': int(layout.workspace_version or 1)})


class DepartmentReportingGroupLayoutView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]

    def put(self, request, department_id: int):
        if not reporting_groups_feature_enabled():
            return Response({'detail': 'Reporting groups are disabled'}, status=status.HTTP_403_FORBIDDEN)
        department = _active_department_or_404(department_id)
        layout = DepartmentOrgChartLayout.get_or_create_for_department(department)
        serializer = ReportingGroupLayoutSaveSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        incoming_version = int(data['workspaceVersion'])
        if incoming_version != int(layout.workspace_version or 1):
            payload = build_workspace_payload(department, can_edit=True)
            return Response(
                {'detail': 'workspace version conflict', 'code': 'workspace_version_conflict', 'workspace': payload},
                status=status.HTTP_409_CONFLICT,
            )

        items = data.get('groups') or []
        active_groups = list(
            DepartmentReportingGroup.objects.filter(department=department, is_active=True).order_by('sort_order', 'id')
        )
        active_group_ids = {int(group.id) for group in active_groups}
        incoming_group_ids = {int(item['id']) for item in items}
        if incoming_group_ids != active_group_ids:
            return Response(
                {'error': 'groups payload must include all active reporting groups exactly once'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        group_by_id = {int(group.id): group for group in active_groups}
        manager_ids: set[int] = set()
        incoming_members_per_group: dict[int, list[int]] = {}

        for item in items:
            group_id = int(item['id'])
            manager_id = item.get('managerId')
            if manager_id is not None:
                manager = Person.objects.filter(
                    id=int(manager_id),
                    department=department,
                    is_active=True,
                ).first()
                if not manager:
                    return Response(
                        {'error': f'invalid managerId for group {group_id}'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if int(manager_id) in manager_ids:
                    return Response(
                        {'error': 'a manager may only lead one reporting group per department'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                manager_ids.add(int(manager_id))

            member_ids_raw = item.get('memberIds') or []
            member_ids: list[int] = []
            seen_member_ids: set[int] = set()
            for raw_id in member_ids_raw:
                pid = int(raw_id)
                if pid in seen_member_ids:
                    continue
                seen_member_ids.add(pid)
                member_ids.append(pid)
            incoming_members_per_group[group_id] = member_ids

        all_member_ids = [pid for member_ids in incoming_members_per_group.values() for pid in member_ids]
        if len(set(all_member_ids)) != len(all_member_ids):
            return Response(
                {'error': 'a person can belong to only one reporting group per department'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        manager_member_overlap = set(all_member_ids).intersection(manager_ids)
        if manager_member_overlap:
            return Response(
                {'error': 'a reporting group manager cannot also be listed as a member'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if all_member_ids:
            valid_people = set(
                Person.objects.filter(
                    id__in=all_member_ids,
                    department=department,
                    is_active=True,
                ).values_list('id', flat=True)
            )
            invalid_people = sorted(pid for pid in all_member_ids if pid not in valid_people)
            if invalid_people:
                return Response(
                    {'error': f'invalid memberIds: {invalid_people[:10]}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            dept_card = data.get('departmentCard') or {}
            layout.department_card_x = int(dept_card.get('x', layout.department_card_x))
            layout.department_card_y = int(dept_card.get('y', layout.department_card_y))

            for item in items:
                group_id = int(item['id'])
                group = group_by_id[group_id]
                group.card_x = int(item['x'])
                group.card_y = int(item['y'])
                if 'sortOrder' in item:
                    group.sort_order = int(item['sortOrder'])
                if 'managerId' in item:
                    manager_id = item.get('managerId')
                    group.manager_id = int(manager_id) if manager_id is not None else None
                group.save()

            DepartmentReportingGroupMember.objects.filter(
                department=department,
                reporting_group_id__in=active_group_ids,
            ).delete()
            new_memberships: list[DepartmentReportingGroupMember] = []
            for item in items:
                group_id = int(item['id'])
                for idx, person_id in enumerate(incoming_members_per_group.get(group_id, [])):
                    new_memberships.append(
                        DepartmentReportingGroupMember(
                            department=department,
                            reporting_group_id=group_id,
                            person_id=int(person_id),
                            sort_order=(idx + 1) * 10,
                        )
                    )
            if new_memberships:
                DepartmentReportingGroupMember.objects.bulk_create(new_memberships)

            layout.workspace_version = int(layout.workspace_version or 0) + 1
            layout.save(update_fields=['department_card_x', 'department_card_y', 'workspace_version', 'updated_at'])

        payload = build_workspace_payload(
            department,
            can_edit=is_admin_or_manager(getattr(request, 'user', None)),
        )
        return Response(payload)
