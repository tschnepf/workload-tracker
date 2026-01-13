"""
Assignment API Views - Chunk 3
Uses AutoMapped serializers for naming prevention
"""

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from core.etag import ETagConditionalMixin
from drf_spectacular.utils import extend_schema, OpenApiParameter, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import UserRateThrottle, ScopedRateThrottle
from django.db.models import Sum, Max, Prefetch, Value, Count  # noqa: F401
from core.deliverable_phase import build_project_week_classification
from core.choices import DeliverablePhase, MembershipEventType
from django.db.models.functions import Coalesce, Lower
from .models import Assignment
from .analytics import compute_role_capacity
from departments.models import Department
from .serializers import AssignmentSerializer
from people.models import Person
from projects.models import Project  # noqa: F401
from .services import WorkloadRebalancingService
from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponseNotModified
from django.utils.http import http_date
from datetime import date, timedelta
import hashlib
import os
import time
from typing import List, Dict, Tuple, Set
import logging
from roles.models import Role
try:
    from core.tasks import generate_grid_snapshot_async  # type: ignore
except Exception:
    generate_grid_snapshot_async = None  # type: ignore


class HotEndpointThrottle(UserRateThrottle):
    """Special throttle for hot endpoints like conflict checking"""
    scope = 'hot_endpoint'


class GridSnapshotThrottle(ScopedRateThrottle):
    """Throttle for grid snapshot aggregate reads"""
    scope = 'grid_snapshot'


class SnapshotsThrottle(ScopedRateThrottle):
    """Throttle for snapshots/experience read endpoints"""
    scope = 'snapshots'


