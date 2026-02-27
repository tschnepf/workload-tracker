from collections import Counter, defaultdict
from datetime import datetime, date as _date, timedelta
import random
import time
from django.utils.dateparse import parse_date
from django.db import connection, transaction
from django.db.models import Count, Q, Prefetch
from django.core.cache import cache
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.throttling import ScopedRateThrottle
from rest_framework import serializers
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from deliverables.models import PreDeliverableItem
from departments.models import Department
from departments.serializers import DepartmentSerializer
from people.models import Person
from people.services import CapacityAnalysisService
from skills.models import PersonSkill
from assignments.models import Assignment
from assignments.analytics import _python_role_capacity
from projects.models import Project
from core.cache_keys import build_aggregate_cache_key


class DepartmentsOverviewThrottle(ScopedRateThrottle):
    scope = 'reports_departments_overview'


class DepartmentsOverviewView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [DepartmentsOverviewThrottle]

    _BOOLEAN_TRUE = {'1', 'true', 'yes', 'on'}
    _CACHE_STATE_HEADER = 'X-Overview-Cache'

    def _parse_bool(self, raw: str | None, default: bool = False) -> bool:
        if raw is None:
            return default
        return str(raw).strip().lower() in self._BOOLEAN_TRUE

    def _parse_int(self, raw: str | None, default: int | None = None) -> int | None:
        if raw in (None, ''):
            return default
        try:
            return int(raw)
        except Exception:
            return default

    def _parse_status_in(self, raw: str | None) -> set[str] | None:
        if raw in (None, ''):
            return None
        tokens = {tok.strip().lower() for tok in str(raw).split(',') if tok.strip()}
        allowed = {tok for tok in tokens if tok in {'active', 'inactive'}}
        return allowed or None

    def _apply_search(self, queryset, search_raw: str | None):
        if not search_raw:
            return queryset
        tokens = [tok.strip() for tok in search_raw.split() if tok.strip()]
        for token in tokens:
            queryset = queryset.filter(
                Q(name__icontains=token)
                | Q(short_name__icontains=token)
                | Q(manager__name__icontains=token)
            )
        return queryset

    def _expand_department_scope(self, departments_qs, department_id: int | None, include_children: bool) -> list[int]:
        rows = list(departments_qs.values('id', 'parent_department_id'))
        available = {row['id'] for row in rows}
        if department_id is None:
            return sorted(available)
        if department_id not in available:
            return []
        if not include_children:
            return [department_id]
        children_by_parent: dict[int | None, list[int]] = defaultdict(list)
        for row in rows:
            children_by_parent[row['parent_department_id']].append(row['id'])
        output: list[int] = []
        seen: set[int] = set()
        stack = [department_id]
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            output.append(current)
            stack.extend(children_by_parent.get(current, []))
        return sorted(output)

    def _add_partial(
        self,
        partial_failures: list[str],
        errors_by_scope: dict[str, dict[str, str]],
        scope: str,
        *,
        code: str = 'partial_unavailable',
        message: str = 'Data unavailable for this scope.',
    ) -> None:
        if scope in errors_by_scope:
            return
        partial_failures.append(scope)
        errors_by_scope[scope] = {
            'code': code,
            'message': message,
        }

    def _week_keys(self, weeks: int) -> list[str]:
        today = datetime.now().date()
        current_monday = today - timedelta(days=today.weekday())
        return [(current_monday + timedelta(weeks=w)).strftime('%Y-%m-%d') for w in range(weeks)]

    def _setting_int(
        self,
        name: str,
        default: int,
        *,
        min_value: int | None = None,
        max_value: int | None = None,
    ) -> int:
        raw = getattr(settings, name, default)
        try:
            value = int(raw)
        except Exception:
            value = default
        if min_value is not None:
            value = max(min_value, value)
        if max_value is not None:
            value = min(max_value, value)
        return value

    def _cache_keys(self, base_key: str) -> dict[str, str]:
        return {
            'fresh': f'{base_key}:fresh',
            'stale': f'{base_key}:stale',
            'lock': f'{base_key}:lock',
        }

    def _respond(self, payload: dict, cache_state: str | None = None) -> Response:
        resp = Response(payload)
        if cache_state:
            resp[self._CACHE_STATE_HEADER] = cache_state
        return resp

    def _deadline_exceeded(self, deadline_at: float, enabled: bool) -> bool:
        if not enabled:
            return False
        return time.monotonic() >= deadline_at

    def _time_left_ms(self, deadline_at: float, enabled: bool) -> int:
        if not enabled:
            return 60_000
        return max(0, int((deadline_at - time.monotonic()) * 1000))

    def _set_statement_timeout(self, timeout_ms: int) -> None:
        # PostgreSQL honors SET LOCAL statement_timeout inside transaction blocks.
        # Unsupported DBs (e.g. sqlite in tests) are ignored.
        if timeout_ms <= 0:
            return
        try:
            with connection.cursor() as cursor:
                cursor.execute('SET LOCAL statement_timeout = %s', [int(timeout_ms)])
        except Exception:
            pass

    def _list_with_timeout(self, queryset, timeout_ms: int):
        with transaction.atomic():
            self._set_statement_timeout(timeout_ms)
            return list(queryset)

    @extend_schema(
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks to aggregate (1-12).'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Optional vertical id filter.'),
            OpenApiParameter(name='department', type=int, required=False, description='Optional department id filter.'),
            OpenApiParameter(name='include_children', type=bool, required=False, description='When department is set, include descendant departments.'),
            OpenApiParameter(name='include_inactive', type=bool, required=False, description='Include inactive departments/people.'),
            OpenApiParameter(name='status_in', type=str, required=False, description='CSV person status filter: active,inactive.'),
            OpenApiParameter(name='search', type=str, required=False, description='Tokenized department search.'),
        ],
    )
    def get(self, request):
        weeks = self._parse_int(request.query_params.get('weeks'), 4) or 4
        weeks = max(1, min(12, weeks))
        vertical = self._parse_int(request.query_params.get('vertical'), None)
        department = self._parse_int(request.query_params.get('department'), None)
        include_children = self._parse_bool(request.query_params.get('include_children'), False)
        include_inactive = self._parse_bool(request.query_params.get('include_inactive'), False)
        status_in = self._parse_status_in(request.query_params.get('status_in'))
        search = (request.query_params.get('search') or '').strip()

        endpoint_deadline_ms = self._setting_int(
            'REPORTS_DEPARTMENTS_OVERVIEW_DEADLINE_MS',
            4000,
            min_value=0,
        )
        query_timeout_ms = self._setting_int(
            'REPORTS_DEPARTMENTS_OVERVIEW_SUBQUERY_TIMEOUT_MS',
            1500,
            min_value=50,
        )
        deadline_enabled = True
        deadline_at = time.monotonic() + (max(0, endpoint_deadline_ms) / 1000.0)

        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_keys: dict[str, str] | None = None
        lock_acquired = False
        stale_payload: dict | None = None
        if use_cache:
            try:
                cache_key = build_aggregate_cache_key(
                    'reports.departments.overview',
                    request,
                    filters={
                        'weeks': weeks,
                        'vertical': vertical if vertical is not None else 'all',
                        'department': department if department is not None else 'all',
                        'include_children': 1 if include_children else 0,
                        'include_inactive': 1 if include_inactive else 0,
                        'status_in': sorted(status_in) if status_in else [],
                        'search': search or '',
                    },
                )
                cache_keys = self._cache_keys(cache_key)
                cached = cache.get(cache_keys['fresh'])
                if cached is not None:
                    return self._respond(cached, 'fresh')

                stale_payload = cache.get(cache_keys['stale'])
                lock_ttl = self._setting_int(
                    'REPORTS_DEPARTMENTS_OVERVIEW_CACHE_LOCK_SECONDS',
                    10,
                    min_value=1,
                )
                lock_acquired = bool(cache.add(cache_keys['lock'], 1, timeout=lock_ttl))
                if not lock_acquired:
                    if stale_payload is not None:
                        return self._respond(stale_payload, 'stale')
                    # Briefly poll in case another request is currently filling.
                    for _ in range(3):
                        time.sleep(0.05)
                        cached = cache.get(cache_keys['fresh'])
                        if cached is not None:
                            return self._respond(cached, 'fresh')
            except Exception:
                cache_keys = None
                lock_acquired = False

        partial_failures: list[str] = []
        errors_by_scope: dict[str, dict[str, str]] = {}

        departments_base = Department.objects.select_related('manager').order_by('name')
        if not include_inactive:
            departments_base = departments_base.filter(is_active=True)
        if vertical is not None:
            departments_base = departments_base.filter(vertical_id=vertical)

        scope_ids = self._expand_department_scope(departments_base, department, include_children)
        departments_qs = departments_base
        if department is not None:
            departments_qs = departments_qs.filter(id__in=scope_ids)
        departments_qs = self._apply_search(departments_qs, search)
        departments = list(departments_qs)
        department_ids = [d.id for d in departments if d.id is not None]
        serialized_departments = DepartmentSerializer(departments, many=True).data

        overview_by_department: dict[str, dict] = {}
        analytics_series: dict[str, list] = {
            'utilizationByDepartment': [],
            'assignmentsByDepartment': [],
            'peopleByDepartment': [],
            'utilizationTimelineByDepartment': [],
        }

        if department_ids:
            if self._deadline_exceeded(deadline_at, deadline_enabled):
                self._add_partial(
                    partial_failures,
                    errors_by_scope,
                    'aggregate',
                    code='deadline_exceeded',
                    message='Request deadline exceeded before aggregate queries completed.',
                )
            else:
                people_qs = Person.objects.filter(department_id__in=department_ids).only(
                    'id',
                    'department_id',
                    'weekly_capacity',
                    'is_active',
                )
                if status_in == {'active'}:
                    people_qs = people_qs.filter(is_active=True)
                elif status_in == {'inactive'}:
                    people_qs = people_qs.filter(is_active=False)
                elif not include_inactive:
                    people_qs = people_qs.filter(is_active=True)

                people_timeout = min(
                    query_timeout_ms,
                    max(50, self._time_left_ms(deadline_at, deadline_enabled)),
                )
                try:
                    people = self._list_with_timeout(people_qs, people_timeout)
                except Exception:
                    people = []
                    self._add_partial(
                        partial_failures,
                        errors_by_scope,
                        'people',
                        message='People aggregation is partially unavailable.',
                    )
                people_ids = [p.id for p in people if p.id is not None]

                people_count_by_department: dict[int, int] = defaultdict(int)
                team_capacity_by_department: dict[int, float] = defaultdict(float)
                for person_obj in people:
                    dept_id = person_obj.department_id
                    if dept_id is None:
                        continue
                    people_count_by_department[dept_id] += 1
                    team_capacity_by_department[dept_id] += float(person_obj.weekly_capacity or 0)

                assignments_by_department: dict[int, int] = defaultdict(int)
                if people_ids:
                    if self._deadline_exceeded(deadline_at, deadline_enabled):
                        self._add_partial(
                            partial_failures,
                            errors_by_scope,
                            'assignments',
                            code='deadline_exceeded',
                            message='Assignments aggregation exceeded the endpoint deadline.',
                        )
                    else:
                        try:
                            assignment_rows_qs = (
                                Assignment.objects.filter(is_active=True, person_id__in=people_ids)
                                .values('person__department_id')
                                .annotate(total=Count('id'))
                            )
                            assignment_timeout = min(
                                query_timeout_ms,
                                max(50, self._time_left_ms(deadline_at, deadline_enabled)),
                            )
                            assignment_rows = self._list_with_timeout(assignment_rows_qs, assignment_timeout)
                            for row in assignment_rows:
                                dept_id = row.get('person__department_id')
                                if dept_id is None:
                                    continue
                                assignments_by_department[int(dept_id)] = int(row.get('total') or 0)
                        except Exception:
                            self._add_partial(
                                partial_failures,
                                errors_by_scope,
                                'assignments',
                                message='Assignments aggregation is partially unavailable.',
                            )

                utilization_sum_by_department: dict[int, float] = defaultdict(float)
                utilization_count_by_department: dict[int, int] = defaultdict(int)
                peak_utilization_by_department: dict[int, float] = defaultdict(float)
                overallocated_by_department: dict[int, int] = defaultdict(int)
                week_keys = self._week_keys(weeks)
                person_week_totals: dict[int, dict[str, float]] = defaultdict(lambda: {wk: 0.0 for wk in week_keys})

                if people_ids:
                    if self._deadline_exceeded(deadline_at, deadline_enabled):
                        self._add_partial(
                            partial_failures,
                            errors_by_scope,
                            'utilization',
                            code='deadline_exceeded',
                            message='Utilization aggregation exceeded the endpoint deadline.',
                        )
                    else:
                        try:
                            assignment_hours_qs = Assignment.objects.filter(
                                is_active=True,
                                person_id__in=people_ids,
                            ).values('person_id', 'weekly_hours')
                            util_timeout = min(
                                query_timeout_ms,
                                max(50, self._time_left_ms(deadline_at, deadline_enabled)),
                            )
                            assignment_hours_rows = self._list_with_timeout(assignment_hours_qs, util_timeout)
                            for row in assignment_hours_rows:
                                person_id = row.get('person_id')
                                if person_id is None:
                                    continue
                                weekly_hours = row.get('weekly_hours') or {}
                                if not isinstance(weekly_hours, dict):
                                    continue
                                for week_key in week_keys:
                                    try:
                                        hours_val = float(weekly_hours.get(week_key) or 0)
                                    except Exception:
                                        hours_val = 0.0
                                    if hours_val <= 0:
                                        # Tolerate nearby keys to match legacy data shape.
                                        try:
                                            base_date = datetime.strptime(week_key, '%Y-%m-%d').date()
                                            for offset in range(-3, 4):
                                                alt_key = (base_date + timedelta(days=offset)).strftime('%Y-%m-%d')
                                                try:
                                                    alt_val = float(weekly_hours.get(alt_key) or 0)
                                                except Exception:
                                                    alt_val = 0.0
                                                if alt_val > 0:
                                                    hours_val = alt_val
                                                    break
                                        except Exception:
                                            hours_val = 0.0
                                    if hours_val > 0:
                                        person_week_totals[int(person_id)][week_key] += hours_val
                        except Exception:
                            self._add_partial(
                                partial_failures,
                                errors_by_scope,
                                'utilization',
                                message='Utilization aggregation is partially unavailable.',
                            )

                for person_obj in people:
                    dept_id = person_obj.department_id
                    if dept_id is None or person_obj.id is None:
                        continue
                    capacity = float(person_obj.weekly_capacity or 0)
                    totals = person_week_totals.get(person_obj.id, {wk: 0.0 for wk in week_keys})
                    avg_hours = (sum(totals.values()) / weeks) if weeks > 0 else 0.0
                    peak_hours = max(totals.values()) if totals else 0.0
                    avg_utilization = (avg_hours / capacity * 100.0) if capacity > 0 else 0.0
                    peak_utilization = (peak_hours / capacity * 100.0) if capacity > 0 else 0.0
                    utilization_sum_by_department[dept_id] += avg_utilization
                    utilization_count_by_department[dept_id] += 1
                    peak_utilization_by_department[dept_id] = max(
                        peak_utilization_by_department[dept_id],
                        peak_utilization,
                    )
                    if avg_hours > capacity:
                        overallocated_by_department[dept_id] += 1

                skills_counter_by_department: dict[int, Counter[str]] = defaultdict(Counter)
                total_skills_by_department: dict[int, int] = defaultdict(int)
                skill_gaps_by_department: dict[int, list[str]] = defaultdict(list)
                if people_ids:
                    if self._deadline_exceeded(deadline_at, deadline_enabled):
                        self._add_partial(
                            partial_failures,
                            errors_by_scope,
                            'skills',
                            code='deadline_exceeded',
                            message='Skills aggregation exceeded the endpoint deadline.',
                        )
                    else:
                        try:
                            skill_rows_qs = (
                                PersonSkill.objects.filter(person_id__in=people_ids, skill_type='strength')
                                .values('person__department_id', 'skill_tag__name')
                                .annotate(total=Count('id'))
                            )
                            skills_timeout = min(
                                query_timeout_ms,
                                max(50, self._time_left_ms(deadline_at, deadline_enabled)),
                            )
                            skill_rows = self._list_with_timeout(skill_rows_qs, skills_timeout)
                            for row in skill_rows:
                                dept_id = row.get('person__department_id')
                                if dept_id is None:
                                    continue
                                skill_name = row.get('skill_tag__name') or 'Unknown'
                                count = int(row.get('total') or 0)
                                skills_counter_by_department[int(dept_id)][skill_name] += count
                                total_skills_by_department[int(dept_id)] += count

                            all_skill_names: set[str] = set()
                            for counter in skills_counter_by_department.values():
                                all_skill_names.update(counter.keys())
                            for dept_id, counter in skills_counter_by_department.items():
                                own = set(counter.keys())
                                gaps = sorted(all_skill_names - own)[:3]
                                skill_gaps_by_department[dept_id] = gaps
                        except Exception:
                            self._add_partial(
                                partial_failures,
                                errors_by_scope,
                                'skills',
                                message='Skills aggregation is partially unavailable.',
                            )

                if self._deadline_exceeded(deadline_at, deadline_enabled):
                    self._add_partial(
                        partial_failures,
                        errors_by_scope,
                        'analytics',
                        code='deadline_exceeded',
                        message='Analytics timeline generation exceeded the endpoint deadline.',
                    )

                for dept in departments:
                    dept_id = dept.id
                    if dept_id is None:
                        continue
                    people_count = int(people_count_by_department.get(dept_id, 0))
                    util_count = int(utilization_count_by_department.get(dept_id, 0))
                    avg_util = round(
                        utilization_sum_by_department.get(dept_id, 0.0) / util_count,
                        1,
                    ) if util_count > 0 else 0.0
                    peak_util = round(float(peak_utilization_by_department.get(dept_id, 0.0)), 1)
                    total_assignments = int(assignments_by_department.get(dept_id, 0))
                    overallocated_count = int(overallocated_by_department.get(dept_id, 0))
                    team_capacity = float(team_capacity_by_department.get(dept_id, 0.0))
                    available_hours = max(0.0, team_capacity - (team_capacity * avg_util / 100.0))
                    skills_counter = skills_counter_by_department.get(dept_id, Counter())
                    top_skills = [
                        {'name': name, 'count': count}
                        for name, count in skills_counter.most_common(5)
                    ]
                    timeline = []
                    if 'analytics' not in errors_by_scope:
                        totals_by_week = defaultdict(float)
                        for person_obj in people:
                            if person_obj.department_id != dept_id or person_obj.id is None:
                                continue
                            per_week = person_week_totals.get(person_obj.id, {})
                            for week_key in week_keys:
                                totals_by_week[week_key] += float(per_week.get(week_key) or 0.0)
                        for week_key in week_keys:
                            allocated = float(totals_by_week.get(week_key) or 0.0)
                            utilization_pct = (allocated / team_capacity * 100.0) if team_capacity > 0 else 0.0
                            timeline.append({
                                'weekKey': week_key,
                                'allocatedHours': round(allocated, 1),
                                'utilization': round(utilization_pct, 1),
                            })

                    overview_by_department[str(dept_id)] = {
                        'peopleCount': people_count,
                        'skills': {
                            'totalSkills': int(total_skills_by_department.get(dept_id, 0)),
                            'topSkills': top_skills,
                            'uniqueSkills': int(len(skills_counter.keys())),
                            'skillGaps': skill_gaps_by_department.get(dept_id, []),
                        },
                        'dashboardSummary': {
                            'avgUtilization': avg_util,
                            'peakUtilization': peak_util,
                            'totalAssignments': total_assignments,
                            'overallocatedCount': overallocated_count,
                            'availableHours': round(available_hours, 1),
                        },
                        'analytics': {
                            'utilizationTimeline': timeline,
                        },
                    }

                    analytics_series['utilizationByDepartment'].append({
                        'departmentId': dept_id,
                        'avgUtilization': avg_util,
                    })
                    analytics_series['assignmentsByDepartment'].append({
                        'departmentId': dept_id,
                        'totalAssignments': total_assignments,
                    })
                    analytics_series['peopleByDepartment'].append({
                        'departmentId': dept_id,
                        'peopleCount': people_count,
                    })
                    analytics_series['utilizationTimelineByDepartment'].append({
                        'departmentId': dept_id,
                        'series': overview_by_department[str(dept_id)]['analytics']['utilizationTimeline'],
                    })

        payload = {
            'contractVersion': 1,
            'partialFailures': partial_failures,
            'errorsByScope': errors_by_scope,
            'departments': serialized_departments,
            'overviewByDepartment': overview_by_department,
            'analyticsSeries': analytics_series,
        }

        if use_cache and cache_keys:
            try:
                ttl_base = self._setting_int('AGGREGATE_CACHE_TTL', 30, min_value=1)
                jitter = self._setting_int(
                    'REPORTS_DEPARTMENTS_OVERVIEW_CACHE_TTL_JITTER_SECONDS',
                    5,
                    min_value=0,
                )
                swr_seconds = self._setting_int(
                    'REPORTS_DEPARTMENTS_OVERVIEW_CACHE_STALE_SECONDS',
                    120,
                    min_value=1,
                )
                fresh_ttl = max(1, ttl_base + random.randint(-jitter, jitter))
                stale_ttl = max(fresh_ttl + 1, fresh_ttl + swr_seconds)
                cache.set(cache_keys['fresh'], payload, timeout=fresh_ttl)
                cache.set(cache_keys['stale'], payload, timeout=stale_ttl)
            except Exception:
                pass
            finally:
                if lock_acquired:
                    try:
                        cache.delete(cache_keys['lock'])
                    except Exception:
                        pass

        return self._respond(payload, 'generated')


