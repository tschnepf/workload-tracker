from __future__ import annotations

import hashlib
from collections import defaultdict
from datetime import date, timedelta
from itertools import combinations
from typing import Any

from django.db.models import Count, Max, Min, Q, Sum
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers

from accounts.permissions import IsAdminOrManager
from assignments.models import WeeklyAssignmentSnapshot
from core.departments import get_descendant_department_ids
from core.models import NetworkGraphSettings
from core.week_utils import sunday_of_week
from projects.models import Project


class NetworkGraphThrottle(ScopedRateThrottle):
    scope = 'snapshots'


class _NetworkGraphBaseView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrManager]
    throttle_classes = [NetworkGraphThrottle]
    _TRUE = {'1', 'true', 'yes', 'on'}

    def _parse_bool(self, raw: str | None, default: bool = False) -> bool:
        if raw in (None, ''):
            return default
        return str(raw).strip().lower() in self._TRUE

    def _parse_int(self, raw: str | None, default: int | None = None) -> int | None:
        if raw in (None, ''):
            return default
        try:
            return int(raw)
        except Exception:
            return default

    def _parse_week_date(self, raw: str | None) -> date | None:
        if raw in (None, ''):
            return None
        try:
            parsed = parse_date(str(raw))
        except Exception:
            return None
        if parsed is None:
            return None
        return sunday_of_week(parsed)

    def _validate_week_date_raw(self, raw: str | None, *, field_name: str) -> str | None:
        if raw in (None, ''):
            return None
        try:
            parsed = parse_date(str(raw))
        except Exception:
            parsed = None
        if parsed is None:
            return f'{field_name} must be a valid date in YYYY-MM-DD format.'
        return None

    def _client_node_id(self, client_name: str) -> str:
        digest = hashlib.sha1(client_name.encode('utf-8')).hexdigest()[:12]
        return f'client:{digest}'

    def _serialize_settings(self, obj: NetworkGraphSettings) -> dict[str, Any]:
        omitted_ids = [int(v) for v in (obj.omitted_project_ids or []) if str(v).isdigit()]
        omitted_rows = list(Project.objects.filter(id__in=omitted_ids).values('id', 'name'))
        omitted_name_by_id = {int(r['id']): (r.get('name') or f"Project {r['id']}") for r in omitted_rows}
        omitted_projects = [{'id': pid, 'name': omitted_name_by_id[pid]} for pid in omitted_ids if pid in omitted_name_by_id]
        return {
            'defaultWindowMonths': int(obj.default_window_months),
            'coworkerProjectWeight': float(obj.coworker_project_weight),
            'coworkerWeekWeight': float(obj.coworker_week_weight),
            'coworkerMinScore': float(obj.coworker_min_score),
            'clientProjectWeight': float(obj.client_project_weight),
            'clientWeekWeight': float(obj.client_week_weight),
            'clientMinScore': float(obj.client_min_score),
            'includeInactiveDefault': bool(obj.include_inactive_default),
            'maxEdgesDefault': int(obj.max_edges_default),
            'snapshotSchedulerEnabled': bool(obj.snapshot_scheduler_enabled),
            'snapshotSchedulerDay': int(obj.snapshot_scheduler_day),
            'snapshotSchedulerHour': int(obj.snapshot_scheduler_hour),
            'snapshotSchedulerMinute': int(obj.snapshot_scheduler_minute),
            'snapshotSchedulerTimezone': obj.snapshot_scheduler_timezone,
            'omittedProjectIds': omitted_ids,
            'omittedProjects': omitted_projects,
            'lastSnapshotWeekStart': obj.last_snapshot_week_start.isoformat() if obj.last_snapshot_week_start else None,
            'updatedAt': obj.updated_at.isoformat() if obj.updated_at else None,
        }

    def _resolve_window(
        self,
        *,
        start_raw: str | None,
        end_raw: str | None,
        default_window_months: int,
    ) -> tuple[date, date, list[str], str | None]:
        warnings: list[str] = []
        today_sunday = sunday_of_week(date.today())
        end_week = self._parse_week_date(end_raw) or today_sunday

        start_week = self._parse_week_date(start_raw)
        if start_week is None:
            start_week = end_week - timedelta(days=max(1, int(default_window_months)) * 30)
            start_week = sunday_of_week(start_week)
        if start_week > end_week:
            return start_week, end_week, warnings, 'start must be earlier than or equal to end.'
        return start_week, end_week, warnings, None

    def _base_queryset(
        self,
        *,
        settings_obj: NetworkGraphSettings,
        start_week: date,
        end_week: date,
        vertical_id: int | None,
        department_id: int | None,
        include_children: bool,
        include_inactive: bool,
        client_name: str | None,
    ):
        qs = WeeklyAssignmentSnapshot.objects.filter(week_start__gte=start_week, week_start__lte=end_week)
        omitted_project_ids = [int(v) for v in (settings_obj.omitted_project_ids or []) if str(v).isdigit()]
        if omitted_project_ids:
            qs = qs.exclude(project_id__in=omitted_project_ids)

        if vertical_id is not None:
            qs = qs.filter(project__vertical_id=vertical_id)

        if department_id is not None:
            if include_children:
                dept_ids = get_descendant_department_ids(int(department_id))
                qs = qs.filter(department_id__in=dept_ids)
            else:
                qs = qs.filter(department_id=department_id)

        if not include_inactive:
            # Enforce current active entities by default so inactive people/projects
            # are excluded even if historical snapshots were captured while active.
            qs = qs.filter(person__is_active=True, project__is_active=True)

        if client_name:
            qs = qs.filter(client=client_name)

        return qs

    def _build_project_people(
        self,
        *,
        qs,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int], bool]:
        nodes: dict[str, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []

        rows = (
            qs.filter(person_id__isnull=False, project_id__isnull=False)
            .values('person_id', 'person_name', 'project_id', 'project_name', 'person_is_active', 'project__is_active')
            .annotate(shared_weeks=Count('week_start', distinct=True), total_hours=Sum('hours'))
        )

        for row in rows:
            person_id = int(row['person_id'])
            project_id = int(row['project_id'])
            person_node_id = f'person:{person_id}'
            project_node_id = f'project:{project_id}'

            if person_node_id not in nodes:
                nodes[person_node_id] = {
                    'id': person_node_id,
                    'label': row.get('person_name') or f'Person {person_id}',
                    'type': 'person',
                    'entityId': person_id,
                    'isActive': bool(row.get('person_is_active', True)),
                }
            if project_node_id not in nodes:
                nodes[project_node_id] = {
                    'id': project_node_id,
                    'label': row.get('project_name') or f'Project {project_id}',
                    'type': 'project',
                    'entityId': project_id,
                    'isActive': bool(row.get('project__is_active', True)),
                }

            shared_weeks = int(row.get('shared_weeks') or 0)
            total_hours = round(float(row.get('total_hours') or 0.0), 2)
            edges.append(
                {
                    'id': f'assignment:{person_id}:{project_id}',
                    'source': person_node_id,
                    'target': project_node_id,
                    'type': 'assignment',
                    'score': float(shared_weeks),
                    'metrics': {
                        'sharedWeeksCount': shared_weeks,
                        'totalHours': total_hours,
                    },
                }
            )

        stats = {
            'peopleCount': sum(1 for n in nodes.values() if n['type'] == 'person'),
            'projectsCount': sum(1 for n in nodes.values() if n['type'] == 'project'),
            'clientsCount': 0,
        }
        return list(nodes.values()), edges, stats, False

    def _build_coworker(
        self,
        *,
        qs,
        settings_obj: NetworkGraphSettings,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int], bool]:
        pair_metrics: dict[tuple[int, int], dict[str, Any]] = {}
        person_names: dict[int, str] = {}
        person_active: dict[int, bool] = {}

        rows = list(
            qs.filter(person_id__isnull=False, project_id__isnull=False)
            .values('project_id', 'week_start', 'person_id', 'person_name', 'person_is_active')
            .order_by('project_id', 'week_start', 'person_id')
        )

        grouped: dict[tuple[int, date], list[tuple[int, str, bool]]] = defaultdict(list)
        for row in rows:
            project_id = int(row['project_id'])
            week_start = row['week_start']
            person_id = int(row['person_id'])
            person_name = row.get('person_name') or f'Person {person_id}'
            is_active = bool(row.get('person_is_active', True))
            grouped[(project_id, week_start)].append((person_id, person_name, is_active))

        for (project_id, _week_start), items in grouped.items():
            unique_items = {}
            for person_id, person_name, is_active in items:
                unique_items[person_id] = (person_name, is_active)
            person_ids = sorted(unique_items.keys())
            for person_id in person_ids:
                person_name, is_active = unique_items[person_id]
                person_names[person_id] = person_name
                person_active[person_id] = is_active
            if len(person_ids) < 2:
                continue
            for p1, p2 in combinations(person_ids, 2):
                key = (p1, p2)
                metric = pair_metrics.setdefault(
                    key,
                    {
                        'sharedWeeksCount': 0,
                        'projects': set(),
                    },
                )
                metric['sharedWeeksCount'] += 1
                metric['projects'].add(project_id)

        nodes: dict[str, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []
        coworker_project_weight = float(settings_obj.coworker_project_weight)
        coworker_week_weight = float(settings_obj.coworker_week_weight)

        for (p1, p2), metric in pair_metrics.items():
            shared_projects_count = len(metric['projects'])
            shared_weeks_count = int(metric['sharedWeeksCount'])
            score = (coworker_project_weight * shared_projects_count) + (coworker_week_weight * shared_weeks_count)

            n1 = f'person:{p1}'
            n2 = f'person:{p2}'
            if n1 not in nodes:
                nodes[n1] = {
                    'id': n1,
                    'label': person_names.get(p1, f'Person {p1}'),
                    'type': 'person',
                    'entityId': p1,
                    'isActive': bool(person_active.get(p1, True)),
                }
            if n2 not in nodes:
                nodes[n2] = {
                    'id': n2,
                    'label': person_names.get(p2, f'Person {p2}'),
                    'type': 'person',
                    'entityId': p2,
                    'isActive': bool(person_active.get(p2, True)),
                }

            edges.append(
                {
                    'id': f'coworker:{p1}:{p2}',
                    'source': n1,
                    'target': n2,
                    'type': 'coworker',
                    'score': round(float(score), 4),
                    'metrics': {
                        'sharedProjectsCount': shared_projects_count,
                        'sharedWeeksCount': shared_weeks_count,
                    },
                }
            )

        stats = {
            'peopleCount': len(nodes),
            'projectsCount': 0,
            'clientsCount': 0,
        }
        return list(nodes.values()), edges, stats, False

    def _build_client_experience(
        self,
        *,
        qs,
        settings_obj: NetworkGraphSettings,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int], bool]:
        nodes: dict[str, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []

        rows = (
            qs.filter(person_id__isnull=False)
            .exclude(client__isnull=True)
            .exclude(client__exact='')
            .values('person_id', 'person_name', 'person_is_active', 'client')
            .annotate(distinct_projects_count=Count('project_id', distinct=True), distinct_weeks_count=Count('week_start', distinct=True), total_hours=Sum('hours'))
        )

        client_project_weight = float(settings_obj.client_project_weight)
        client_week_weight = float(settings_obj.client_week_weight)

        for row in rows:
            person_id = int(row['person_id'])
            client_name = str(row.get('client') or 'Unknown')
            person_node_id = f'person:{person_id}'
            client_node_id = self._client_node_id(client_name)

            if person_node_id not in nodes:
                nodes[person_node_id] = {
                    'id': person_node_id,
                    'label': row.get('person_name') or f'Person {person_id}',
                    'type': 'person',
                    'entityId': person_id,
                    'isActive': bool(row.get('person_is_active', True)),
                }
            if client_node_id not in nodes:
                nodes[client_node_id] = {
                    'id': client_node_id,
                    'label': client_name,
                    'type': 'client',
                    'entityId': None,
                    'isActive': True,
                }

            distinct_projects_count = int(row.get('distinct_projects_count') or 0)
            distinct_weeks_count = int(row.get('distinct_weeks_count') or 0)
            total_hours = round(float(row.get('total_hours') or 0.0), 2)
            score = (client_project_weight * distinct_projects_count) + (client_week_weight * distinct_weeks_count)

            edges.append(
                {
                    'id': f'client-experience:{person_id}:{client_node_id}',
                    'source': person_node_id,
                    'target': client_node_id,
                    'type': 'client_experience',
                    'score': round(float(score), 4),
                    'metrics': {
                        'distinctProjectsCount': distinct_projects_count,
                        'distinctWeeksCount': distinct_weeks_count,
                        'totalHours': total_hours,
                    },
                }
            )

        stats = {
            'peopleCount': sum(1 for n in nodes.values() if n['type'] == 'person'),
            'projectsCount': 0,
            'clientsCount': sum(1 for n in nodes.values() if n['type'] == 'client'),
        }
        return list(nodes.values()), edges, stats, False


class NetworkBootstrapView(_NetworkGraphBaseView):
    @extend_schema(
        parameters=[
            OpenApiParameter(name='vertical', type=int, required=False),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
        ],
        responses=inline_serializer(
            name='NetworkBootstrapResponse',
            fields={
                'defaults': serializers.DictField(),
                'snapshotBounds': inline_serializer(
                    name='NetworkSnapshotBounds',
                    fields={
                        'minWeekStart': serializers.CharField(allow_null=True),
                        'maxWeekStart': serializers.CharField(allow_null=True),
                        'totalWeeks': serializers.IntegerField(),
                    },
                ),
                'clients': serializers.ListField(child=serializers.CharField()),
                'maxEdgesLimit': serializers.IntegerField(),
            },
        ),
    )
    def get(self, request):
        settings_obj = NetworkGraphSettings.get_active()

        vertical_id = self._parse_int(request.query_params.get('vertical'))
        department_id = self._parse_int(request.query_params.get('department'))
        include_children = self._parse_bool(request.query_params.get('include_children'), False)

        qs = self._base_queryset(
            settings_obj=settings_obj,
            start_week=date(1970, 1, 4),
            end_week=sunday_of_week(date.today()),
            vertical_id=vertical_id,
            department_id=department_id,
            include_children=include_children,
            include_inactive=True,
            client_name=None,
        )

        bounds = qs.aggregate(min_week=Min('week_start'), max_week=Max('week_start'))
        min_week = bounds.get('min_week')
        max_week = bounds.get('max_week')
        total_weeks = 0
        if min_week and max_week:
            total_weeks = int(((max_week - min_week).days // 7) + 1)

        clients = list(
            qs.exclude(client__isnull=True)
            .exclude(client__exact='')
            .values_list('client', flat=True)
            .distinct()
            .order_by('client')[:500]
        )

        payload = {
            'defaults': self._serialize_settings(settings_obj),
            'snapshotBounds': {
                'minWeekStart': min_week.isoformat() if min_week else None,
                'maxWeekStart': max_week.isoformat() if max_week else None,
                'totalWeeks': total_weeks,
            },
            'clients': clients,
            'maxEdgesLimit': 10000,
        }
        return Response(payload)


class NetworkGraphView(_NetworkGraphBaseView):
    @extend_schema(
        parameters=[
            OpenApiParameter(name='mode', type=str, required=False, description='project_people|coworker|client_experience'),
            OpenApiParameter(name='start', type=str, required=False, description='YYYY-MM-DD week date'),
            OpenApiParameter(name='end', type=str, required=False, description='YYYY-MM-DD week date'),
            OpenApiParameter(name='vertical', type=int, required=False),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='include_inactive', type=int, required=False, description='0|1'),
            OpenApiParameter(name='client', type=str, required=False),
            OpenApiParameter(name='max_edges', type=int, required=False),
        ],
        responses=inline_serializer(
            name='NetworkGraphResponse',
            fields={
                'mode': serializers.CharField(),
                'start': serializers.CharField(),
                'end': serializers.CharField(),
                'appliedSettings': serializers.DictField(),
                'nodes': serializers.ListField(child=serializers.DictField()),
                'edges': serializers.ListField(child=serializers.DictField()),
                'stats': serializers.DictField(),
                'snapshotBounds': serializers.DictField(),
                'truncated': serializers.BooleanField(),
                'warnings': serializers.ListField(child=serializers.CharField()),
            },
        ),
    )
    def get(self, request):
        settings_obj = NetworkGraphSettings.get_active()

        mode = (request.query_params.get('mode') or 'project_people').strip().lower()
        if mode not in {'project_people', 'coworker', 'client_experience'}:
            return Response({'error': 'mode must be one of: project_people, coworker, client_experience'}, status=status.HTTP_400_BAD_REQUEST)

        start_raw = request.query_params.get('start')
        end_raw = request.query_params.get('end')
        start_err = self._validate_week_date_raw(start_raw, field_name='start')
        if start_err:
            return Response({'error': start_err}, status=status.HTTP_400_BAD_REQUEST)
        end_err = self._validate_week_date_raw(end_raw, field_name='end')
        if end_err:
            return Response({'error': end_err}, status=status.HTTP_400_BAD_REQUEST)

        start_week, end_week, warnings, range_error = self._resolve_window(
            start_raw=start_raw,
            end_raw=end_raw,
            default_window_months=int(settings_obj.default_window_months),
        )
        if range_error:
            return Response({'error': range_error}, status=status.HTTP_400_BAD_REQUEST)

        vertical_id = self._parse_int(request.query_params.get('vertical'))
        department_id = self._parse_int(request.query_params.get('department'))
        include_children = self._parse_bool(request.query_params.get('include_children'), False)
        include_inactive = self._parse_bool(request.query_params.get('include_inactive'), bool(settings_obj.include_inactive_default))
        client_name = (request.query_params.get('client') or '').strip() or None
        max_edges = self._parse_int(request.query_params.get('max_edges'), int(settings_obj.max_edges_default)) or int(settings_obj.max_edges_default)
        max_edges = max(1, min(10000, int(max_edges)))

        qs = self._base_queryset(
            settings_obj=settings_obj,
            start_week=start_week,
            end_week=end_week,
            vertical_id=vertical_id,
            department_id=department_id,
            include_children=include_children,
            include_inactive=include_inactive,
            client_name=client_name,
        )

        if mode == 'project_people':
            nodes, edges, stats, _ = self._build_project_people(qs=qs)
        elif mode == 'coworker':
            nodes, edges, stats, _ = self._build_coworker(qs=qs, settings_obj=settings_obj)
        else:
            nodes, edges, stats, _ = self._build_client_experience(qs=qs, settings_obj=settings_obj)

        edges_sorted = sorted(edges, key=lambda item: (-float(item.get('score') or 0.0), str(item.get('id') or '')))
        truncated = len(edges_sorted) > max_edges
        if truncated:
            warnings.append(f'Edge list was trimmed to max_edges={max_edges}.')
        edges_trimmed = edges_sorted[:max_edges]

        node_ids = set()
        for edge in edges_trimmed:
            node_ids.add(edge['source'])
            node_ids.add(edge['target'])
        nodes_trimmed = [node for node in nodes if node['id'] in node_ids]

        bounds = WeeklyAssignmentSnapshot.objects.aggregate(min_week=Min('week_start'), max_week=Max('week_start'))
        min_week = bounds.get('min_week')
        max_week = bounds.get('max_week')
        if min_week and start_week < min_week:
            warnings.append(f'Requested start {start_week.isoformat()} is before first snapshot week {min_week.isoformat()}.')
        if max_week and end_week > max_week:
            warnings.append(f'Requested end {end_week.isoformat()} is after latest snapshot week {max_week.isoformat()}.')

        payload = {
            'mode': mode,
            'start': start_week.isoformat(),
            'end': end_week.isoformat(),
            'appliedSettings': {
                'includeInactive': include_inactive,
                'maxEdges': max_edges,
                'coworkerProjectWeight': float(settings_obj.coworker_project_weight),
                'coworkerWeekWeight': float(settings_obj.coworker_week_weight),
                'coworkerMinScore': float(settings_obj.coworker_min_score),
                'clientProjectWeight': float(settings_obj.client_project_weight),
                'clientWeekWeight': float(settings_obj.client_week_weight),
                'clientMinScore': float(settings_obj.client_min_score),
                'defaultWindowMonths': int(settings_obj.default_window_months),
            },
            'nodes': nodes_trimmed,
            'edges': edges_trimmed,
            'stats': {
                **stats,
                'nodesCount': len(nodes_trimmed),
                'edgesCount': len(edges_trimmed),
            },
            'snapshotBounds': {
                'minWeekStart': min_week.isoformat() if min_week else None,
                'maxWeekStart': max_week.isoformat() if max_week else None,
            },
            'truncated': truncated,
            'warnings': warnings,
        }
        return Response(payload)
