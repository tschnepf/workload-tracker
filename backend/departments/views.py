import os
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from django.db import connection
from functools import lru_cache
from django.conf import settings
from django.core.cache import cache
from django.core.paginator import Paginator
from .models import Department
from .serializers import DepartmentSerializer
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