class RoleCapacityBootstrapView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(name='department', type=int, required=False, description='Optional department id filter.'),
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of future weeks (4,8,12,16,20). Default 12.'),
            OpenApiParameter(name='role_ids', type=str, required=False, description='Optional CSV of role ids to include.'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Optional vertical id filter.'),
            OpenApiParameter(name='include_inactive', type=bool, required=False, description='Include inactive departments in department metadata list.'),
        ],
    )
    def get(self, request):
        dept_id = None
        raw_department = request.query_params.get('department')
        if raw_department not in (None, ''):
            try:
                dept_id = int(raw_department)
            except Exception:
                return Response({'detail': 'invalid department'}, status=400)

        vertical_id = None
        raw_vertical = request.query_params.get('vertical')
        if raw_vertical not in (None, ''):
            try:
                vertical_id = int(raw_vertical)
            except Exception:
                return Response({'detail': 'invalid vertical'}, status=400)

        try:
            weeks = int(request.query_params.get('weeks', 12))
        except Exception:
            weeks = 12
        if weeks not in (4, 8, 12, 16, 20):
            weeks = 12

        include_inactive = str(request.query_params.get('include_inactive') or '').strip().lower() in {'1', 'true', 'yes', 'on'}

        role_ids_param = str(request.query_params.get('role_ids') or '').strip()
        role_ids = None
        if role_ids_param:
            try:
                role_ids = [int(item) for item in role_ids_param.split(',') if item.strip().isdigit()]
            except Exception:
                role_ids = []

        today = _date.today()
        days_since_sunday = (today.weekday() + 1) % 7
        start_sunday = today if days_since_sunday == 0 else (today - timedelta(days=days_since_sunday))
        week_keys = [start_sunday + timedelta(days=7 * idx) for idx in range(weeks)]
        wk_strs, roles_payload, series = _python_role_capacity(
            dept_id=dept_id,
            week_keys=week_keys,
            role_ids=role_ids,
            vertical_id=vertical_id,
        )

        departments_qs = Department.objects.order_by('name')
        if not include_inactive:
            departments_qs = departments_qs.filter(is_active=True)
        if vertical_id is not None:
            departments_qs = departments_qs.filter(vertical_id=vertical_id)
        departments_payload = DepartmentSerializer(list(departments_qs), many=True).data

        return Response({
            'roles': roles_payload,
            'departments': departments_payload,
            'timeline': {
                'weekKeys': wk_strs,
                'series': series,
            },
        })