class AssignmentViewSet(ETagConditionalMixin, viewsets.ModelViewSet):
    """
    Assignment CRUD API with utilization tracking
    Uses AutoMapped serializer for automatic snake_case -> camelCase conversion
    """
    queryset = (
        Assignment.objects.filter(is_active=True, person__is_active=True)
        .select_related('person', 'person__department', 'project', 'department', 'role_on_project_ref')
        .order_by('-created_at')
    )
    serializer_class = AssignmentSerializer
    # Use global default permissions (IsAuthenticated)
    
    def list(self, request, *args, **kwargs):
        """
        Get all assignments with person details and optional project
        filtering.
        """
        queryset = self.get_queryset()

        # Filter by project if specified
        project_id = request.query_params.get('project')
        if project_id:
            try:
                project_id = int(project_id)
                queryset = queryset.filter(project_id=project_id)
            except ValueError:
                return Response({
                    'error': 'Invalid project ID format'
                }, status=status.HTTP_400_BAD_REQUEST)
        # Optional department filter via person.department (with
        # include_children)
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        if dept_param not in (None, ""):
            try:
                dept_id = int(dept_param)
                if include_children:
                    ids = set()
                    stack = [dept_id]
                    while stack:
                        current = stack.pop()
                        if current in ids:
                            continue
                        ids.add(current)
                        for d in (
                            Department.objects
                            .filter(parent_department_id=current)
                            .values_list('id', flat=True)
                        ):
                            if d not in ids:
                                stack.append(d)
                    queryset = queryset.filter(
                        person__department_id__in=list(ids)
                    )
                else:
                    queryset = queryset.filter(person__department_id=dept_id)
            except (TypeError, ValueError):
                # Ignore invalid department filter; return unfiltered
                pass

        # Apply stable DB-level ordering: client asc (nulls last), then project name asc (case-insensitive)
        try:
            queryset = queryset.order_by(
                Coalesce(Lower('project__client'), Value('zzzz_no_client')),
                Lower('project__name'),
            )
        except Exception:
            # Fallback to basic ordering if DB backend lacks functions
            queryset = queryset.order_by('project__client', 'project__name')

        # Compute validators for conditional GET on list
        try:
            aggr = queryset.aggregate(last_modified=Max('updated_at'))
            last_modified = aggr.get('last_modified')
        except Exception:
            last_modified = None
        etag = None
        if last_modified:
            try:
                import hashlib
                etag = hashlib.sha256(last_modified.isoformat().encode()).hexdigest()
            except Exception:
                etag = None

        # If-None-Match / If-Modified-Since handling
        if etag:
            inm = request.META.get('HTTP_IF_NONE_MATCH')
            if inm and inm.strip('"') == etag:
                resp = HttpResponseNotModified()
                resp['ETag'] = f'"{etag}"'
                return resp
        if last_modified:
            ims = request.META.get('HTTP_IF_MODIFIED_SINCE')
            if ims:
                try:
                    from django.utils.http import parse_http_date
                    if_modified_ts = parse_http_date(ims)
                    if int(last_modified.timestamp()) <= if_modified_ts:
                        resp = HttpResponseNotModified()
                        if etag:
                            resp['ETag'] = f'"{etag}"'
                        resp['Last-Modified'] = http_date(last_modified.timestamp())
                        return resp
                except Exception:
                    pass

        # Check if bulk loading is requested (Phase 2 optimization)
        if request.query_params.get('all') == 'true':
            serializer = self.get_serializer(queryset, many=True)
            response = Response(serializer.data)
            if etag:
                response['ETag'] = f'"{etag}"'
            if last_modified:
                response['Last-Modified'] = http_date(last_modified.timestamp())
                response['Cache-Control'] = 'private, max-age=30'
            return response

        serializer = self.get_serializer(queryset, many=True)
        response = Response({
            'results': serializer.data,
            'count': len(serializer.data)
        })
        if etag:
            response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
            response['Cache-Control'] = 'private, max-age=30'
        return response

    @extend_schema(
        description=(
            "Project-centric aggregate snapshot for N weeks ahead (default 12).\n\n"
            "Response shape: { weekKeys: [YYYY-MM-DD], projects: [{id,name,client,status}],\n"
            "hoursByProject: { <projectId>: { <weekKey>: hours } },\n"
            "deliverablesByProjectWeek: { <projectId>: { <weekKey>: count } },\n"
            "hasFutureDeliverablesByProject: { <projectId>: boolean },\n"
            "metrics: { projectsCount, peopleAssignedCount, totalHours } }"
        ),
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks (1-26), default 12'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='status_in', type=str, required=False, description='CSV of project status filters'),
            OpenApiParameter(name='has_future_deliverables', type=int, required=False, description='0|1'),
            OpenApiParameter(name='project_ids', type=str, required=False, description='CSV of project IDs to scope totals (optional)'),
        ],
        responses=inline_serializer(
            name='ProjectGridSnapshotResponse',
            fields={
                'weekKeys': serializers.ListField(child=serializers.CharField()),
                'projects': serializers.ListField(child=inline_serializer(name='ProjectLite', fields={
                    'id': serializers.IntegerField(),
                    'name': serializers.CharField(),
                    'client': serializers.CharField(allow_null=True, required=False),
                    'status': serializers.CharField(allow_null=True, required=False),
                })),
                'hoursByProject': serializers.DictField(child=serializers.DictField(child=serializers.FloatField())),
                'deliverablesByProjectWeek': serializers.DictField(child=serializers.DictField(child=serializers.IntegerField())),
                'deliverableMarkersByProjectWeek': serializers.DictField(
                    child=serializers.DictField(
                        child=serializers.ListField(
                            child=inline_serializer(
                                name='DeliverableMarkerLite',
                                fields={
                                    'type': serializers.CharField(),
                                    'percentage': serializers.IntegerField(required=False, allow_null=True),
                                    'dates': serializers.ListField(
                                        child=serializers.CharField(),
                                        required=False,
                                        allow_empty=True
                                    ),
                                    'description': serializers.CharField(required=False, allow_null=True),
                                    'note': serializers.CharField(required=False, allow_null=True),
                                },
                            )
                        )
                    ),
                    required=False,
                ),
                'hasFutureDeliverablesByProject': serializers.DictField(child=serializers.BooleanField()),
                'metrics': inline_serializer(name='ProjectSnapshotMetrics', fields={
                    'projectsCount': serializers.IntegerField(),
                    'peopleAssignedCount': serializers.IntegerField(),
                    'totalHours': serializers.FloatField(),
                }),
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='project_grid_snapshot', throttle_classes=[GridSnapshotThrottle])
    def project_grid_snapshot(self, request):
        from deliverables.models import Deliverable  # lazy import
        # Cache key based on inputs to avoid recomputation within short TTL
        try:
            cache_key = None
            try:
                # Compose a stable key of params that affect payload
                cache_key = (
                    f"assignments:project_grid_snapshot:"
                    f"w={request.query_params.get('weeks','12')}:"
                    f"d={request.query_params.get('department','')}:"
                    f"c={request.query_params.get('include_children','')}:"
                    f"s={request.query_params.get('status_in','')}:"
                    f"hfd={request.query_params.get('has_future_deliverables','')}:"
                    f"ids={request.query_params.get('project_ids','')}"
                )
            except Exception:
                cache_key = None
            if cache_key:
                cached = cache.get(cache_key)
                if cached:
                    return Response(cached)
        except Exception:
            cache_key = None
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12
        if weeks < 1:
            weeks = 1
        if weeks > 26:
            weeks = 26

        # Department scoping via people of assignments
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        dept_ids = None
        if dept_param not in (None, ""):
            try:
                root = int(dept_param)
                if include_children:
                    ids = set()
                    stack = [root]
                    from departments.models import Department as Dept
                    while stack:
                        current = stack.pop()
                        if current in ids:
                            continue
                        ids.add(current)
                        for d in (Dept.objects.filter(parent_department_id=current).values_list('id', flat=True)):
                            if d not in ids:
                                stack.append(d)
                    dept_ids = list(ids)
                else:
                    dept_ids = [root]
            except Exception:
                dept_ids = None

        # Optional project scoping
        scope_ids = request.query_params.get('project_ids')
        scope_set = None
        if scope_ids:
            try:
                scope_set = set(int(x) for x in scope_ids.split(',') if x.strip().isdigit())
            except Exception:
                scope_set = None

        # Status filter
        status_in = request.query_params.get('status_in')
        status_set = None
        if status_in:
            status_set = set(s.strip().lower() for s in status_in.split(',') if s.strip())

        # Build week key list (Sundays)
        from core.week_utils import sunday_of_week
        today = date.today()
        start_sunday = sunday_of_week(today)
        week_keys = [(start_sunday + timedelta(weeks=i)).isoformat() for i in range(weeks)]

        # Base assignments queryset
        qs = Assignment.objects.filter(is_active=True, person__is_active=True).select_related('project', 'person')
        if dept_ids:
            qs = qs.filter(person__department_id__in=dept_ids)

        # If scope_set provided, restrict to those projects
        if scope_set:
            qs = qs.filter(project_id__in=scope_set)

        # Derive project list respecting status filter later
        # Collect projects encountered in assignments
        project_hours = {}
        people_per_project = {}

        def hours_for_week_from_json(weekly_hours, sunday_key):
            try:
                v = weekly_hours.get(sunday_key)
                return float(v or 0)
            except Exception:
                return 0.0

        # Aggregate hours by project/week and people counts
        for a in qs:
            pid = a.project_id
            if pid is None:
                continue
            project_hours.setdefault(pid, {})
            people_per_project.setdefault(pid, set()).add(a.person_id)
            wh = a.weekly_hours or {}
            for wk in week_keys:
                h = hours_for_week_from_json(wh, wk)
                if h:
                    project_hours[pid][wk] = round(project_hours[pid].get(wk, 0.0) + h, 2)

        # Candidate project ids
        project_ids = list(project_hours.keys()) if project_hours else []

        # Deliverables aggregates (for shading, filters, and per-week markers)
        deliverables_by_week = {}
        has_future_deliverables = {}
        deliverable_markers_by_week = {}
        try:
            deliv_qs = Deliverable.objects.filter(project_id__in=project_ids)
            now = date.today()
            for d in deliv_qs.only('project_id', 'date', 'description', 'percentage', 'notes'):
                pid = d.project_id
                dt = None
                try:
                    if d.date:
                        dt = date.fromisoformat(str(d.date))
                except Exception:
                    dt = None
                if dt is None:
                    continue
                if dt >= now:
                    has_future_deliverables[pid] = True
                # Map deliverable date to Sunday-of-week key
                wk = sunday_of_week(dt).isoformat()
                if wk in week_keys:
                    deliverables_by_week.setdefault(pid, {})
                    deliverables_by_week[pid][wk] = deliverables_by_week[pid].get(wk, 0) + 1
                    # Build markers payload with basic type classification and metadata
                    deliverable_markers_by_week.setdefault(pid, {})
                    markers_for_week = deliverable_markers_by_week[pid].setdefault(wk, [])
                    title = (d.description or "").lower()
                    if "bulletin" in title:
                        marker_type = "bulletin"
                    elif " cd" in f" {title}" or title.startswith("cd "):
                        marker_type = "cd"
                    elif " dd" in f" {title}" or title.startswith("dd "):
                        marker_type = "dd"
                    elif " ifc" in f" {title}" or title.startswith("ifc "):
                        marker_type = "ifc"
                    elif " ifp" in f" {title}" or title.startswith("ifp "):
                        marker_type = "ifp"
                    elif "master" in title and "plan" in title:
                        marker_type = "masterplan"
                    elif " sd" in f" {title}" or title.startswith("sd "):
                        marker_type = "sd"
                    else:
                        marker_type = "milestone"
                    marker = {
                        "type": marker_type,
                        "percentage": d.percentage,
                        "dates": [dt.isoformat()],
                        "description": d.description or None,
                        "note": d.notes or None,
                    }
                    markers_for_week.append(marker)
        except Exception:
            pass

        # Optional filter: has_future_deliverables
        hfd_param = request.query_params.get('has_future_deliverables')
        if hfd_param in ('0', '1'):
            want_true = (hfd_param == '1')
            filtered = []
            for pid in project_ids:
                has = bool(has_future_deliverables.get(pid))
                if has == want_true:
                    filtered.append(pid)
            project_ids = filtered
            # Prune aggregates accordingly
            project_hours = { pid: project_hours[pid] for pid in project_ids if pid in project_hours }
            people_per_project = { pid: people_per_project.get(pid, set()) for pid in project_ids }

        # Build project list from Project model filtered to those IDs, applying status filter
        projects_qs = Project.objects.filter(id__in=project_ids)
        if status_set is not None and len(status_set) > 0:
            projects_qs = projects_qs.filter(status__in=list(status_set))
        projects = list(projects_qs.values('id', 'name', 'client', 'status'))

        # Metrics
        projects_count = len(projects)
        people_assigned = sum(len(s) for s in people_per_project.values())
        total_hours = 0.0
        for pid, wkmap in project_hours.items():
            for _, v in wkmap.items():
                total_hours += float(v or 0)

        payload = {
            'weekKeys': week_keys,
            'projects': projects,
            'hoursByProject': project_hours,
            'deliverablesByProjectWeek': deliverables_by_week,
            'deliverableMarkersByProjectWeek': deliverable_markers_by_week,
            'hasFutureDeliverablesByProject': { str(pid): True for pid in has_future_deliverables.keys() },
            'metrics': {
                'projectsCount': projects_count,
                'peopleAssignedCount': people_assigned,
                'totalHours': round(total_hours, 2),
            }
        }
        try:
            if cache_key:
                cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
        except Exception:
            pass
        return Response(payload)

    @extend_schema(
        description=(
            "Run weekly assignment snapshot writer or backfill for a given Sunday week.\n\n"
            "If 'week' is omitted, uses the current week's Sunday. Add 'backfill=1' to use the"
            " backfill service (optional 'emit_events' and 'force' flags). Returns summary."
        ),
        parameters=[
            OpenApiParameter(name='week', type=str, required=False, description='YYYY-MM-DD (Sunday)'),
            OpenApiParameter(name='backfill', type=bool, required=False, description='Use backfill mode (0|1/true|false)'),
            OpenApiParameter(name='emit_events', type=bool, required=False, description='Backfill: emit joined/left events'),
            OpenApiParameter(name='force', type=bool, required=False, description='Backfill: overwrite existing rows'),
        ],
        responses=inline_serializer(
            name='RunWeeklySnapshotResponse',
            fields={
                'week_start': serializers.CharField(),
                'lock_acquired': serializers.BooleanField(),
                'examined': serializers.IntegerField(required=False),
                'inserted': serializers.IntegerField(required=False),
                'updated': serializers.IntegerField(required=False),
                'skipped': serializers.IntegerField(required=False),
                'events_inserted': serializers.IntegerField(required=False),
                'skipped_due_to_lock': serializers.BooleanField(required=False),
            }
        )
    )
    @action(detail=False, methods=['post'], url_path='run_weekly_snapshot', throttle_classes=[SnapshotsThrottle])
    def run_weekly_snapshot(self, request):
        """Manual trigger for weekly snapshot writer.

        Admins only recommended; returns writer summary.
        """
        # Restrict to staff users
        user = getattr(request, 'user', None)
        if not getattr(user, 'is_staff', False):
            return Response({'detail': 'forbidden'}, status=status.HTTP_403_FORBIDDEN)
        from assignments.snapshot_service import write_weekly_assignment_snapshots, backfill_weekly_assignment_snapshots
        
        def _get_bool(name: str) -> bool:
            raw = request.data.get(name)
            if raw is None:
                raw = request.query_params.get(name)
            if raw is None:
                return False
            s = str(raw).strip().lower()
            return s in ('1', 'true', 't', 'yes', 'y', 'on')
        wk = request.data.get('week') or request.query_params.get('week')
        try:
            if wk:
                d = date.fromisoformat(str(wk))
            else:
                d = date.today()
        except Exception:
            return Response({'detail': 'invalid week'}, status=status.HTTP_400_BAD_REQUEST)
        from core.week_utils import sunday_of_week
        sunday = sunday_of_week(d)
        # Optional backfill mode for initial snapshot seeding
        if _get_bool('backfill'):
            emit_events = _get_bool('emit_events')
            force = _get_bool('force')
            res = backfill_weekly_assignment_snapshots(sunday, emit_events=emit_events, force=force)
        else:
            res = write_weekly_assignment_snapshots(sunday)
        return Response(res)

    @extend_schema(
        description=(
            "Experience by Client: list people with totals and role aggregates in a date window.\n\n"
            "Params: client?, department?, include_children? (0|1), start?, end?, min_weeks?"
        ),
        parameters=[
            OpenApiParameter(name='client', type=str, required=False),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='start', type=str, required=False, description='YYYY-MM-DD'),
            OpenApiParameter(name='end', type=str, required=False, description='YYYY-MM-DD'),
            OpenApiParameter(name='min_weeks', type=int, required=False),
        ],
        responses=inline_serializer(
            name='ExperienceByClientResponse',
            fields={
                'results': serializers.ListField(child=inline_serializer(name='ExperienceByClientPerson', fields={
                    'personId': serializers.IntegerField(),
                    'personName': serializers.CharField(),
                    'departmentId': serializers.IntegerField(required=False, allow_null=True),
                    'totals': inline_serializer(name='EBCPTotals', fields={
                        'weeks': serializers.IntegerField(),
                        'hours': serializers.FloatField(),
                        'projectsCount': serializers.IntegerField(),
                    }),
                    'roles': serializers.DictField(child=inline_serializer(name='EBCPRoleAgg', fields={
                        'roleId': serializers.IntegerField(),
                        'weeks': serializers.IntegerField(),
                        'hours': serializers.FloatField(),
                    })),
                })),
                'count': serializers.IntegerField(),
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='experience_by_client', throttle_classes=[SnapshotsThrottle])
    def experience_by_client(self, request):
        from .models import WeeklyAssignmentSnapshot as WAS
        from core.week_utils import sunday_of_week
        from core.departments import get_descendant_department_ids
        try:
            start = request.query_params.get('start')
            end = request.query_params.get('end')
            start_d = (date.fromisoformat(start) if start else date.today())
            end_d = (date.fromisoformat(end) if end else (date.today() + timedelta(days=7*11)))
            s0 = sunday_of_week(start_d)
            s1 = sunday_of_week(end_d)
        except Exception:
            s0 = sunday_of_week(date.today())
            s1 = sunday_of_week(date.today() + timedelta(days=7*11))
        qs = WAS.objects.all()
        client = request.query_params.get('client')
        if client not in (None, ""):
            qs = qs.filter(client=client)
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        if dept_param not in (None, ""):
            try:
                root = int(dept_param)
                if include_children:
                    ids = get_descendant_department_ids(root)
                    qs = qs.filter(department_id__in=ids)
                else:
                    qs = qs.filter(department_id=root)
            except Exception:
                pass
        qs = qs.filter(week_start__gte=s0, week_start__lte=s1)

        # Validators
        try:
            aggr = qs.aggregate(last_modified=Max('updated_at'))
            last_modified = aggr.get('last_modified')
        except Exception:
            last_modified = None
        etag = None
        if last_modified:
            try:
                etag = hashlib.sha256((str(client or '') + str(s0) + str(s1) + str(dept_param) + str(include_children)).encode()).hexdigest()
            except Exception:
                etag = None
        # Aggregate
        people_map = {}
        for row in qs.values('person_id', 'person_name', 'department_id', 'role_on_project_id').annotate(
            weeks=Count('week_start', distinct=True),
            hours=Sum('hours'),
            projects_count=Count('project_id', distinct=True),
        ):
            pid = row['person_id']
            if pid is None:
                continue
            rec = people_map.setdefault(pid, {
                'personId': pid,
                'personName': row['person_name'] or '',
                'departmentId': row['department_id'],
                'totals': {'weeks': 0, 'hours': 0.0, 'projectsCount': 0},
                'roles': {},
            })
            rec['totals']['weeks'] += int(row['weeks'] or 0)
            rec['totals']['hours'] += float(row['hours'] or 0.0)
            rec['totals']['projectsCount'] = max(rec['totals']['projectsCount'], int(row['projects_count'] or 0))
            rid = row['role_on_project_id']
            if rid is not None:
                r = rec['roles'].setdefault(rid, {'roleId': rid, 'weeks': 0, 'hours': 0.0})
                r['weeks'] += int(row['weeks'] or 0)
                r['hours'] += float(row['hours'] or 0.0)

        # Apply min_weeks filter
        try:
            min_weeks = int(request.query_params.get('min_weeks')) if request.query_params.get('min_weeks') else None
        except Exception:
            min_weeks = None
        out = []
        for p in people_map.values():
            if min_weeks is not None and p['totals']['weeks'] < min_weeks:
                continue
            # round numbers
            p['totals']['hours'] = round(p['totals']['hours'], 2)
            for k in list(p['roles'].keys()):
                p['roles'][k]['hours'] = round(p['roles'][k]['hours'], 2)
            out.append(p)

        response = Response({'results': out, 'count': len(out)})
        if etag:
            response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
            response['Cache-Control'] = 'private, max-age=30'
        return response

    @extend_schema(
        description=(
            "Per-role capacity vs assigned hours timeline for a department over the next N weeks.\n\n"
            "Rules: Only includes active people; applies hireDate gating (capacity contributes only on or after start).\n"
            "Capacity is the sum of weekly capacity for all active people in the department with the selected role(s) for each week, gated by hire date.\n"
            "Assigned hours are summed from current Assignments.weekly_hours by person role and week."
        ),
        parameters=[
            OpenApiParameter(name='department', type=int, required=True, description='Department ID'),
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of future weeks (4,8,12,16,20). Default 12'),
            OpenApiParameter(name='role_ids', type=str, required=False, description='CSV of department ProjectRole IDs to include'),
        ],
        responses=inline_serializer(
            name='RoleCapacityTimelineResponse',
            fields={
                'weekKeys': serializers.ListField(child=serializers.CharField()),
                'roles': serializers.ListField(child=inline_serializer(name='ProjectRoleLite', fields={
                    'id': serializers.IntegerField(),
                    'name': serializers.CharField(),
                })),
                'series': serializers.ListField(child=inline_serializer(name='RoleSeries', fields={
                    'roleId': serializers.IntegerField(),
                    'roleName': serializers.CharField(),
                    'assigned': serializers.ListField(child=serializers.FloatField()),
                    'capacity': serializers.ListField(child=serializers.FloatField()),
                    'people': serializers.ListField(child=serializers.IntegerField(), required=False),
                })),
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='analytics_role_capacity', throttle_classes=[SnapshotsThrottle])
    def analytics_role_capacity(self, request):
        logger = logging.getLogger(__name__)
        t0 = time.perf_counter()
        # Department: if omitted, aggregate across all departments
        dept_param = request.query_params.get('department')
        dept_id = None
        if dept_param not in (None, ""):
            try:
                dept_id = int(dept_param)
            except Exception:
                return Response({'error': 'invalid department'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except Exception:
            weeks = 12
        if weeks not in (4, 8, 12, 16, 20):
            weeks = 12

        # Build week keys (Sundays) for current + N-1 weeks
        today = date.today()
        # Compute canonical Sunday for this week
        dow = today.weekday()  # Mon=0..Sun=6
        # convert to Sunday offset (0 when Sunday)
        days_since_sunday = (dow + 1) % 7
        start_sunday = today if days_since_sunday == 0 else (today - timedelta(days=days_since_sunday))
        week_keys: List[date] = [start_sunday + timedelta(days=7 * i) for i in range(weeks)]

        # Roles to include (global roles assigned to Person.role)
        role_ids_param = (request.query_params.get('role_ids') or '').strip()
        role_ids: List[int] = []
        if role_ids_param:
            try:
                role_ids = [int(x) for x in role_ids_param.split(',') if x.strip().isdigit()]
            except Exception:
                role_ids = []
        # Global roles are not department-scoped; list active roles (or subset by ids) and order by sort_order
        if role_ids:
            roles = list(Role.objects.filter(id__in=role_ids, is_active=True).order_by('sort_order', 'name'))
        else:
            roles = list(Role.objects.filter(is_active=True).order_by('sort_order', 'name'))
            role_ids = [r.id for r in roles]

        if not roles:
            return Response({'weekKeys': [wk.strftime('%Y-%m-%d') for wk in week_keys], 'roles': [], 'series': []})

        # Short‑TTL cache (acceptable 60s staleness)
        try:
            if request.query_params.get('nocache') != '1':
                cache_key = f"rc:{'all' if dept_id is None else dept_id}:{weeks}:{','.join(str(r) for r in sorted(role_ids))}"
                cached = cache.get(cache_key)
                if cached is not None:
                    return Response(cached)
        except Exception:
            # Cache must never break the request path
            cache_key = None
            cached = None
        else:
            # ensure key exists for later set
            cache_key = cache_key

        # Compute role capacity via vendor-aware helper (Postgres JSONB path or optimized Python fallback)
        wk_strs, roles_payload, series = compute_role_capacity(
            dept_id=dept_id,
            week_keys=week_keys,
            role_ids=role_ids or None,
        )
        payload = {'weekKeys': wk_strs, 'roles': roles_payload, 'series': series}
        # Set cache (best‑effort)
        try:
            if cache_key and request.query_params.get('nocache') != '1':
                cache.set(cache_key, payload, timeout=60)
        except Exception:
            pass
        finally:
            t1 = time.perf_counter()
            try:
                logger.info("role_capacity", extra={
                    'dept_id': dept_id,
                    'weeks': weeks,
                    'roles_count': len(role_ids or []),
                    'duration_ms': int((t1 - t0) * 1000),
                })
            except Exception:
                pass
        return Response(payload)

    @extend_schema(
        description=(
            "Person Experience Profile: breakdown by client and project with role/phase aggregates, plus eventsCount."
        ),
        parameters=[
            OpenApiParameter(name='person', type=int, required=True),
            OpenApiParameter(name='start', type=str, required=False),
            OpenApiParameter(name='end', type=str, required=False),
        ],
        responses=inline_serializer(
            name='PersonExperienceProfileResponse',
            fields={
                'byClient': serializers.ListField(child=inline_serializer(name='PEPClient', fields={
                    'client': serializers.CharField(),
                    'weeks': serializers.IntegerField(),
                    'hours': serializers.FloatField(),
                    'roles': serializers.DictField(child=inline_serializer(name='PEPClientRole', fields={
                        'roleId': serializers.IntegerField(),
                        'weeks': serializers.IntegerField(),
                        'hours': serializers.FloatField(),
                    })),
                    'phases': serializers.DictField(child=inline_serializer(name='PEPClientPhase', fields={
                        'phase': serializers.ChoiceField(choices=DeliverablePhase.choices),
                        'weeks': serializers.IntegerField(),
                        'hours': serializers.FloatField(),
                    })),
                })),
                'byProject': serializers.ListField(child=inline_serializer(name='PEPProject', fields={
                    'projectId': serializers.IntegerField(),
                    'projectName': serializers.CharField(),
                    'client': serializers.CharField(),
                    'weeks': serializers.IntegerField(),
                    'hours': serializers.FloatField(),
                    'roles': serializers.DictField(child=inline_serializer(name='PEPProjectRole', fields={
                        'roleId': serializers.IntegerField(),
                        'weeks': serializers.IntegerField(),
                        'hours': serializers.FloatField(),
                    })),
                    'phases': serializers.DictField(child=inline_serializer(name='PEPProjectPhase', fields={
                        'phase': serializers.ChoiceField(choices=DeliverablePhase.choices),
                        'weeks': serializers.IntegerField(),
                        'hours': serializers.FloatField(),
                    })),
                })),
                'eventsCount': serializers.IntegerField(),
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='person_experience_profile', throttle_classes=[SnapshotsThrottle], permission_classes=[IsAuthenticated, IsAdminUser])
    def person_experience_profile(self, request):
        from .models import WeeklyAssignmentSnapshot as WAS, AssignmentMembershipEvent as AME
        from projects.models import ProjectRole as PR
        try:
            person_id = int(request.query_params.get('person'))
        except Exception:
            return Response({'error': 'person is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            start = request.query_params.get('start')
            end = request.query_params.get('end')
            s0 = date.fromisoformat(start) if start else None
            s1 = date.fromisoformat(end) if end else None
        except Exception:
            s0 = None
            s1 = None
        qs = WAS.objects.filter(person_id=person_id)
        if s0:
            qs = qs.filter(week_start__gte=s0)
        if s1:
            qs = qs.filter(week_start__lte=s1)

        # Validators
        try:
            aggr = qs.aggregate(last_modified=Max('updated_at'))
            last_modified = aggr.get('last_modified')
        except Exception:
            last_modified = None
        etag = None
        try:
            etag = hashlib.sha256((str(person_id) + str(s0) + str(s1)).encode()).hexdigest()
        except Exception:
            etag = None

        # by client
        by_client: dict[str, dict] = {}
        for row in qs.values('client', 'role_on_project_id', 'deliverable_phase').annotate(
            weeks=Count('week_start', distinct=True),
            hours=Sum('hours'),
        ):
            client = row['client'] or 'Unknown'
            rec = by_client.setdefault(client, {
                'client': client,
                'weeks': 0,
                'hours': 0.0,
                'roles': {},
                'phases': {},
            })
            rec['weeks'] += int(row['weeks'] or 0)
            rec['hours'] += float(row['hours'] or 0.0)
            rid = row['role_on_project_id']
            if rid is not None:
                r = rec['roles'].setdefault(rid, {'roleId': rid, 'weeks': 0, 'hours': 0.0})
                r['weeks'] += int(row['weeks'] or 0)
                r['hours'] += float(row['hours'] or 0.0)
            ph = row['deliverable_phase'] or 'other'
            ph_rec = rec['phases'].setdefault(ph, {'phase': ph, 'weeks': 0, 'hours': 0.0})
            ph_rec['weeks'] += int(row['weeks'] or 0)
            ph_rec['hours'] += float(row['hours'] or 0.0)

        # by project
        by_project: dict[int, dict] = {}
        role_ids: set[int] = set()
        for row in qs.values('project_id', 'project_name', 'client', 'role_on_project_id', 'deliverable_phase').annotate(
            weeks=Count('week_start', distinct=True),
            hours=Sum('hours'),
        ):
            pid = row['project_id']
            if pid is None:
                continue
            rec = by_project.setdefault(pid, {
                'projectId': pid,
                'projectName': row['project_name'] or '',
                'client': row['client'] or 'Unknown',
                'weeks': 0,
                'hours': 0.0,
                'roles': {},
                'phases': {},
            })
            rec['weeks'] += int(row['weeks'] or 0)
            rec['hours'] += float(row['hours'] or 0.0)
            rid = row['role_on_project_id']
            if rid is not None:
                r = rec['roles'].setdefault(rid, {'roleId': rid, 'weeks': 0, 'hours': 0.0})
                r['weeks'] += int(row['weeks'] or 0)
                r['hours'] += float(row['hours'] or 0.0)
                try:
                    role_ids.add(int(rid))
                except Exception:
                    pass
            ph = row['deliverable_phase'] or 'other'
            ph_rec = rec['phases'].setdefault(ph, {'phase': ph, 'weeks': 0, 'hours': 0.0})
            ph_rec['weeks'] += int(row['weeks'] or 0)
            ph_rec['hours'] += float(row['hours'] or 0.0)

        # events count
        events_qs = AME.objects.filter(person_id=person_id)
        if s0:
            events_qs = events_qs.filter(week_start__gte=s0)
        if s1:
            events_qs = events_qs.filter(week_start__lte=s1)
        events_count = events_qs.count()

        # Round hours
        for rec in by_client.values():
            rec['hours'] = round(rec['hours'], 2)
            for v in rec['roles'].values():
                v['hours'] = round(v['hours'], 2)
            for v in rec['phases'].values():
                v['hours'] = round(v['hours'], 2)
        for rec in by_project.values():
            rec['hours'] = round(rec['hours'], 2)
            for v in rec['roles'].values():
                v['hours'] = round(v['hours'], 2)
            for v in rec['phases'].values():
                v['hours'] = round(v['hours'], 2)

        # Build role name map
        role_names: dict[int, str] = {}
        if role_ids:
            for pr in PR.objects.filter(id__in=list(role_ids)).values('id', 'name'):
                role_names[int(pr['id'])] = pr.get('name') or f"Role {pr['id']}"

        payload = {
            'byClient': list(by_client.values()),
            'byProject': list(by_project.values()),
            'eventsCount': int(events_count),
            'roleNamesById': role_names,
        }
        response = Response(payload)
        if etag:
            response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
            response['Cache-Control'] = 'private, max-age=30'
        return response

    @extend_schema(
        description=(
            "Person-Project timeline with coverage blocks, events, and derived role changes."
        ),
        parameters=[
            OpenApiParameter(name='person', type=int, required=True),
            OpenApiParameter(name='project', type=int, required=True),
            OpenApiParameter(name='start', type=str, required=False),
            OpenApiParameter(name='end', type=str, required=False),
        ],
        responses=inline_serializer(
            name='PersonProjectTimelineResponse',
            fields={
                'weeksSummary': inline_serializer(name='WeeksSummary', fields={
                    'weeks': serializers.IntegerField(),
                    'hours': serializers.FloatField(),
                }),
                'coverageBlocks': serializers.ListField(child=inline_serializer(name='CoverageBlock', fields={
                    'roleId': serializers.IntegerField(),
                    'start': serializers.CharField(),
                    'end': serializers.CharField(),
                    'weeks': serializers.IntegerField(),
                    'hours': serializers.FloatField(),
                })),
                'events': serializers.ListField(child=inline_serializer(name='MembershipEvent', fields={
                    'week_start': serializers.CharField(),
                    'event_type': serializers.ChoiceField(choices=MembershipEventType.choices),
                    'deliverable_phase': serializers.ChoiceField(choices=DeliverablePhase.choices),
                    'hours_before': serializers.FloatField(),
                    'hours_after': serializers.FloatField(),
                })),
                'roleChanges': serializers.ListField(child=inline_serializer(name='RoleChange', fields={
                    'week_start': serializers.CharField(),
                    'roleFromId': serializers.IntegerField(),
                    'roleToId': serializers.IntegerField(),
                })),
                'weeklyHours': serializers.DictField(child=serializers.FloatField()),
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='person_project_timeline', throttle_classes=[SnapshotsThrottle], permission_classes=[IsAuthenticated, IsAdminUser])
    def person_project_timeline(self, request):
        from .models import WeeklyAssignmentSnapshot as WAS, AssignmentMembershipEvent as AME
        try:
            person_id = int(request.query_params.get('person'))
            project_id = int(request.query_params.get('project'))
        except Exception:
            return Response({'error': 'person and project are required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            start = request.query_params.get('start')
            end = request.query_params.get('end')
            s0 = date.fromisoformat(start) if start else None
            s1 = date.fromisoformat(end) if end else None
        except Exception:
            s0 = None
            s1 = None
        qs = WAS.objects.filter(person_id=person_id, project_id=project_id)
        if s0:
            qs = qs.filter(week_start__gte=s0)
        if s1:
            qs = qs.filter(week_start__lte=s1)
        qs = qs.order_by('week_start')

        # Validators
        try:
            aggr = qs.aggregate(last_modified=Max('updated_at'))
            last_modified = aggr.get('last_modified')
        except Exception:
            last_modified = None
        etag = None
        try:
            etag = hashlib.sha256((str(person_id) + ':' + str(project_id) + str(s0) + str(s1)).encode()).hexdigest()
        except Exception:
            etag = None

        # Build coverage blocks by role
        weeks_summary = {'weeks': 0, 'hours': 0.0}
        blocks: List[dict] = []
        prev_role = None
        block_start = None
        block_weeks = 0
        block_hours = 0.0
        for r in qs.values('week_start', 'role_on_project_id', 'hours'):
            rid = r['role_on_project_id']
            hours = float(r['hours'] or 0.0)
            wk = r['week_start']
            if hours > 0 and rid is not None:
                if prev_role is None:
                    prev_role = rid
                    block_start = wk
                    block_weeks = 1
                    block_hours = hours
                elif rid == prev_role:
                    block_weeks += 1
                    block_hours += hours
                else:
                    blocks.append({'roleId': prev_role, 'start': str(block_start), 'end': str(wk), 'weeks': block_weeks, 'hours': round(block_hours, 2)})
                    prev_role = rid
                    block_start = wk
                    block_weeks = 1
                    block_hours = hours
                weeks_summary['weeks'] += 1
                weeks_summary['hours'] += hours
        if prev_role is not None and block_start is not None:
            blocks.append({'roleId': prev_role, 'start': str(block_start), 'end': str(qs.values_list('week_start', flat=True).last()), 'weeks': block_weeks, 'hours': round(block_hours, 2)})
        weeks_summary['hours'] = round(weeks_summary['hours'], 2)

        # Events
        ev_qs = AME.objects.filter(person_id=person_id, project_id=project_id)
        if s0:
            ev_qs = ev_qs.filter(week_start__gte=s0)
        if s1:
            ev_qs = ev_qs.filter(week_start__lte=s1)
        events = list(ev_qs.order_by('week_start').values('week_start', 'event_type', 'deliverable_phase', 'hours_before', 'hours_after'))
        for e in events:
            e['week_start'] = str(e['week_start'])
            e['hours_before'] = round(float(e['hours_before'] or 0.0), 2)
            e['hours_after'] = round(float(e['hours_after'] or 0.0), 2)

        # Derived role changes
        role_changes: List[dict] = []
        prev_roles = None
        prev_week = None
        for row in qs.values('week_start', 'role_on_project_id', 'hours'):
            wk = row['week_start']
            rid = row['role_on_project_id']
            hrs = float(row['hours'] or 0.0)
            if prev_week != wk:
                # move to next week; evaluate change between prev_roles and current assembled
                if prev_roles is not None and len(prev_roles) == 1 and 'cur_roles' in locals() and len(cur_roles) == 1:
                    pra = next(iter(prev_roles))
                    cra = next(iter(cur_roles))
                    if pra is not None and cra is not None and pra != cra:
                        role_changes.append({'week_start': str(wk), 'roleFromId': pra, 'roleToId': cra})
                prev_week = wk
                cur_roles = set()
            if hrs > 0 and rid is not None:
                cur_roles.add(rid)
            prev_roles = cur_roles

        # Weekly hours series for sparkline
        weekly_hours: dict[str, float] = {}
        for r in qs.values('week_start', 'hours').order_by('week_start'):
            weekly_hours[str(r['week_start'])] = round(float(r['hours'] or 0.0), 2)

        payload = {
            'weeksSummary': weeks_summary,
            'coverageBlocks': blocks,
            'events': events,
            'roleChanges': role_changes,
            'weeklyHours': weekly_hours,
        }
        response = Response(payload)
        if etag:
            response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
            response['Cache-Control'] = 'private, max-age=30'
        return response

    @extend_schema(
        description=(
            "Project Staffing Timeline: aggregates per role and people lists with events."
        ),
        parameters=[
            OpenApiParameter(name='project', type=int, required=True),
            OpenApiParameter(name='start', type=str, required=False),
            OpenApiParameter(name='end', type=str, required=False),
        ],
        responses=inline_serializer(
            name='ProjectStaffingTimelineResponse',
            fields={
                'people': serializers.ListField(child=inline_serializer(name='PSTPerson', fields={
                    'personId': serializers.IntegerField(),
                    'personName': serializers.CharField(),
                    'roles': serializers.ListField(child=inline_serializer(name='PSTPersonRole', fields={
                        'roleId': serializers.IntegerField(allow_null=True),
                        'weeks': serializers.IntegerField(),
                        'hours': serializers.FloatField(),
                    })),
                    'events': serializers.ListField(child=inline_serializer(name='PSTEvent', fields={
                        'week_start': serializers.CharField(),
                        'event_type': serializers.ChoiceField(choices=MembershipEventType.choices),
                    })),
                })),
                'roleAggregates': serializers.ListField(child=inline_serializer(name='PSTRoleAgg', fields={
                    'roleId': serializers.IntegerField(allow_null=True),
                    'peopleCount': serializers.IntegerField(),
                    'weeks': serializers.IntegerField(),
                    'hours': serializers.FloatField(),
                })),
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='project_staffing_timeline', throttle_classes=[SnapshotsThrottle])
    def project_staffing_timeline(self, request):
        from .models import WeeklyAssignmentSnapshot as WAS, AssignmentMembershipEvent as AME
        try:
            project_id = int(request.query_params.get('project'))
        except Exception:
            return Response({'error': 'project is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            start = request.query_params.get('start')
            end = request.query_params.get('end')
            s0 = date.fromisoformat(start) if start else None
            s1 = date.fromisoformat(end) if end else None
        except Exception:
            s0 = None
            s1 = None
        qs = WAS.objects.filter(project_id=project_id)
        if s0:
            qs = qs.filter(week_start__gte=s0)
        if s1:
            qs = qs.filter(week_start__lte=s1)

        # Validators
        try:
            aggr = qs.aggregate(last_modified=Max('updated_at'))
            last_modified = aggr.get('last_modified')
        except Exception:
            last_modified = None
        etag = None
        try:
            etag = hashlib.sha256((str(project_id) + str(s0) + str(s1)).encode()).hexdigest()
        except Exception:
            etag = None

        # Per person/role aggregates and role totals
        people: dict[int, dict] = {}
        role_aggr: dict[Optional[int], dict] = {}
        for row in qs.values('person_id', 'person_name', 'role_on_project_id').annotate(
            weeks=Count('week_start', distinct=True),
            hours=Sum('hours'),
        ):
            pid = row['person_id']
            if pid is None:
                continue
            rec = people.setdefault(pid, {'personId': pid, 'personName': row['person_name'] or '', 'roles': []})
            rid = row['role_on_project_id']
            rec['roles'].append({'roleId': rid, 'weeks': int(row['weeks'] or 0), 'hours': round(float(row['hours'] or 0.0), 2)})
            ra = role_aggr.setdefault(rid, {'roleId': rid, 'peopleCount': 0, 'weeks': 0, 'hours': 0.0})
            ra['peopleCount'] += 1
            ra['weeks'] += int(row['weeks'] or 0)
            ra['hours'] += float(row['hours'] or 0.0)
        for v in role_aggr.values():
            v['hours'] = round(v['hours'], 2)

        # Events per person
        ev_map: dict[int, list] = {}
        ev_qs = AME.objects.filter(project_id=project_id)
        if s0:
            ev_qs = ev_qs.filter(week_start__gte=s0)
        if s1:
            ev_qs = ev_qs.filter(week_start__lte=s1)
        for e in ev_qs.order_by('week_start').values('person_id', 'week_start', 'event_type'):
            pid = e['person_id']
            if pid is None:
                continue
            ev_map.setdefault(pid, []).append({'week_start': str(e['week_start']), 'event_type': e['event_type']})
        # attach to people
        out_people = []
        for pid, rec in people.items():
            rec['events'] = ev_map.get(pid, [])
            out_people.append(rec)

        payload = {
            'people': out_people,
            'roleAggregates': list(role_aggr.values()),
        }
        response = Response(payload)
        if etag:
            response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
            response['Cache-Control'] = 'private, max-age=30'
        return response

    @extend_schema(
        description="Return authoritative totals for specific projects over current horizon.",
        parameters=[
            OpenApiParameter(name='project_ids', type=str, required=True, description='CSV of project IDs'),
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks (1-26), default 12'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
        ],
        responses=inline_serializer(name='ProjectTotalsResponse', fields={
            'hoursByProject': serializers.DictField(child=serializers.DictField(child=serializers.FloatField()))
        })
    )
    @action(detail=False, methods=['get'], url_path='project_totals', throttle_classes=[GridSnapshotThrottle])
    def project_totals(self, request):
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12
        if weeks < 1:
            weeks = 1
        if weeks > 26:
            weeks = 26

        ids = request.query_params.get('project_ids')
        if not ids:
            return Response({'detail': 'project_ids is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            project_ids = [int(x) for x in ids.split(',') if x.strip().isdigit()]
        except Exception:
            return Response({'detail': 'invalid project_ids'}, status=status.HTTP_400_BAD_REQUEST)

        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        dept_ids = None
        if dept_param not in (None, ""):
            try:
                root = int(dept_param)
                if include_children:
                    ids_set = set()
                    stack = [root]
                    from departments.models import Department as Dept
                    while stack:
                        current = stack.pop()
                        if current in ids_set:
                            continue
                        ids_set.add(current)
                        for d in (Dept.objects.filter(parent_department_id=current).values_list('id', flat=True)):
                            if d not in ids_set:
                                stack.append(d)
                    dept_ids = list(ids_set)
                else:
                    dept_ids = [root]
            except Exception:
                dept_ids = None

        from core.week_utils import sunday_of_week
        today = date.today()
        start_sunday = sunday_of_week(today)
        week_keys = [(start_sunday + timedelta(weeks=i)).isoformat() for i in range(weeks)]

        qs = Assignment.objects.filter(is_active=True, person__is_active=True, project_id__in=project_ids).select_related('person', 'project')
        if dept_ids:
            qs = qs.filter(person__department_id__in=dept_ids)

        def hours_for_week_from_json(weekly_hours, sunday_key):
            try:
                v = weekly_hours.get(sunday_key)
                return float(v or 0)
            except Exception:
                return 0.0

        project_hours = {}
        for a in qs:
            pid = a.project_id
            if pid is None:
                continue
            project_hours.setdefault(pid, {})
            wh = a.weekly_hours or {}
            for wk in week_keys:
                h = hours_for_week_from_json(wh, wk)
                if h:
                    project_hours[pid][wk] = round(project_hours[pid].get(wk, 0.0) + h, 2)

        return Response({'hoursByProject': project_hours})

    # ========== Analytics (server-side aggregation) ==========

    @extend_schema(
        description=(
            "Assigned hours aggregated by client for N weeks ahead.\n\n"
            "Response: { clients: [{ label: string, hours: number }] }"
        ),
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks (1-26), default 12'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
        ],
        responses=inline_serializer(
            name='AssignedHoursByClientResponse',
            fields={
                'clients': serializers.ListField(child=inline_serializer(name='ClientTotal', fields={
                    'label': serializers.CharField(),
                    'hours': serializers.FloatField(),
                }))
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='analytics_by_client', throttle_classes=[GridSnapshotThrottle])
    def analytics_by_client(self, request):
        from projects.models import Project as Proj
        # Cache key
        try:
            cache_key = (
                f"assignments:analytics_by_client:"
                f"w={request.query_params.get('weeks','12')}:"
                f"d={request.query_params.get('department','')}:"
                f"c={request.query_params.get('include_children','')}"
            )
            cached = cache.get(cache_key)
            if cached:
                return Response(cached)
        except Exception:
            cache_key = None

        # Parse weeks
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12
        weeks = max(1, min(26, weeks))

        # Department scoping
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        dept_ids = None
        if dept_param not in (None, ""):
            try:
                root = int(dept_param)
                if include_children:
                    ids = set([root])
                    stack = [root]
                    from departments.models import Department as Dept
                    while stack:
                        current = stack.pop()
                        for d in (Dept.objects.filter(parent_department_id=current).values_list('id', flat=True)):
                            if d not in ids:
                                ids.add(d)
                                stack.append(d)
                    dept_ids = list(ids)
                else:
                    dept_ids = [root]
            except Exception:
                dept_ids = None

        # Build weeks
        from core.week_utils import sunday_of_week
        today = date.today()
        start_sunday = sunday_of_week(today)
        week_keys = [(start_sunday + timedelta(weeks=i)).isoformat() for i in range(weeks)]

        # Base assignments
        qs = Assignment.objects.filter(is_active=True, person__is_active=True).select_related('project', 'person')
        if dept_ids:
            qs = qs.filter(person__department_id__in=dept_ids)

        # Aggregate hours by project/week
        def hours_for_week_from_json(weekly_hours, sunday_key):
            try:
                v = weekly_hours.get(sunday_key)
                return float(v or 0)
            except Exception:
                return 0.0

        project_hours = {}
        for a in qs:
            pid = a.project_id
            if pid is None:
                continue
            wh = a.weekly_hours or {}
            for wk in week_keys:
                h = hours_for_week_from_json(wh, wk)
                if h:
                    project_hours.setdefault(pid, 0.0)
                    project_hours[pid] = round(project_hours[pid] + h, 2)

        # Join to projects for client labels
        pids = list(project_hours.keys())
        clients_map = {}
        if pids:
            for row in Proj.objects.filter(id__in=pids).values('id', 'client'):
                clients_map[row['id']] = (row['client'] or '').strip() or 'Unknown'

        totals = {}
        for pid, total in project_hours.items():
            label = clients_map.get(pid, 'Unknown')
            totals[label] = round(totals.get(label, 0.0) + float(total), 2)

        clients = [{'label': k, 'hours': v} for k, v in sorted(totals.items(), key=lambda x: x[1], reverse=True)]
        payload = {'clients': clients}
        try:
            if cache_key:
                cache.set(cache_key, payload, timeout=60)
        except Exception:
            pass
        return Response(payload)

    @extend_schema(
        description=(
            "Assigned hours aggregated by project for a given client over N weeks ahead.\n\n"
            "Response: { projects: [{ id: number, name: string, hours: number }] }"
        ),
        parameters=[
            OpenApiParameter(name='client', type=str, required=True),
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks (1-26), default 12'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
        ],
        responses=inline_serializer(
            name='AssignedHoursClientProjectsResponse',
            fields={
                'projects': serializers.ListField(child=inline_serializer(name='ProjectTotal', fields={
                    'id': serializers.IntegerField(),
                    'name': serializers.CharField(),
                    'hours': serializers.FloatField(),
                }))
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='analytics_client_projects', throttle_classes=[GridSnapshotThrottle])
    def analytics_client_projects(self, request):
        from projects.models import Project as Proj
        client = (request.query_params.get('client') or '').strip()
        if not client:
            return Response({'detail': 'client is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Cache key
        try:
            cache_key = (
                f"assignments:analytics_client_projects:"
                f"client={client}:"
                f"w={request.query_params.get('weeks','12')}:"
                f"d={request.query_params.get('department','')}:"
                f"c={request.query_params.get('include_children','')}"
            )
            cached = cache.get(cache_key)
            if cached:
                return Response(cached)
        except Exception:
            cache_key = None

        # Parse weeks
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12
        weeks = max(1, min(26, weeks))

        # Department scoping
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        dept_ids = None
        if dept_param not in (None, ""):
            try:
                root = int(dept_param)
                if include_children:
                    ids = set([root])
                    stack = [root]
                    from departments.models import Department as Dept
                    while stack:
                        current = stack.pop()
                        for d in (Dept.objects.filter(parent_department_id=current).values_list('id', flat=True)):
                            if d not in ids:
                                ids.add(d)
                                stack.append(d)
                    dept_ids = list(ids)
                else:
                    dept_ids = [root]
            except Exception:
                dept_ids = None

        # Build weeks
        from core.week_utils import sunday_of_week
        today = date.today()
        start_sunday = sunday_of_week(today)
        week_keys = [(start_sunday + timedelta(weeks=i)).isoformat() for i in range(weeks)]

        # Resolve project ids for target client
        proj_rows = list(Proj.objects.filter(client=client).values('id', 'name'))
        proj_map = {row['id']: row['name'] for row in proj_rows}
        project_ids = list(proj_map.keys())
        if not project_ids:
            return Response({'projects': []})

        qs = Assignment.objects.filter(is_active=True, person__is_active=True, project_id__in=project_ids).select_related('person', 'project')
        if dept_ids:
            qs = qs.filter(person__department_id__in=dept_ids)

        def hours_for_week_from_json(weekly_hours, sunday_key):
            try:
                v = weekly_hours.get(sunday_key)
                return float(v or 0)
            except Exception:
                return 0.0

        totals = {}
        for a in qs:
            pid = a.project_id
            if pid is None:
                continue
            wh = a.weekly_hours or {}
            s = 0.0
            for wk in week_keys:
                h = hours_for_week_from_json(wh, wk)
                if h:
                    s += float(h)
            if s:
                totals[pid] = round(totals.get(pid, 0.0) + s, 2)

        projects = [
            {'id': pid, 'name': proj_map.get(pid, str(pid)), 'hours': hours}
            for pid, hours in sorted(totals.items(), key=lambda x: x[1], reverse=True)
        ]
        payload = {'projects': projects}
        try:
            if cache_key:
                cache.set(cache_key, payload, timeout=60)
        except Exception:
            pass
        return Response(payload)

    @extend_schema(
        description=(
            "Assigned hours weekly timeline aggregated by project status for N weeks ahead.\n\n"
            "Categories reflect Project.status controlled vocabulary: 'active', 'active_ca', and 'other'.\n"
            "Response: { weekKeys: [..], series: { active: number[], active_ca: number[], other: number[] }, totalByWeek: number[] }"
        ),
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks (1-26), default 12'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
        ],
        responses=inline_serializer(
            name='AssignedHoursStatusTimelineResponse',
            fields={
                'weekKeys': serializers.ListField(child=serializers.CharField()),
                'series': inline_serializer(name='StatusSeries', fields={
                    'active': serializers.ListField(child=serializers.FloatField()),
                    'active_ca': serializers.ListField(child=serializers.FloatField()),
                    'other': serializers.ListField(child=serializers.FloatField()),
                }),
                'totalByWeek': serializers.ListField(child=serializers.FloatField()),
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='analytics_status_timeline', throttle_classes=[GridSnapshotThrottle])
    def analytics_status_timeline(self, request):
        from projects.models import Project as Proj
        # Cache key
        try:
            cache_key = (
                f"assignments:analytics_status_timeline:"
                f"w={request.query_params.get('weeks','12')}:"
                f"d={request.query_params.get('department','')}:"
                f"c={request.query_params.get('include_children','')}"
            )
            cached = cache.get(cache_key)
            if cached:
                return Response(cached)
        except Exception:
            cache_key = None

        # Parse weeks
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12
        weeks = max(1, min(26, weeks))

        # Department scoping
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        dept_ids = None
        if dept_param not in (None, ""):
            try:
                root = int(dept_param)
                if include_children:
                    ids = set([root])
                    stack = [root]
                    from departments.models import Department as Dept
                    while stack:
                        current = stack.pop()
                        for d in (Dept.objects.filter(parent_department_id=current).values_list('id', flat=True)):
                            if d not in ids:
                                ids.add(d)
                                stack.append(d)
                    dept_ids = list(ids)
                else:
                    dept_ids = [root]
            except Exception:
                dept_ids = None

        # Build weeks
        from core.week_utils import sunday_of_week
        today = date.today()
        start_sunday = sunday_of_week(today)
        week_keys = [(start_sunday + timedelta(weeks=i)).isoformat() for i in range(weeks)]

        # Base assignments
        qs = Assignment.objects.filter(is_active=True, person__is_active=True).select_related('project', 'person')
        if dept_ids:
            qs = qs.filter(person__department_id__in=dept_ids)

        # Aggregate per project per week
        def hours_for_week_from_json(weekly_hours, sunday_key):
            try:
                v = weekly_hours.get(sunday_key)
                return float(v or 0)
            except Exception:
                return 0.0

        by_project = {}
        for a in qs:
            pid = a.project_id
            if pid is None:
                continue
            wh = a.weekly_hours or {}
            m = by_project.setdefault(pid, {})
            for wk in week_keys:
                h = hours_for_week_from_json(wh, wk)
                if h:
                    m[wk] = round(m.get(wk, 0.0) + h, 2)

        pids = list(by_project.keys())
        status_map = {}
        if pids:
            for row in Proj.objects.filter(id__in=pids).values('id', 'status'):
                status_map[row['id']] = (row['status'] or '').lower()

        sums_active = [0.0] * len(week_keys)
        sums_active_ca = [0.0] * len(week_keys)
        sums_other = [0.0] * len(week_keys)
        for idx, wk in enumerate(week_keys):
            for pid, wkmap in by_project.items():
                val = float(wkmap.get(wk, 0.0))
                if not val:
                    continue
                st = status_map.get(pid, '')
                if st == 'active':
                    sums_active[idx] += val
                elif st == 'active_ca':
                    sums_active_ca[idx] += val
                else:
                    sums_other[idx] += val

        total_by_week = [round(sums_active[i] + sums_active_ca[i] + sums_other[i], 2) for i in range(len(week_keys))]
        payload = {
            'weekKeys': week_keys,
            'series': {
                'active': [round(x, 2) for x in sums_active],
                'active_ca': [round(x, 2) for x in sums_active_ca],
                'other': [round(x, 2) for x in sums_other],
            },
            'totalByWeek': total_by_week,
        }
        try:
            if cache_key:
                cache.set(cache_key, payload, timeout=60)
        except Exception:
            pass
        return Response(payload)

    @extend_schema(
        description=(
            "Assigned hours weekly timeline aggregated by deliverable phase for N weeks ahead.\n\n"
            "Uses shared classification (forward-select next deliverable, Monday exception, 'active_ca' override to 'ca' when no next deliverable). Controlled vocabulary: sd, dd, ifp, masterplan, bulletins, ca, other. 'extras' retained for compatibility and is typically empty.\n"
            "Classification rules: explicit phase in description (SD/DD/IFP) wins; otherwise map by percentage: 0-39%→SD, 40-80%→DD, 81-100%→IFP; unknown→other.\n"
            "Also groups any description containing 'Bulletin' or 'Addendum' into Bulletins/Addendums. Non-matching items are returned in 'extras' by label (desc or percent). No generic 'other' bucket is included in the series.\n"
            "Response: { weekKeys: [..], series: { sd, dd, ifp, bulletins }, extras: [{label, values[]}], totalByWeek }"
        ),
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks (1-26), default 12'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='include_active_ca', type=int, required=False, description='0|1 include active_ca status in addition to active (default 0)')
        ],
        responses=inline_serializer(
            name='AssignedHoursDeliverableTimelineResponse',
            fields={
                'weekKeys': serializers.ListField(child=serializers.CharField()),
                'series': inline_serializer(name='DeliverableSeries', fields={
                    'sd': serializers.ListField(child=serializers.FloatField()),
                    'dd': serializers.ListField(child=serializers.FloatField()),
                    'ifp': serializers.ListField(child=serializers.FloatField()),
                    'masterplan': serializers.ListField(child=serializers.FloatField()),
                    'bulletins': serializers.ListField(child=serializers.FloatField()),
                    'ca': serializers.ListField(child=serializers.FloatField()),
                    'other': serializers.ListField(child=serializers.FloatField()),
                }),
                'extras': serializers.ListField(required=False, allow_null=True, help_text='deprecated: kept for backward compatibility; typically empty', child=inline_serializer(name='ExtraSeries', fields={
                    'label': serializers.CharField(),
                    'values': serializers.ListField(child=serializers.FloatField()),
                })),
                'totalByWeek': serializers.ListField(child=serializers.FloatField()),
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='analytics_deliverable_timeline', throttle_classes=[GridSnapshotThrottle])
    def analytics_deliverable_timeline(self, request):
        from projects.models import Project as Proj
        from deliverables.models import Deliverable
        # Detect debug mode early so we don't serve a cached payload without debug details
        debug_requested = (
            request.query_params.get('debug_unspecified') == '1' or
            request.query_params.get('debug_extras') == '1' or
            request.query_params.get('debug') == '1'
        )

        # Cache key (skip cache entirely if debug is requested)
        try:
            cache_key = None
            if not debug_requested:
                cache_key = (
                    f"assignments:analytics_deliverable_timeline:"
                    f"w={request.query_params.get('weeks','12')}:"
                    f"d={request.query_params.get('department','')}:"
                    f"c={request.query_params.get('include_children','')}:"
                    f"ac={request.query_params.get('include_active_ca','0')}"
                )
                cached = cache.get(cache_key)
                if cached:
                    return Response(cached)
        except Exception:
            cache_key = None

        # Parse weeks
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12
        weeks = max(1, min(26, weeks))

        # Department scoping
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        dept_ids = None
        if dept_param not in (None, ""):
            try:
                root = int(dept_param)
                if include_children:
                    ids = set([root])
                    stack = [root]
                    from departments.models import Department as Dept
                    while stack:
                        current = stack.pop()
                        for d in (Dept.objects.filter(parent_department_id=current).values_list('id', flat=True)):
                            if d not in ids:
                                ids.add(d)
                                stack.append(d)
                    dept_ids = list(ids)
                else:
                    dept_ids = [root]
            except Exception:
                dept_ids = None

        include_active_ca = (request.query_params.get('include_active_ca') == '1')

        # Build weeks (Sundays)
        from core.week_utils import sunday_of_week
        today = date.today()
        start_sunday = sunday_of_week(today)
        week_keys = [(start_sunday + timedelta(weeks=i)).isoformat() for i in range(weeks)]

        # Base assignments
        qs = Assignment.objects.filter(is_active=True, person__is_active=True).select_related('project', 'person')
        if dept_ids:
            qs = qs.filter(person__department_id__in=dept_ids)

        # Aggregate per project per week
        def hours_for_week_from_json(weekly_hours, sunday_key):
            try:
                v = weekly_hours.get(sunday_key)
                return float(v or 0)
            except Exception:
                return 0.0

        by_project_week = {}
        for a in qs:
            pid = a.project_id
            if pid is None:
                continue
            m = by_project_week.setdefault(pid, {})
            wh = a.weekly_hours or {}
            for wk in week_keys:
                h = hours_for_week_from_json(wh, wk)
                if h:
                    m[wk] = round(m.get(wk, 0.0) + h, 2)

        pids = list(by_project_week.keys())
        if not pids:
            return Response({'weekKeys': week_keys, 'series': {'sd': [0]*weeks, 'dd': [0]*weeks, 'ifp': [0]*weeks, 'bulletins': [0]*weeks}, 'extras': [], 'totalByWeek': [0]*weeks})

        # Project statuses and names (for debug context)
        status_map = {}
        name_map = {}
        for row in Proj.objects.filter(id__in=pids).values('id', 'status', 'name'):
            status_map[row['id']] = (row['status'] or '').lower()
            name_map[row['id']] = row.get('name') or f"Project {row['id']}"

        # Filter project ids to active (and optional active_ca)
        filtered_pids = []
        for pid in pids:
            st = status_map.get(pid, '')
            if st == 'active' or (include_active_ca and st == 'active_ca'):
                filtered_pids.append(pid)

        if not filtered_pids:
            return Response({'weekKeys': week_keys, 'series': {'sd': [0]*weeks, 'dd': [0]*weeks, 'ifp': [0]*weeks, 'bulletins': [0]*weeks}, 'extras': [], 'totalByWeek': [0]*weeks})

        # Load deliverables for these projects
        deliv_rows = list(Deliverable.objects.filter(project_id__in=filtered_pids).values('project_id', 'percentage', 'description', 'date'))

        # Build per-project sorted deliverable milestones with week index and monday flag
        per_proj_deliv = {}
        for r in deliv_rows:
            pid = r['project_id']
            pct = r.get('percentage')
            desc = (r.get('description') or '').strip()
            dt = r.get('date')
            wk = None
            is_monday = False
            try:
                if dt:
                    wk = sunday_of_week(dt).isoformat()
                    try:
                        # datetime.date.weekday(): Monday=0, Sunday=6
                        is_monday = (dt.weekday() == 0)
                    except Exception:
                        is_monday = False
            except Exception:
                wk = None
            per_proj_deliv.setdefault(pid, []).append({'wk': wk, 'pct': pct, 'desc': desc, 'date': dt, 'is_monday': is_monday})
        for pid in per_proj_deliv.keys():
            per_proj_deliv[pid].sort(key=lambda x: (x['wk'] or '0000-00-00'))

        # For each week, for each project, attribute hours to deliverable class via shared classifier
        sums_sd = [0.0] * len(week_keys)
        sums_dd = [0.0] * len(week_keys)
        sums_ifp = [0.0] * len(week_keys)
        sums_bulletins = [0.0] * len(week_keys)
        sums_masterplan = [0.0] * len(week_keys)
        sums_ca = [0.0] * len(week_keys)
        sums_other = [0.0] * len(week_keys)
        extras_series: dict[str, list[float]] = {}
        # Optional debug output collections
        debug_flag = request.query_params.get('debug_unspecified') == '1' or \
                     request.query_params.get('debug_extras') == '1' or \
                     request.query_params.get('debug') == '1'
        unspecified_debug: list[dict] = []
        extras_debug_map: dict[str, dict[int, float]] = {}
        cat_debug_map: dict[str, dict[int, float]] = {
            'sd': {}, 'dd': {}, 'ifp': {}, 'masterplan': {}, 'bulletins': {}, 'ca': {}
        }
        for pid in filtered_pids:
            wkmap = by_project_week.get(pid, {})
            classes = build_project_week_classification(
                week_keys,
                status_map.get(pid),
                [{'percentage': r.get('pct'), 'description': r.get('desc'), 'date': r.get('date')} for r in per_proj_deliv.get(pid, [])]
            ) if per_proj_deliv.get(pid) is not None else ['other'] * len(week_keys)
            for i, wk in enumerate(week_keys):
                val = float(wkmap.get(wk, 0.0))
                if not val:
                    continue
                c = classes[i]
                if c == 'sd':
                    sums_sd[i] += val
                    if debug_flag:
                        cat_debug_map['sd'][pid] = cat_debug_map['sd'].get(pid, 0.0) + val
                elif c == 'dd':
                    sums_dd[i] += val
                    if debug_flag:
                        cat_debug_map['dd'][pid] = cat_debug_map['dd'].get(pid, 0.0) + val
                elif c == 'ifp':
                    sums_ifp[i] += val
                    if debug_flag:
                        cat_debug_map['ifp'][pid] = cat_debug_map['ifp'].get(pid, 0.0) + val
                elif c == 'bulletins':
                    sums_bulletins[i] += val
                    if debug_flag:
                        cat_debug_map['bulletins'][pid] = cat_debug_map['bulletins'].get(pid, 0.0) + val
                elif c == 'masterplan':
                    sums_masterplan[i] += val
                    if debug_flag:
                        cat_debug_map['masterplan'][pid] = cat_debug_map['masterplan'].get(pid, 0.0) + val
                elif c == 'ca':
                    sums_ca[i] += val
                    if debug_flag:
                        cat_debug_map['ca'][pid] = cat_debug_map['ca'].get(pid, 0.0) + val
                else:
                    # Controlled vocabulary: attribute to 'other'
                    sums_other[i] += val

        # Use controlled 'other' bucket directly
        other_series = [round(x, 2) for x in sums_other]
        total_by_week = []
        for i in range(len(week_keys)):
            total_by_week.append(round(
                sums_sd[i] + sums_dd[i] + sums_ifp[i] + sums_masterplan[i] + sums_bulletins[i] + sums_ca[i] + other_series[i],
                2
            ))
        extras = [
            {'label': k, 'values': [round(x, 2) for x in v]}
            for k, v in sorted(extras_series.items(), key=lambda item: sum(item[1]), reverse=True)
        ]
        payload = {
            'weekKeys': week_keys,
            'series': {
                'sd': [round(x, 2) for x in sums_sd],
                'dd': [round(x, 2) for x in sums_dd],
                'ifp': [round(x, 2) for x in sums_ifp],
                'masterplan': [round(x, 2) for x in sums_masterplan],
                'bulletins': [round(x, 2) for x in sums_bulletins],
                'ca': [round(x, 2) for x in sums_ca],
                'other': [round(x, 2) for x in other_series],
            },
            'extras': extras,
            'totalByWeek': total_by_week,
        }
        if debug_flag:
            payload['unspecifiedDebug'] = unspecified_debug
            # Flatten extras_debug_map to array for easier client filtering
            extras_debug_list = []
            for lbl, pm in extras_debug_map.items():
                for prj, hrs in pm.items():
                    extras_debug_list.append({
                        'label': lbl,
                        'projectId': prj,
                        'projectName': name_map.get(prj, str(prj)),
                        'hours': round(float(hrs), 2),
                    })
            payload['extrasDebug'] = extras_debug_list
            # Flatten category map similarly
            cat_debug_list = []
            for cat, pm in cat_debug_map.items():
                for prj, hrs in pm.items():
                    cat_debug_list.append({
                        'category': cat,
                        'projectId': prj,
                        'projectName': name_map.get(prj, str(prj)),
                        'hours': round(float(hrs), 2),
                    })
            payload['categoriesDebug'] = cat_debug_list
        # Only cache non-debug payloads
        try:
            if cache_key:
                cache.set(cache_key, payload, timeout=60)
        except Exception:
            pass
        return Response(payload)

    @extend_schema(
        description="Return compact pre-aggregated grid data for N weeks ahead (default 12).\n\n"
                    "Response shape: { weekKeys: [YYYY-MM-DD], people: [{id, name, weeklyCapacity, department}], hoursByPerson: { <personId>: { <weekKey>: hours } } }",
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks (1-26), default 12'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
        ],
        responses=inline_serializer(
            name='GridSnapshotResponse',
            fields={
                'weekKeys': serializers.ListField(child=serializers.CharField()),
                'people': serializers.ListField(child=inline_serializer(name='GridSnapshotPerson', fields={
                    'id': serializers.IntegerField(),
                    'name': serializers.CharField(),
                    'weeklyCapacity': serializers.IntegerField(),
                    'department': serializers.IntegerField(allow_null=True),
                })),
                'hoursByPerson': serializers.DictField(child=serializers.DictField(child=serializers.FloatField())),
            }
        )
    )
    @action(detail=False, methods=['get'], url_path='grid_snapshot', throttle_classes=[GridSnapshotThrottle])
    def grid_snapshot(self, request):
        """Provide a compact, pre-aggregated structure for the grid in one request.

        Uses Monday as canonical API week keys and tolerates +/- 3 days against stored JSON keys.
        Includes short-TTL caching and conditional ETag/Last-Modified handling.
        """
        # Parse and clamp weeks
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12
        if weeks < 1:
            weeks = 1
        if weeks > 26:
            weeks = 26

        # Build people queryset with optional department scoping
        people_qs = Person.objects.filter(is_active=True).select_related('department')
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        cache_scope = 'all'
        if dept_param not in (None, ""):
            try:
                dept_id = int(dept_param)
                if include_children:
                    # BFS for descendants
                    ids = set()
                    stack = [dept_id]
                    while stack:
                        current = stack.pop()
                        if current in ids:
                            continue
                        ids.add(current)
                        for d in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                            if d not in ids:
                                stack.append(d)
                    people_qs = people_qs.filter(department_id__in=list(ids))
                    cache_scope = f'dept_{dept_id}_children'
                else:
                    people_qs = people_qs.filter(department_id=dept_id)
                    cache_scope = f'dept_{dept_id}'
            except (TypeError, ValueError):
                pass

        # Prefetch active assignments with minimal fields
        asn_qs = Assignment.objects.filter(is_active=True).only('weekly_hours', 'person_id', 'updated_at')
        people_qs = people_qs.prefetch_related(Prefetch('assignments', queryset=asn_qs))

        # Build cache key and short-TTL caching
        try:
            version = cache.get('analytics_cache_version', 1)
        except Exception:
            version = 1
        cache_key = f"assignments:grid_snapshot:v{version}:{weeks}:{cache_scope}"
        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))

        # Compute conservative validators across People + Assignments
        ppl_aggr = people_qs.aggregate(last_modified=Max('updated_at'))
        asn_aggr = Assignment.objects.filter(person__in=people_qs).aggregate(last_modified=Max('updated_at'))
        lm_candidates = [ppl_aggr.get('last_modified'), asn_aggr.get('last_modified')]
        last_modified = max([dt for dt in lm_candidates if dt]) if any(lm_candidates) else None
        # Include active people count in ETag to invalidate when users toggle active/inactive
        active_count = 0
        try:
            active_count = people_qs.count()
        except Exception:
            active_count = 0
        etag_content = f"{weeks}-{cache_scope}-{active_count}-" + (last_modified.isoformat() if last_modified else 'none')
        etag = hashlib.sha256(etag_content.encode()).hexdigest()

        # Conditional request handling
        inm = request.META.get('HTTP_IF_NONE_MATCH')
        if inm and inm.strip('"') == etag:
            resp = HttpResponseNotModified()
            resp['ETag'] = f'"{etag}"'
            if last_modified:
                resp['Last-Modified'] = http_date(last_modified.timestamp())
            return resp
        ims = request.META.get('HTTP_IF_MODIFIED_SINCE')
        if last_modified and ims:
            try:
                from django.utils.http import parse_http_date
                if_modified_ts = parse_http_date(ims)
                if int(last_modified.timestamp()) <= if_modified_ts:
                    resp = HttpResponseNotModified()
                    resp['ETag'] = f'"{etag}"'
                    resp['Last-Modified'] = http_date(last_modified.timestamp())
                    return resp
            except Exception:
                pass

        payload = None
        if use_cache:
            try:
                payload = cache.get(cache_key)
            except Exception:
                payload = None

        if payload is None:
            # Single-flight lock to prevent stampedes
            lock_key = f"lock:{cache_key}"
            got_lock = False
            if use_cache:
                try:
                    got_lock = cache.add(lock_key, '1', timeout=10)
                except Exception:
                    got_lock = True
            try:
                if not got_lock and use_cache:
                    t0 = time.time()
                    while time.time() - t0 < 2.0:
                        try:
                            payload = cache.get(cache_key)
                            if payload is not None:
                                break
                        except Exception:
                            pass
                        time.sleep(0.05)
                if payload is None:
                    # Compute week keys (Sundays)
                    from core.week_utils import sunday_of_week
                    today = date.today()
                    start_sunday = sunday_of_week(today)
                    week_keys = [(start_sunday + timedelta(weeks=w)).isoformat() for w in range(weeks)]

                    # Build people list
                    people_list = []
                    for p in people_qs:
                        people_list.append({
                            'id': p.id,
                            'name': p.name,
                            'weeklyCapacity': p.weekly_capacity or 0,
                            'department': p.department_id,
                        })

                    # Build hours map per person
                    def hours_for_week_from_json(weekly_hours: dict, sunday_key: str) -> float:
                        if not weekly_hours:
                            return 0.0
                        try:
                            return float(weekly_hours.get(sunday_key) or 0)
                        except (TypeError, ValueError):
                            return 0.0

                    hours_by_person = {}
                    for p in people_qs:
                        wk_map = {}
                        # iterate prefetched assignments
                        for wk in week_keys:
                            wk_total = 0.0
                            for a in getattr(p, 'assignments').all():
                                wh = a.weekly_hours or {}
                                wk_total += hours_for_week_from_json(wh, wk)
                            if wk_total != 0.0:
                                # store non-zero to keep payload compact; client may treat missing as 0
                                wk_map[wk] = round(wk_total, 2)
                        hours_by_person[p.id] = wk_map

                    payload = {
                        'weekKeys': week_keys,
                        'people': people_list,
                        'hoursByPerson': hours_by_person,
                    }
                    if use_cache:
                        try:
                            cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
                        except Exception:
                            pass
            finally:
                if use_cache:
                    try:
                        cache.delete(lock_key)
                    except Exception:
                        pass

        response = Response(payload)
        response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
        response['Cache-Control'] = 'private, max-age=30'
        return response

    @extend_schema(
        description="Start async grid snapshot job and return task ID for polling.",
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False, description='Number of weeks (1-26), default 12'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
        ],
        responses=inline_serializer(name='GridSnapshotAsyncResponse', fields={'jobId': serializers.CharField()})
    )
    @action(detail=False, methods=['get'], url_path='grid_snapshot_async', throttle_classes=[GridSnapshotThrottle])
    def grid_snapshot_async(self, request):
        if generate_grid_snapshot_async is None:
            return Response({'detail': 'Async jobs not available'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12
        dept_param = request.query_params.get('department')
        dept = None
        if dept_param not in (None, ""):
            try:
                dept = int(dept_param)
            except Exception:
                dept = None
        include_children = 1 if request.query_params.get('include_children') == '1' else 0
        try:
            job = generate_grid_snapshot_async.delay(weeks, dept, include_children)
        except Exception as e:
            return Response({'detail': f'Failed to enqueue job: {e.__class__.__name__}'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'jobId': job.id}, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        description="Bulk update weekly hours for multiple assignments in a single transaction.",
        request=inline_serializer(
            name='BulkUpdateHoursRequest',
            fields={
                'updates': serializers.ListField(child=inline_serializer(name='AssignmentHoursUpdate', fields={
                    'assignmentId': serializers.IntegerField(),
                    'weeklyHours': serializers.DictField(child=serializers.FloatField()),
                }))
            }
        ),
        responses=inline_serializer(
            name='BulkUpdateHoursResponse',
            fields={
                'success': serializers.BooleanField(),
                'results': serializers.ListField(child=inline_serializer(name='BulkUpdateResultItem', fields={
                    'assignmentId': serializers.IntegerField(),
                    'status': serializers.CharField(),
                    'etag': serializers.CharField(),
                })),
            }
        )
    )
    @action(detail=False, methods=['patch'], url_path='bulk_update_hours')
    def bulk_update_hours(self, request):
        """All-or-nothing bulk weekly hours update with per-item results and refreshed ETags."""
        from django.db import transaction
        data = request.data or {}
        updates = data.get('updates') or []
        if not isinstance(updates, list) or len(updates) == 0:
            return Response({'detail': 'updates[] required'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate shapes early
        try:
            normalized = []
            for u in updates:
                aid = int(u.get('assignmentId'))
                wh = u.get('weeklyHours') or {}
                if not isinstance(wh, dict):
                    return Response({'detail': f'invalid weeklyHours for assignmentId {aid}'}, status=status.HTTP_400_BAD_REQUEST)
                normalized.append((aid, wh))
        except Exception:
            return Response({'detail': 'Invalid updates payload'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Load all assignments first
            asn_map = {a.id: a for a in Assignment.objects.select_for_update().filter(id__in=[aid for aid, _ in normalized])}
            if len(asn_map) != len(normalized):
                return Response({'detail': 'One or more assignments not found'}, status=status.HTTP_404_NOT_FOUND)

            # Apply updates and validate capacity via serializer per item
            for aid, wh in normalized:
                a = asn_map[aid]
                ser = AssignmentSerializer(instance=a, data={'weeklyHours': wh}, partial=True)
                if not ser.is_valid():
                    return Response({'detail': ser.errors}, status=status.HTTP_409_CONFLICT)
                ser.save()

        # Success, compute refreshed ETags
        results = []
        for aid, _ in normalized:
            a = Assignment.objects.get(id=aid)
            # ETag based on updated_at via ETagConditionalMixin logic
            try:
                lm = getattr(a, 'updated_at', None)
                payload = lm.isoformat() if lm else str(a.id)
                etag = hashlib.sha256(payload.encode()).hexdigest()
            except Exception:
                etag = hashlib.sha256(str(a.id).encode()).hexdigest()
            results.append({'assignmentId': a.id, 'status': 'ok', 'etag': etag})

        return Response({'success': True, 'results': results})

    def create(self, request, *args, **kwargs):
        """Create assignment with validation"""
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            assignment = serializer.save()
            return Response(
                self.get_serializer(assignment).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @extend_schema(
        parameters=[
            OpenApiParameter(name='person_id', type=int, required=False, description='Filter by person id'),
        ]
    )
    @action(detail=False, methods=['get'])
    def by_person(self, request):
        """Get assignments grouped by person"""
        person_id = request.query_params.get('person_id')
        if person_id:
            queryset = self.get_queryset().filter(person_id=person_id)
        else:
            queryset = self.get_queryset()
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(
        detail=False,
        methods=['post'],
        throttle_classes=[HotEndpointThrottle],
    )
    @extend_schema(
        request=inline_serializer(
            name='AssignmentConflictRequest',
            fields={
                'personId': serializers.IntegerField(),
                'projectId': serializers.IntegerField(),
                'weekKey': serializers.CharField(),
                'proposedHours': serializers.FloatField(required=False),
            },
        ),
        responses=inline_serializer(
            name='AssignmentConflictResponse',
            fields={
                'hasConflict': serializers.BooleanField(),
                'warnings': serializers.ListField(child=serializers.CharField()),
                'totalHours': serializers.FloatField(),
                'totalWithProposed': serializers.FloatField(),
                'personCapacity': serializers.IntegerField(),
                'availableHours': serializers.FloatField(),
                'currentAssignments': serializers.ListField(child=inline_serializer(name='AssignmentConflictItem', fields={
                    'projectName': serializers.CharField(),
                    'hours': serializers.FloatField(),
                    'assignmentId': serializers.IntegerField(),
                })),
                'projectBreakdown': serializers.DictField(child=serializers.FloatField()),
            },
        ),
    )
    def check_conflicts(self, request):
        """
        Check assignment conflicts for a person in a specific week.
        Optimized to prevent N+1 queries by fetching all person assignments
        in a single query.
        """
        try:
            person_id = request.data.get('personId')
            project_id = request.data.get('projectId')
            week_key = request.data.get('weekKey')
            proposed_hours = float(request.data.get('proposedHours', 0))
            
            if not all([person_id, project_id, week_key]):
                return Response(
                    {
                        'error': (
                            'Missing required fields: personId, projectId, '
                            'weekKey'
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            
            # Get person and validate capacity
            try:
                person = Person.objects.get(id=person_id)
            except Person.DoesNotExist:
                return Response({
                    'error': 'Person not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            person_capacity = person.weekly_capacity or 36
            
            # Get ALL assignments for this person in a single query
            # with project info
            person_assignments = Assignment.objects.filter(
                person_id=person_id,
                is_active=True
            ).select_related('project')
            
            # Calculate current week hours and collect project assignments
            total_hours = 0
            current_assignments = []
            project_assignments = {}
            
            for assignment in person_assignments:
                # Get hours for the specific week from JSON field
                weekly_hours = assignment.weekly_hours or {}
                week_hours = weekly_hours.get(week_key, 0)
                
                if week_hours > 0:
                    total_hours += week_hours
                    project_name = (
                        assignment.project.name
                        if assignment.project
                        else f"Project {assignment.project_id}"
                    )
                    
                    # Group by project
                    if project_name not in project_assignments:
                        project_assignments[project_name] = 0
                    project_assignments[project_name] += week_hours
                    
                    current_assignments.append({
                        'projectName': project_name,
                        'hours': week_hours,
                        'assignmentId': assignment.id
                    })
            
            # Add proposed hours to total
            total_with_proposed = total_hours + proposed_hours
            
            # Generate warnings and conflict status
            warnings = []
            has_conflict = total_with_proposed > person_capacity
            
            if has_conflict:
                overage_hours = total_with_proposed - person_capacity
                overage_percent = round(
                    (total_with_proposed / person_capacity) * 100
                )
                warnings.append(
                    f"{person.name} would be at {overage_percent}% capacity "
                    f"({total_with_proposed}h/{person_capacity}h) - "
                    f"{overage_hours}h over limit"
                )
                
                # Add project breakdown if there are existing assignments
                if project_assignments:
                    warnings.append("Current assignments:")
                    for project_name, hours in project_assignments.items():
                        warnings.append(f"- {project_name}: {hours}h")
            
            return Response({
                'hasConflict': has_conflict,
                'warnings': warnings,
                'totalHours': total_hours,
                'totalWithProposed': total_with_proposed,
                'personCapacity': person_capacity,
                'availableHours': max(0, person_capacity - total_hours),
                'currentAssignments': current_assignments,
                'projectBreakdown': project_assignments
            })
            
        except ValueError as e:
            return Response({
                'error': f'Invalid data format: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                'error': f'Internal server error: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'])
    def rebalance_suggestions(self, request):
        """Suggest non-destructive rebalancing ideas across the next N weeks
        (default 12).

            Heuristic:
            - Overallocated: utilization > 100% (based on 1-week snapshot)
            - Underutilized: utilization < 70%
            - Pair over with under and propose shifting 4–8 hours
            Returns at most 20 suggestions.
        """
        try:
            horizon_weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            horizon_weeks = 12

        suggestions = (
            WorkloadRebalancingService
            .generate_rebalance_suggestions(weeks=horizon_weeks)
        )
        return Response(suggestions)
