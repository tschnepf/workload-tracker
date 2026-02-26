from collections import Counter, defaultdict
from datetime import datetime, date as _date, timedelta
from django.utils.dateparse import parse_date
from django.db.models import Count, Q
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
from skills.models import PersonSkill
from assignments.models import Assignment
from core.cache_keys import build_aggregate_cache_key


class DepartmentsOverviewThrottle(ScopedRateThrottle):
    scope = 'reports_departments_overview'


class DepartmentsOverviewView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [DepartmentsOverviewThrottle]

    _BOOLEAN_TRUE = {'1', 'true', 'yes', 'on'}

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

        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = None
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
                cached = cache.get(cache_key)
                if cached is not None:
                    return Response(cached)
            except Exception:
                cache_key = None

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

            people = list(people_qs)
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
                assignment_rows = (
                    Assignment.objects.filter(is_active=True, person_id__in=people_ids)
                    .values('person__department_id')
                    .annotate(total=Count('id'))
                )
                for row in assignment_rows:
                    dept_id = row.get('person__department_id')
                    if dept_id is None:
                        continue
                    assignments_by_department[int(dept_id)] = int(row.get('total') or 0)

            utilization_sum_by_department: dict[int, float] = defaultdict(float)
            utilization_count_by_department: dict[int, int] = defaultdict(int)
            peak_utilization_by_department: dict[int, float] = defaultdict(float)
            overallocated_by_department: dict[int, int] = defaultdict(int)
            week_keys = self._week_keys(weeks)
            person_week_totals: dict[int, dict[str, float]] = defaultdict(lambda: {wk: 0.0 for wk in week_keys})

            if people_ids:
                try:
                    assignment_hours_rows = Assignment.objects.filter(
                        is_active=True,
                        person_id__in=people_ids,
                    ).values('person_id', 'weekly_hours')
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
                try:
                    skill_rows = (
                        PersonSkill.objects.filter(person_id__in=people_ids, skill_type='strength')
                        .values('person__department_id', 'skill_tag__name')
                        .annotate(total=Count('id'))
                    )
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

        if use_cache and cache_key:
            try:
                ttl = int(getattr(settings, 'AGGREGATE_CACHE_TTL', 30))
            except Exception:
                ttl = 30
            try:
                cache.set(cache_key, payload, timeout=max(1, ttl))
            except Exception:
                pass
        return Response(payload)


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