class ForecastBootstrapView(APIView):
    permission_classes = [IsAuthenticated]

    _BOOLEAN_TRUE = {'1', 'true', 'yes', 'on'}

    @extend_schema(
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of future weeks. Default 8.'),
            OpenApiParameter(name='department', type=int, required=False, description='Optional department id filter.'),
            OpenApiParameter(name='include_children', type=bool, required=False, description='Include descendant departments when department is set.'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Optional vertical id filter.'),
        ],
    )
    def get(self, request):
        user = getattr(request, 'user', None)
        if not user or not user.is_staff:
            return Response({'detail': 'forbidden'}, status=403)

        try:
            weeks = int(request.query_params.get('weeks', 8))
        except Exception:
            weeks = 8
        weeks = max(1, min(20, weeks))

        department_id = None
        raw_department = request.query_params.get('department')
        if raw_department not in (None, ''):
            try:
                department_id = int(raw_department)
            except Exception:
                return Response({'detail': 'invalid department'}, status=400)

        vertical_id = None
        raw_vertical = request.query_params.get('vertical')
        if raw_vertical not in (None, ''):
            try:
                vertical_id = int(raw_vertical)
            except Exception:
                return Response({'detail': 'invalid vertical'}, status=400)

        include_children = str(request.query_params.get('include_children') or '').strip().lower() in self._BOOLEAN_TRUE

        departments_qs = Department.objects.filter(is_active=True).order_by('name')
        if vertical_id is not None:
            departments_qs = departments_qs.filter(vertical_id=vertical_id)
        departments_payload = DepartmentSerializer(list(departments_qs), many=True).data

        projects_qs = Project.objects.filter(is_active=True).order_by('name')
        if vertical_id is not None:
            projects_qs = projects_qs.filter(vertical_id=vertical_id)
        projects_payload = [
            {
                'id': project.id,
                'name': project.name,
            }
            for project in projects_qs.only('id', 'name')
        ]

        people_qs = Person.objects.filter(is_active=True)
        cache_scope = 'all'
        if department_id is not None:
            if include_children:
                ids = set()
                stack = [department_id]
                while stack:
                    current = stack.pop()
                    if current in ids:
                        continue
                    ids.add(current)
                    for child_id in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                        if child_id not in ids:
                            stack.append(child_id)
                people_qs = people_qs.filter(department_id__in=list(ids))
                cache_scope = f'dept_{department_id}_children'
            else:
                people_qs = people_qs.filter(department_id=department_id)
                cache_scope = f'dept_{department_id}'
        if vertical_id is not None:
            people_qs = people_qs.filter(department__vertical_id=vertical_id)
            cache_scope = f'{cache_scope}_v{vertical_id}'

        assignments_qs = Assignment.objects.filter(is_active=True)
        if vertical_id is not None:
            assignments_qs = assignments_qs.filter(project__vertical_id=vertical_id)
        assignments_qs = assignments_qs.only('weekly_hours', 'person_id')
        people_qs = people_qs.prefetch_related(Prefetch('assignments', queryset=assignments_qs))
        workload_forecast = CapacityAnalysisService.get_workload_forecast(people_qs, weeks, cache_scope=cache_scope)

        return Response({
            'departments': departments_payload,
            'projects': projects_payload,
            'workloadForecast': workload_forecast,
        })


class PreDeliverableCompletionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses=inline_serializer(
            name='PreDeliverableCompletionResponse',
            fields={
                'total': serializers.IntegerField(),
                'completed': serializers.IntegerField(),
                'overdue': serializers.IntegerField(),
                'completionRate': serializers.FloatField(),
                'byProject': inline_serializer(
                    name='PreDeliverableCompletionByProject',
                    fields={
                        'projectId': serializers.IntegerField(allow_null=True),
                        'projectName': serializers.CharField(allow_null=True, required=False),
                        'total': serializers.IntegerField(),
                        'completed': serializers.IntegerField(),
                        'overdue': serializers.IntegerField(),
                        'completionRate': serializers.FloatField(),
                    },
                    many=True,
                ),
                'byType': inline_serializer(
                    name='PreDeliverableCompletionByType',
                    fields={
                        'typeId': serializers.IntegerField(allow_null=True),
                        'typeName': serializers.CharField(allow_null=True, required=False),
                        'total': serializers.IntegerField(),
                        'completed': serializers.IntegerField(),
                        'overdue': serializers.IntegerField(),
                        'completionRate': serializers.FloatField(),
                    },
                    many=True,
                ),
            },
        )
    )
    def get(self, request):
        start = request.query_params.get('date_from')
        end = request.query_params.get('date_to')
        project_id = request.query_params.get('project_id')
        type_id = request.query_params.get('type_id')

        qs = PreDeliverableItem.objects.select_related('deliverable', 'pre_deliverable_type', 'deliverable__project')
        if start:
            d = parse_date(start)
            if d:
                qs = qs.filter(generated_date__gte=d)
        if end:
            d = parse_date(end)
            if d:
                qs = qs.filter(generated_date__lte=d)
        if project_id:
            try:
                qs = qs.filter(deliverable__project_id=int(project_id))
            except ValueError:  # nosec B110
                pass
        if type_id:
            try:
                qs = qs.filter(pre_deliverable_type_id=int(type_id))
            except ValueError:  # nosec B110
                pass

        agg = qs.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(is_completed=True)),
            overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
        )
        total = int(agg.get('total') or 0)
        completed = int(agg.get('completed') or 0)
        overdue = int(agg.get('overdue') or 0)

        proj_rows = (
            qs.values('deliverable__project_id', 'deliverable__project__name')
            .annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(is_completed=True)),
                overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
            )
            .order_by('deliverable__project__name')
        )
        by_project = []
        for r in proj_rows:
            t = int(r['total'] or 0)
            c = int(r['completed'] or 0)
            o = int(r['overdue'] or 0)
            rate = round((c / t * 100.0), 1) if t else 0.0
            by_project.append({
                'projectId': r['deliverable__project_id'],
                'projectName': r['deliverable__project__name'],
                'total': t,
                'completed': c,
                'overdue': o,
                'completionRate': rate,
            })

        type_rows = (
            qs.values('pre_deliverable_type_id', 'pre_deliverable_type__name')
            .annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(is_completed=True)),
                overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
            )
            .order_by('pre_deliverable_type__name')
        )
        by_type = []
        for r in type_rows:
            t = int(r['total'] or 0)
            c = int(r['completed'] or 0)
            o = int(r['overdue'] or 0)
            rate = round((c / t * 100.0), 1) if t else 0.0
            by_type.append({
                'typeId': r['pre_deliverable_type_id'],
                'typeName': r['pre_deliverable_type__name'],
                'total': t,
                'completed': c,
                'overdue': o,
                'completionRate': rate,
            })

        data = {
            'total': total,
            'completed': completed,
            'overdue': overdue,
            'completionRate': round((completed / total * 100.0), 1) if total else 0.0,
            'byProject': by_project,
            'byType': by_type,
        }
        return Response(data)


