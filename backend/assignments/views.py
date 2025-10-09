"""
Assignment API Views - Chunk 3
Uses AutoMapped serializers for naming prevention
"""

from rest_framework import viewsets, status
from core.etag import ETagConditionalMixin
from drf_spectacular.utils import extend_schema, OpenApiParameter, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import UserRateThrottle, ScopedRateThrottle
from django.db.models import Sum, Max, Prefetch, Value  # noqa: F401
from django.db.models.functions import Coalesce, Lower
from .models import Assignment
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


class AssignmentViewSet(ETagConditionalMixin, viewsets.ModelViewSet):
    """
    Assignment CRUD API with utilization tracking
    Uses AutoMapped serializer for automatic snake_case -> camelCase conversion
    """
    queryset = (
        Assignment.objects.filter(is_active=True)
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
                etag = hashlib.md5(last_modified.isoformat().encode()).hexdigest()
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
        qs = Assignment.objects.filter(is_active=True).select_related('project', 'person')
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

        # Deliverables aggregates (for shading and filters)
        deliverables_by_week = {}
        has_future_deliverables = {}
        try:
            deliv_qs = Deliverable.objects.filter(project_id__in=project_ids)
            now = date.today()
            for d in deliv_qs.only('project_id', 'date'):
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
                from core.week_utils import sunday_of_week
                wk = sunday_of_week(dt).isoformat()
                if wk in week_keys:
                    deliverables_by_week.setdefault(pid, {})
                    deliverables_by_week[pid][wk] = deliverables_by_week[pid].get(wk, 0) + 1
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

        qs = Assignment.objects.filter(is_active=True, project_id__in=project_ids).select_related('person', 'project')
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
        etag_content = f"{weeks}-{cache_scope}-" + (last_modified.isoformat() if last_modified else 'none')
        etag = hashlib.md5(etag_content.encode()).hexdigest()

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
                etag = hashlib.md5(payload.encode()).hexdigest()
            except Exception:
                etag = hashlib.md5(str(a.id).encode()).hexdigest()
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