class PreDeliverableTeamPerformanceView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    @extend_schema(
        responses=inline_serializer(
            name='PreDeliverableTeamPerformanceResponse',
            fields={
                'people': inline_serializer(
                    name='PreDeliverableTeamPerformancePerson',
                    fields={
                        'personId': serializers.IntegerField(allow_null=True),
                        'personName': serializers.CharField(allow_null=True, required=False),
                        'assignedItems': serializers.IntegerField(),
                        'completedItems': serializers.IntegerField(),
                        'overdueItems': serializers.IntegerField(),
                        'completionRate': serializers.FloatField(),
                    },
                    many=True,
                ),
            },
        )
    )
    def get(self, request):
        start = request.query_params.get('date_from')
        end = request.query_params.get('date_to')
        qs = PreDeliverableItem.objects.select_related('deliverable').all()
        if start:
            d = parse_date(start)
            if d:
                qs = qs.filter(generated_date__gte=d)
        if end:
            d = parse_date(end)
            if d:
                qs = qs.filter(generated_date__lte=d)
        rows = (
            qs.filter(deliverable__assignments__is_active=True)
            .values('deliverable__assignments__person_id', 'deliverable__assignments__person__name')
            .annotate(
                assigned=Count('id'),
                completed=Count('id', filter=Q(is_completed=True)),
                overdue=Count('id', filter=Q(is_completed=False, generated_date__lt=_date.today())),
            )
            .order_by('deliverable__assignments__person__name')
        )
        people = []
        for r in rows:
            a = int(r['assigned'] or 0)
            c = int(r['completed'] or 0)
            o = int(r['overdue'] or 0)
            rate = round((c / a * 100.0), 1) if a else 0.0
            people.append({
                'personId': r['deliverable__assignments__person_id'],
                'personName': r['deliverable__assignments__person__name'],
                'assignedItems': a,
                'completedItems': c,
                'overdueItems': o,
                'completionRate': rate,
            })
        return Response({'people': people})
