"""
People API Views - Using AutoMapped serializers for naming prevention
"""

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import UserRateThrottle, ScopedRateThrottle
from django.db.models import Sum, Max, Prefetch, Value, Count
from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponseNotModified, StreamingHttpResponse
from django.utils.http import http_date
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from .models import Person
from core.etag import ETagConditionalMixin
from departments.models import Department
from .serializers import (
    PersonSerializer,
    PersonCapacityHeatmapItemSerializer,
    WorkloadForecastItemSerializer,
    SkillMatchRequestSerializer,
    SkillMatchResultItemSerializer,
)
from .utils.excel_handler import export_people_to_excel, import_people_from_excel
from .services import CapacityAnalysisService
import hashlib
import json
import io
import time
from datetime import datetime, timedelta, date
import os
from assignments.models import Assignment
from django.db.models import Q
from django.db.models.functions import Coalesce, Lower
from core.search_tokens import parse_search_tokens, apply_token_filter
from django.conf import settings as django_settings
from drf_spectacular.utils import extend_schema, OpenApiParameter, inline_serializer
from rest_framework import serializers
from skills.models import PersonSkill, SkillTag
try:
    from core.tasks import bulk_skill_matching_async  # type: ignore
except Exception:
    bulk_skill_matching_async = None  # type: ignore
try:
    # Celery tasks (optional until async jobs are enabled)
    from .tasks import export_people_excel_task, import_people_excel_task, deactivate_person_cleanup_task
except Exception:
    export_people_excel_task = None  # type: ignore
    import_people_excel_task = None  # type: ignore
    deactivate_person_cleanup_task = None  # type: ignore
from .services import deactivate_person_cleanup

class FindAvailableThrottle(ScopedRateThrottle):
    scope = 'find_available'

class HotEndpointThrottle(UserRateThrottle):
    """Special throttle for hot endpoints like utilization checking"""
    scope = 'hot_endpoint'

class HeatmapThrottle(ScopedRateThrottle):
    """Higher-rate throttle for aggregate heatmap reads"""
    scope = 'heatmap'

class SkillMatchThrottle(ScopedRateThrottle):
    """Throttle for skill match endpoint"""
    scope = 'skill_match'

class PersonViewSet(ETagConditionalMixin, viewsets.ModelViewSet):
    """
    Person CRUD API with utilization calculations
    Uses AutoMapped serializer for automatic snake_case â†” camelCase conversion
    """
    queryset = Person.objects.all().order_by('-created_at')
    serializer_class = PersonSerializer
    
    def get_queryset(self):
        """Use active-only filter for list; allow all for detail/update.

        The list action hides inactive by default (unless include_inactive=1).
        Detail and write actions must be able to fetch inactive rows to allow
        toggling status — otherwise GET/PATCH on an inactive person 404s.
        """
        qs = (
            Person.objects
            .select_related('department', 'department__vertical', 'role')
            .only(
                'id', 'name', 'weekly_capacity', 'role', 'department', 'location', 'notes', 'created_at', 'updated_at',
                'department__name', 'department__vertical', 'department__vertical__name', 'role__name', 'is_active', 'hire_date'
            )
            .order_by('name')
        )

        # Apply active-only filter only for list action
        if getattr(self, 'action', None) == 'list':
            include_inactive = False
            try:
                req = getattr(self, 'request', None)
                if req is not None:
                    raw = req.query_params.get('include_inactive')
                    if raw is not None and str(raw).strip().lower() in ('1', 'true', 'yes', 'on'):
                        include_inactive = True
            except Exception:
                include_inactive = False
            if not include_inactive:
                qs = qs.filter(is_active=True)

        return qs

    def _apply_vertical_filter(self, queryset, vertical_param):
        if vertical_param in (None, ""):
            return queryset
        try:
            vertical_id = int(vertical_param)
        except Exception:
            return queryset
        return queryset.filter(department__vertical_id=vertical_id)

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
        for f in filters:
            op = f.get('op')
            dept_id = f.get('departmentId')
            if dept_id is None:
                continue
            if op == 'not':
                exclude_only.add(dept_id)
            elif op == 'or':
                include_any.add(dept_id)
            else:
                include_all.add(dept_id)
        def dept_q(ids: set[int]) -> Q:
            if not ids:
                return Q(pk__in=[])
            ids = set(ids)
            include_null = 0 in ids
            ids.discard(0)
            q = Q()
            if ids:
                q |= Q(department_id__in=list(ids))
            if include_null:
                q |= Q(department_id__isnull=True)
            return q

        if len(include_all) > 1:
            return queryset.none()
        if include_all:
            queryset = queryset.filter(dept_q(include_all))
        if include_any:
            queryset = queryset.filter(dept_q(include_any))
        if exclude_only:
            q_ex = Q()
            if 0 in exclude_only:
                q_ex |= Q(department_id__isnull=True)
            ex_ids = [d for d in exclude_only if d != 0]
            if ex_ids:
                q_ex |= Q(department_id__in=ex_ids)
            if q_ex:
                queryset = queryset.exclude(q_ex)
        return queryset

    def update(self, request, *args, **kwargs):
        """Override update to trigger deactivation cleanup when is_active flips to false.

        Enqueues a Celery task when available; otherwise runs synchronously in-process.
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        was_active = bool(instance.is_active)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        instance.refresh_from_db()

        now_inactive = was_active and (not instance.is_active)
        job_id = None
        if now_inactive:
            try:
                actor_id = getattr(getattr(request, 'user', None), 'id', None)
            except Exception:
                actor_id = None
            try:
                if deactivate_person_cleanup_task is not None:
                    task = deactivate_person_cleanup_task.delay(instance.id, 'all', actor_id)
                    try:
                        job_id = getattr(task, 'id', None)
                    except Exception:
                        job_id = None
                else:
                    # Fallback synchronous path
                    deactivate_person_cleanup(instance.id, zero_mode='all', actor_user_id=actor_id)
            except Exception:  # nosec B110
                # Non-fatal: the person is already inactive; aggregates will eventually reflect
                pass

        resp = Response(serializer.data)
        # Surface async job metadata via headers without changing response schema
        if job_id:
            try:
                resp['X-Job-Id'] = str(job_id)
                resp['X-Job-Status-Url'] = request.build_absolute_uri(f"/api/jobs/{job_id}/")
            except Exception:  # nosec B110
                pass
        return resp

    def partial_update(self, request, *args, **kwargs):  # type: ignore[override]
        # Reuse update logic (including deactivation cleanup), but avoid ETag precondition checks
        kwargs['partial'] = True
        response = self.update(request, *args, **kwargs)
        try:
            instance = self.get_object()
            self._attach_etag_headers(response, instance)
        except Exception:  # nosec B110
            pass
        return response
    
    @extend_schema(
        parameters=[
            OpenApiParameter(name='page', type=int, required=False, description='Page number'),
            OpenApiParameter(name='page_size', type=int, required=False, description='Page size'),
            OpenApiParameter(name='department', type=int, required=False, description='Filter by department id'),
            OpenApiParameter(name='include_children', type=int, required=False, description='Include child departments (0|1)'),
            OpenApiParameter(name='department_filters', type=str, required=False, description='JSON array of department filter clauses'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
            OpenApiParameter(name='all', type=str, required=False, description='Return all items without pagination when true'),
            OpenApiParameter(name='include_inactive', type=int, required=False, description='Include inactive people (0|1; default 0)'),
        ]
    )
    def list(self, request, *args, **kwargs):
        """Get all people with conditional request support (ETag/Last-Modified) and bulk loading"""
        queryset = self.get_queryset()

        # Optional department filter (by ID) with include_children support
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        if dept_param not in (None, ""):
            try:
                dept_id = int(dept_param)
                if include_children:
                    # Phase 3: Cache descendant resolution with versioned key for invalidation
                    try:
                        _ver = cache.get('dept_desc_ver', 1)
                    except Exception:
                        _ver = 1
                    cache_key = f"dept_desc:v{_ver}:{dept_id}"
                    ids = cache.get(cache_key)
                    if ids is None:
                        # Build adjacency map in a single query
                        rows = Department.objects.values_list('id', 'parent_department_id')
                        children = {}
                        for _id, parent in rows:
                            children.setdefault(parent, []).append(_id)
                        # BFS from root
                        ids_set = set()
                        stack = [dept_id]
                        while stack:
                            current = stack.pop()
                            if current in ids_set:
                                continue
                            ids_set.add(current)
                            for child in children.get(current, []):
                                if child not in ids_set:
                                    stack.append(child)
                        ids = list(ids_set)
                        try:
                            cache.set(cache_key, ids, timeout=int(os.getenv('DEPT_DESC_CACHE_TTL', '300')))
                        except Exception:  # nosec B110
                            pass
                    queryset = queryset.filter(department_id__in=ids)
                else:
                    queryset = queryset.filter(department_id=dept_id)
            except (TypeError, ValueError):  # nosec B110
                # Ignore invalid department filter; return unfiltered list
                pass
        dept_filters_raw = request.query_params.get('department_filters') or request.query_params.get('departmentFilters')
        dept_filters = self._parse_department_filters(dept_filters_raw)
        if dept_filters:
            queryset = self._apply_department_filters(queryset, dept_filters)
        # Optional vertical filter
        queryset = self._apply_vertical_filter(queryset, request.query_params.get('vertical'))
        
        # Check if bulk loading is requested
        if request.query_params.get('all') == 'true':
            # Return all people without pagination (Phase 2 optimization)
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        
        # Get the latest update timestamp
        last_modified = queryset.aggregate(Max('updated_at'))['updated_at__max']
        
        if last_modified:
            # ETag simplification: base on max(updated_at) only (avoid count())
            etag_content = last_modified.isoformat()
            etag = hashlib.sha256(etag_content.encode()).hexdigest()
            
            # Check If-None-Match header (ETag)
            if_none_match = request.META.get('HTTP_IF_NONE_MATCH')
            if if_none_match and if_none_match.strip('"') == etag:
                response = HttpResponseNotModified()
                response['ETag'] = f'"{etag}"'
                return response
            
            # Check If-Modified-Since header
            if_modified_since = request.META.get('HTTP_IF_MODIFIED_SINCE')
            if if_modified_since:
                try:
                    from django.utils.http import parse_http_date
                    if_modified_timestamp = parse_http_date(if_modified_since)
                    last_modified_timestamp = last_modified.timestamp()
                    
                    if last_modified_timestamp <= if_modified_timestamp:
                        response = HttpResponseNotModified()
                        response['ETag'] = f'"{etag}"'
                        response['Last-Modified'] = http_date(last_modified_timestamp)
                        return response
                except ValueError:
                    pass  # Invalid date format, ignore
        
        # Get the data and return with cache headers
        response = super().list(request, *args, **kwargs)
        
        if last_modified:
            response['ETag'] = f'"{etag}"'
            response['Last-Modified'] = http_date(last_modified.timestamp())
            response['Cache-Control'] = 'private, max-age=30'  # 30 seconds cache for authenticated responses
        
        return response

    def _paginate_post_queryset(self, request, queryset, data=None):
        """Paginate using body-provided page/page_size for POST search endpoints."""
        from django.core.paginator import Paginator
        from rest_framework.settings import api_settings

        payload = data or {}
        try:
            page_number = int(payload.get('page') or request.query_params.get('page') or 1)
        except Exception:
            page_number = 1
        try:
            page_size = int(payload.get('page_size') or request.query_params.get('page_size') or api_settings.PAGE_SIZE)
        except Exception:
            page_size = api_settings.PAGE_SIZE or 100
        max_size = getattr(api_settings, 'MAX_PAGE_SIZE', 200) or 200
        if page_size > max_size:
            page_size = max_size
        if page_size <= 0:
            page_size = api_settings.PAGE_SIZE or 100

        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page_number)

        def _page_url(num: int | None) -> str | None:
            if not num:
                return None
            try:
                params = request.query_params.copy()
                params['page'] = str(num)
                params['page_size'] = str(page_size)
                base = request.build_absolute_uri(request.path)
                return f"{base}?{params.urlencode()}" if params else base
            except Exception:
                return None

        next_url = _page_url(page_obj.next_page_number() if page_obj.has_next() else None)
        prev_url = _page_url(page_obj.previous_page_number() if page_obj.has_previous() else None)

        return page_obj, paginator, next_url, prev_url

    @extend_schema(
        description="Search people with tokenized filters and pagination.",
        request=inline_serializer(
            name='PeopleSearchRequest',
            fields={
                'page': serializers.IntegerField(required=False),
                'page_size': serializers.IntegerField(required=False),
                'department': serializers.IntegerField(required=False),
                'include_children': serializers.IntegerField(required=False),
                'department_filters': serializers.ListField(
                    child=inline_serializer(
                        name='DepartmentFilterPeople',
                        fields={
                            'departmentId': serializers.IntegerField(),
                            'op': serializers.ChoiceField(choices=['or', 'and', 'not'])
                        }
                    ),
                    required=False
                ),
                'vertical': serializers.IntegerField(required=False),
                'include_inactive': serializers.IntegerField(required=False),
                'location': serializers.ListField(child=serializers.CharField(), required=False),
                'ordering': serializers.CharField(required=False),
                'search_tokens': serializers.ListField(
                    child=inline_serializer(
                        name='SearchTokenPeople',
                        fields={
                            'term': serializers.CharField(),
                            'op': serializers.ChoiceField(choices=['or', 'and', 'not'])
                        }
                    ),
                    required=False
                ),
            }
        ),
        responses=inline_serializer(
            name='PeopleSearchResponse',
            fields={
                'count': serializers.IntegerField(),
                'next': serializers.CharField(allow_null=True, required=False),
                'previous': serializers.CharField(allow_null=True, required=False),
                'results': PersonSerializer(many=True),
            }
        )
    )
    @action(detail=False, methods=['post'], url_path='search')
    def search(self, request):
        data = request.data or {}

        include_inactive = str(data.get('include_inactive') or request.query_params.get('include_inactive') or '').lower() in ('1', 'true', 'yes', 'on')
        queryset = (
            Person.objects
            .select_related('department', 'role')
            .only(
                'id', 'name', 'weekly_capacity', 'role', 'department', 'location', 'notes', 'created_at', 'updated_at',
                'department__name', 'role__name', 'is_active', 'hire_date'
            )
        )
        if not include_inactive:
            queryset = queryset.filter(is_active=True)

        # Department filter with include_children
        dept_param = data.get('department') if isinstance(data, dict) else None
        if dept_param is None:
            dept_param = request.query_params.get('department')
        include_children = str(data.get('include_children') or request.query_params.get('include_children') or '0') == '1'
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
                        for d in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                            if d not in ids:
                                stack.append(d)
                    queryset = queryset.filter(department_id__in=list(ids))
                else:
                    queryset = queryset.filter(department_id=dept_id)
            except (TypeError, ValueError):  # nosec B110
                pass
        dept_filters_raw = data.get('department_filters') if isinstance(data, dict) else None
        if dept_filters_raw is None and isinstance(data, dict):
            dept_filters_raw = data.get('departmentFilters')
        dept_filters = self._parse_department_filters(dept_filters_raw)
        if dept_filters:
            queryset = self._apply_department_filters(queryset, dept_filters)

        # Vertical filter
        vertical_param = data.get('vertical') if isinstance(data, dict) else None
        if vertical_param is None:
            vertical_param = request.query_params.get('vertical')
        queryset = self._apply_vertical_filter(queryset, vertical_param)

        # Location filters (Remote substring + Unspecified)
        locations = data.get('location') if isinstance(data, dict) else None
        if locations is None:
            locations = request.query_params.getlist('location')
        if isinstance(locations, str):
            locations = [s.strip() for s in locations.split(',') if s.strip()]
        if isinstance(locations, list) and locations:
            location_q = Q()
            for loc in locations:
                if loc == 'Remote':
                    location_q |= Q(location__icontains='remote')
                elif loc == 'unspecified':
                    location_q |= Q(location__isnull=True) | Q(location__exact='')
                else:
                    location_q |= Q(location__iexact=loc)
            queryset = queryset.filter(location_q)

        # Tokenized search (parity with UI fields)
        tokens = parse_search_tokens(request=request, data=data)
        people_fields = ['name', 'role__name', 'department__name', 'location', 'notes']
        queryset = apply_token_filter(queryset, tokens, people_fields)

        # Ordering parity
        ordering = data.get('ordering') or request.query_params.get('ordering') or 'name'
        queryset = queryset.annotate(
            location_sort=Coalesce(Lower('location'), Value('zzz_unspecified')),
            department_sort=Coalesce(Lower('department__name'), Value('zzz_unassigned')),
            role_sort=Coalesce(Lower('role__name'), Value('zzz_no_role')),
        )
        ordering_fields = []
        for raw in str(ordering).split(','):
            raw = raw.strip()
            if not raw:
                continue
            desc = raw.startswith('-')
            key = raw[1:] if desc else raw
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
            queryset = queryset.order_by(*ordering_fields)
        else:
            queryset = queryset.order_by('name', 'id')

        page_obj, paginator, next_url, prev_url = self._paginate_post_queryset(request, queryset, data)
        serializer = self.get_serializer(page_obj.object_list, many=True)

        return Response({
            'count': paginator.count,
            'next': next_url,
            'previous': prev_url,
            'results': serializer.data,
        })

    @action(detail=True, methods=['get'], throttle_classes=[HotEndpointThrottle])
    def utilization(self, request, pk=None):
        """Get detailed utilization breakdown for a person - Chunk 3"""
        person = self.get_object()
        utilization_data = person.get_current_utilization()
        
        # Get assignments for detail
        assignments = person.assignments.filter(is_active=True).values(
            'project_name', 'allocation_percentage'
        )
        
        return Response({
            'person': person.name,
            'weeklyCapacity': person.weekly_capacity,
            'utilization': utilization_data,
            'assignments': list(assignments)
        })
    
    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        """Export people to Excel with streaming response for large datasets"""
        # When async jobs feature is on, submit a background job and return job id
        if django_settings.FEATURES.get('ASYNC_JOBS') and export_people_excel_task is not None:
            filters = {}
            role = request.query_params.get('role')
            if role:
                filters['role'] = role
            department = request.query_params.get('department')
            if department:
                filters['department'] = department
            task = export_people_excel_task.delay(filters)
            job_id = task.id
            return Response({
                'jobId': job_id,
                'statusUrl': request.build_absolute_uri(f"/api/jobs/{job_id}/"),
                'downloadUrl': request.build_absolute_uri(f"/api/jobs/{job_id}/download/")
            }, status=status.HTTP_202_ACCEPTED)

        # Get filtered queryset (sync path)
        queryset = self.get_queryset()
        
        # Apply any filters from query params
        role = request.query_params.get('role')
        if role:
            # Role is a ForeignKey; filter by role name for substring match
            queryset = queryset.filter(role__name__icontains=role)
            
        department = request.query_params.get('department')
        if department:
            queryset = queryset.filter(department__name__icontains=department)
        
        count = queryset.count()
        
        # For large datasets, use streaming response with progress
        if count > 100:
            return self._stream_excel_export(queryset, count)
        else:
            # Direct response for small datasets
            response = export_people_to_excel(queryset)
            return response
    
    def _stream_excel_export(self, queryset, total_count):
        """Stream Excel export with progress updates for large datasets"""
        def generate_excel_with_progress():
            """Generator that yields progress updates and final Excel data"""
            
            # Yield initial progress
            yield self._progress_chunk({
                'stage': 'preparing',
                'message': f'Preparing to export {total_count} people...',
                'progress': 0,
                'total': total_count
            })
            
            # Process in chunks of 100
            chunk_size = 100
            processed = 0
            all_data = []
            
            # Get data in chunks with progress updates
            for chunk_start in range(0, total_count, chunk_size):
                chunk_queryset = queryset[chunk_start:chunk_start + chunk_size]
                
                # Serialize chunk
                serializer = PersonSerializer(chunk_queryset, many=True)
                all_data.extend(serializer.data)
                
                processed += len(serializer.data)
                progress_percent = int((processed / total_count) * 100)
                
                yield self._progress_chunk({
                    'stage': 'processing',
                    'message': f'Processed {processed}/{total_count} people...',
                    'progress': progress_percent,
                    'total': total_count
                })
                
                # Small delay to show progress (dev only)
                if settings.DEBUG:
                    time.sleep(0.05)
            
            # Generate Excel file
            yield self._progress_chunk({
                'stage': 'generating',
                'message': 'Generating Excel file...',
                'progress': 95,
                'total': total_count
            })
            
            # Create Excel response
            response = export_people_to_excel(queryset)
            
            # Yield completion with file data
            yield self._progress_chunk({
                'stage': 'complete',
                'message': f'Export completed: {total_count} people',
                'progress': 100,
                'total': total_count,
                'download_ready': True
            })
            
            # Yield the actual file data as base64
            excel_content = response.content
            import base64
            yield json.dumps({
                'type': 'file_data',
                'filename': f'people_export_{total_count}_records.xlsx',
                'content': base64.b64encode(excel_content).decode('utf-8'),
                'content_type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }) + '\n'
        
        response = StreamingHttpResponse(
            generate_excel_with_progress(), 
            content_type='text/plain'
        )
        response['Cache-Control'] = 'no-cache'
        return response

    def destroy(self, request, *args, **kwargs):
        """Delete a person by primary key.

        Note: bypass get_queryset() filtering so deletes work even if the record
        is inactive or excluded from the default list queryset.
        Still enforces object-level permissions before deletion.
        """
        pk = kwargs.get('pk')
        try:
            obj = Person.objects.get(pk=pk)
        except Person.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Enforce permissions for this object
        self.check_object_permissions(request, obj)

        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _progress_chunk(self, progress_data):
        """Format progress data as JSON chunk"""
        return json.dumps({
            'type': 'progress',
            **progress_data
        }) + '\n'

    @extend_schema(
        parameters=[
            OpenApiParameter(name='search', type=str, required=False, description='Substring of name'),
            OpenApiParameter(name='q', type=str, required=False, description='Alias for search'),
            OpenApiParameter(name='limit', type=int, required=False, description='Max results (1-50)'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
        ],
        responses=inline_serializer(name='PeopleAutocompleteItem', fields={
            'id': serializers.IntegerField(),
            'name': serializers.CharField(),
            'department': serializers.IntegerField(allow_null=True, required=False),
        })
    )
    @action(detail=False, methods=['get'])
    def autocomplete(self, request):
        """Lightweight autocomplete for active people.

        Query params:
        - search or q: optional substring of name
        - limit: max results (default 20)
        """
        q = request.query_params.get('search') or request.query_params.get('q') or ''
        try:
            limit = int(request.query_params.get('limit', '20'))
        except Exception:
            limit = 20
        limit = max(1, min(50, limit))
        # Build a slim queryset explicitly to avoid conflicts between
        # select_related() from get_queryset and deferred fields via only().
        qs = (
            Person.objects.filter(is_active=True)
            .only('id', 'name', 'department')
            .order_by('name')
        )
        if q:
            qs = qs.filter(name__icontains=q)
        vertical_param = request.query_params.get('vertical')
        qs = self._apply_vertical_filter(qs, vertical_param)
        qs = qs[:limit]
        data = [
            {
                'id': p.id,
                'name': p.name,
                'department': p.department_id,
            }
            for p in qs
        ]
        return Response(data)

    @extend_schema(
        parameters=[
            OpenApiParameter(name='q', type=str, required=True, description='Search query (min length 2)'),
            OpenApiParameter(name='limit', type=int, required=False, description='Max results (1-50)'),
            OpenApiParameter(name='department', type=int, required=False, description='Filter by department id'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
        ],
        responses=inline_serializer(name='PeopleSearchItem', fields={
            'id': serializers.IntegerField(),
            'name': serializers.CharField(),
            'department': serializers.IntegerField(allow_null=True, required=False),
            'roleName': serializers.CharField(allow_null=True, required=False),
        })
    )
    @action(detail=False, methods=['get'], url_path='typeahead', throttle_classes=[HotEndpointThrottle])
    def typeahead(self, request):
        """Server-side typeahead for People.

        Params:
        - q: required search query (min length 2)
        - limit: optional, default 20, max 50
        Returns minimal projection: id, name, department
        """
        q = (request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response({'detail': 'Query too short'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            limit = int(request.query_params.get('limit', '20'))
        except Exception:
            limit = 20
        limit = max(1, min(50, limit))
        dept_param = request.query_params.get('department')
        dept_id = None
        if dept_param not in (None, ''):
            try:
                dept_id = int(dept_param)
            except Exception:
                dept_id = None

        # Use a fresh base queryset without select_related to avoid
        # deferred-field conflicts with only().
        qs = (
            Person.objects.filter(is_active=True)
            .select_related('role')
            .only('id', 'name', 'department', 'role__name')
            .filter(Q(name__icontains=q) | Q(email__icontains=q) | Q(role__name__icontains=q))
            .order_by('name')
        )
        if dept_id is not None:
            qs = qs.filter(department_id=dept_id)
        vertical_param = request.query_params.get('vertical')
        qs = self._apply_vertical_filter(qs, vertical_param)
        qs = qs[:limit]
        results = [
            {
                'id': p.id,
                'name': p.name,
                'department': p.department_id,
                'roleName': getattr(getattr(p, 'role', None), 'name', None),
            }
            for p in qs
        ]
        return Response(results)

    @extend_schema(
        parameters=[
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
            OpenApiParameter(name='include_inactive', type=int, required=False, description='Include inactive people (0|1; default 0)'),
        ],
        responses=inline_serializer(name='PeopleFiltersMetadata', fields={
            'locations': serializers.ListField(child=serializers.CharField()),
            'departments': serializers.ListField(child=inline_serializer(
                name='PeopleFiltersDepartment',
                fields={
                    'id': serializers.IntegerField(),
                    'name': serializers.CharField(),
                }
            )),
        })
    )
    @action(detail=False, methods=['get'], url_path='filters_metadata')
    def filters_metadata(self, request):
        include_inactive = str(request.query_params.get('include_inactive') or '').lower() in ('1', 'true', 'yes', 'on')
        vertical_param = request.query_params.get('vertical')

        people_qs = Person.objects.all()
        if not include_inactive:
            people_qs = people_qs.filter(is_active=True)
        if vertical_param not in (None, ""):
            try:
                people_qs = self._apply_vertical_filter(people_qs, vertical_param)
                cache_scope = f"{cache_scope}_v{int(vertical_param)}"
            except Exception:  # nosec B110
                pass
        else:
            people_qs = self._apply_vertical_filter(people_qs, vertical_param)

        locations = list(
            people_qs
            .exclude(location__isnull=True)
            .exclude(location__exact='')
            .values_list('location', flat=True)
            .distinct()
        )

        dept_qs = Department.objects.filter(is_active=True).only('id', 'name')
        if vertical_param not in (None, ""):
            try:
                dept_qs = dept_qs.filter(vertical_id=int(vertical_param))
            except Exception:
                pass

        departments = [{'id': d.id, 'name': d.name} for d in dept_qs.order_by('name')]

        return Response({
            'locations': sorted(set(locations), key=lambda v: (str(v).lower(), str(v))),
            'departments': departments,
        })

    @extend_schema(
        parameters=[
            OpenApiParameter(name='week', type=str, required=False, description='YYYY-MM-DD (Monday) week key'),
            OpenApiParameter(name='skills', type=str, required=False, description='Comma-separated skill names'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
            OpenApiParameter(name='limit', type=int, required=False, description='Max results (1-200), default 100'),
            OpenApiParameter(name='minAvailableHours', type=float, required=False, description='Filter to people with at least this many hours free'),
        ],
        responses=SkillMatchResultItemSerializer(many=True)
    )
    @action(detail=False, methods=['get'], url_path='find_available', throttle_classes=[FindAvailableThrottle])
    def find_available(self, request):
        from datetime import datetime as _dt, timedelta as _td
        week_str = request.query_params.get('week')
        if week_str:
            try:
                d = _dt.strptime(week_str, '%Y-%m-%d').date()
                week_monday = d - _td(days=d.weekday())
            except Exception:
                return Response({'detail': 'Invalid week format, expected YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            today = _dt.today().date()
            week_monday = today - _td(days=today.weekday())

        raw_skills = (request.query_params.get('skills') or '').strip()
        req_skills = [s.strip().lower() for s in raw_skills.split(',') if s.strip()]
        try:
            limit = int(request.query_params.get('limit', '100'))
        except Exception:
            limit = 100
        if limit < 1 or limit > 200:
            return Response({'detail': 'Requested limit too large'}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        try:
            min_available = float(request.query_params.get('minAvailableHours', '0'))
        except Exception:
            min_available = 0.0

        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        vertical_param = request.query_params.get('vertical')

        people_qs = Person.objects.filter(is_active=True).select_related('department', 'role')
        cache_scope = 'all'
        if dept_param not in (None, ""):
            try:
                dept_id = int(dept_param)
                if include_children:
                    try:
                        _ver = cache.get('dept_desc_ver', 1)
                    except Exception:
                        _ver = 1
                    cache_key_desc = f"dept_desc:v{_ver}:{dept_id}"
                    ids = cache.get(cache_key_desc)
                    if ids is None:
                        rows = Department.objects.values_list('id', 'parent_department_id')
                        children = {}
                        for _id, parent in rows:
                            children.setdefault(parent, []).append(_id)
                        ids_set = set()
                        stack = [dept_id]
                        while stack:
                            current = stack.pop()
                            if current in ids_set:
                                continue
                            ids_set.add(current)
                            for child in children.get(current, []):
                                if child not in ids_set:
                                    stack.append(child)
                        ids = list(ids_set)
                        try:
                            cache.set(cache_key_desc, ids, timeout=3600)
                        except Exception:  # nosec B110
                            pass
                    people_qs = people_qs.filter(department_id__in=ids)
                    cache_scope = f'dept_{dept_id}_children'
                else:
                    people_qs = people_qs.filter(department_id=dept_id)
                    cache_scope = f'dept_{dept_id}'
            except (TypeError, ValueError):  # nosec B110
                pass
        if vertical_param not in (None, ""):
            try:
                people_qs = self._apply_vertical_filter(people_qs, vertical_param)
                cache_scope = f"{cache_scope}_v{int(vertical_param)}"
            except Exception:  # nosec B110
                pass
        else:
            people_qs = self._apply_vertical_filter(people_qs, vertical_param)

        skill_qs = PersonSkill.objects.select_related('skill_tag')
        asn_qs = Assignment.objects.filter(is_active=True)
        if vertical_param not in (None, ""):
            try:
                asn_qs = asn_qs.filter(project__vertical_id=int(vertical_param))
            except Exception:
                pass
        asn_qs = asn_qs.only('weekly_hours', 'person_id')
        people_qs = people_qs.prefetch_related(Prefetch('skills', queryset=skill_qs), Prefetch('assignments', queryset=asn_qs))

        try:
            version = cache.get('analytics_cache_version', 1)
        except Exception:
            version = 1
        skills_key = ','.join(sorted(req_skills)) if req_skills else 'none'
        cache_key = f"find_available_v{version}:{week_monday.isoformat()}:{skills_key}:{cache_scope}:{limit}:{int(min_available)}"

        ps_lm = PersonSkill.objects.aggregate(last_modified=Max('updated_at')).get('last_modified')
        st_lm = SkillTag.objects.aggregate(last_modified=Max('updated_at')).get('last_modified')
        asn_lm_qs = Assignment.objects.all()
        if vertical_param not in (None, ""):
            try:
                asn_lm_qs = asn_lm_qs.filter(project__vertical_id=int(vertical_param))
            except Exception:
                pass
        asn_lm = asn_lm_qs.aggregate(last_modified=Max('updated_at')).get('last_modified')
        lm_candidates = [ps_lm, st_lm, asn_lm]
        last_modified = max([dt for dt in lm_candidates if dt]) if any(lm_candidates) else None

        etag = hashlib.sha256(f"{cache_key}-".encode() + (last_modified.isoformat().encode() if last_modified else b'none')).hexdigest()

        if_none_match = request.META.get('HTTP_IF_NONE_MATCH')
        if if_none_match and if_none_match.strip('"') == etag:
            resp = HttpResponseNotModified()
            resp['ETag'] = f'"{etag}"'
            if last_modified:
                resp['Last-Modified'] = http_date(last_modified.timestamp())
            return resp

        payload = None
        try:
            payload = cache.get(cache_key)
        except Exception:
            payload = None
        if payload is None:
            lock_key = f"lock:{cache_key}"
            got_lock = False
            try:
                got_lock = cache.add(lock_key, '1', timeout=10)
            except Exception:
                got_lock = True
            if not got_lock:
                t0 = time.time()
                while time.time() - t0 < 2.0:
                    try:
                        payload = cache.get(cache_key)
                        if payload is not None:
                            break
                    except Exception:  # nosec B110
                        pass
                    time.sleep(0.05)
        if payload is None:
            wk_key = week_monday.strftime('%Y-%m-%d')
            results = []
            for p in people_qs:
                cap = float(p.weekly_capacity or 0)
                allocated = 0.0
                for a in getattr(p, 'assignments').all():
                    wh = a.weekly_hours or {}
                    val = 0.0
                    if wk_key in wh:
                        try:
                            val = float(wh[wk_key] or 0)
                        except (TypeError, ValueError):
                            val = 0.0
                    else:
                        for off in range(-3, 4):
                            d2 = week_monday + _td(days=off)
                            k2 = d2.strftime('%Y-%m-%d')
                            if k2 in wh:
                                try:
                                    val = float(wh[k2] or 0)
                                except (TypeError, ValueError):
                                    val = 0.0
                                break
                    allocated += val
                available = max(0.0, cap - allocated)
                if available < min_available:
                    continue
                util_pct = round((allocated / cap * 100.0), 1) if cap > 0 else 0.0

                # Skills
                skill_names = []
                for ps in getattr(p, 'skills').all():
                    if ps.skill_tag and ps.skill_tag.name:
                        skill_names.append(ps.skill_tag.name.lower())
                matched, missing = [], []
                for rs in req_skills:
                    ok = any((rs in sn) or (sn in rs) for sn in skill_names)
                    (matched if ok else missing).append(rs)
                skill_score = (len(matched) / len(req_skills) * 100.0) if req_skills else 0.0
                avail_pct = (available / cap * 100.0) if cap > 0 else 0.0
                combined = 0.5 * avail_pct + 0.5 * skill_score

                results.append({
                    'personId': p.id,
                    'name': p.name,
                    'availableHours': round(available, 1),
                    'capacity': cap,
                    'utilizationPercent': util_pct,
                    'skillScore': round(skill_score, 1),
                    'matchedSkills': matched,
                    'missingSkills': missing,
                    'departmentId': p.department_id,
                    'roleName': getattr(p.role, 'name', None) if getattr(p, 'role', None) else None,
                    '_score': combined,
                })
            results.sort(key=lambda x: (-x['_score'], x['name']))
            for r in results:
                r.pop('_score', None)
            payload = results[:limit]
            try:
                cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
            except Exception:  # nosec B110
                pass
            try:
                cache.delete(lock_key)
            except Exception:  # nosec B110
                pass

        response = Response(payload)
        response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
        response['Cache-Control'] = 'private, max-age=30'
        return response

    @extend_schema(
        parameters=[
            OpenApiParameter(name='skills', type=str, required=True, description='Comma-separated skill names'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
            OpenApiParameter(name='limit', type=int, required=False, description='Max results (1-200), default 50'),
            OpenApiParameter(name='week', type=str, required=False, description='YYYY-MM-DD (Monday) for availability-aware scoring'),
        ],
        responses=SkillMatchResultItemSerializer(many=True)
    )
    @action(detail=False, methods=['get'], url_path='skill_match', throttle_classes=[SkillMatchThrottle])
    def skill_match(self, request):
        """Rank people by skills (and optionally availability for a given week).

        Returns an array of items: { personId, name, score, matchedSkills[], missingSkills[], departmentId, roleName }.
        Score is based on percent of required skills matched (case-insensitive contains) and optionally blended with availability when `week` is provided.
        """
        from datetime import datetime as _dt, timedelta as _td

        raw_skills = (request.query_params.get('skills') or '').strip()
        if not raw_skills:
            return Response({'detail': 'skills is required (comma-separated)'}, status=status.HTTP_400_BAD_REQUEST)
        req_skills = [s.strip().lower() for s in raw_skills.split(',') if s.strip()]
        if not req_skills:
            return Response({'detail': 'No valid skills provided'}, status=status.HTTP_400_BAD_REQUEST)

        # limit
        try:
            limit = int(request.query_params.get('limit', '50'))
        except Exception:
            limit = 50
        if limit < 1 or limit > 200:
            return Response({'detail': 'Requested limit too large'}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        # Department scoping
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        vertical_param = request.query_params.get('vertical')

        # Optional availability week (normalize to Monday)
        week_str = request.query_params.get('week')
        week_monday = None
        if week_str:
            try:
                d = _dt.strptime(week_str, '%Y-%m-%d').date()
                week_monday = d - _td(days=d.weekday())
            except Exception:
                return Response({'detail': 'Invalid week format, expected YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        # Base queryset
        people_qs = (
            Person.objects.filter(is_active=True)
            .select_related('department', 'role')
        )
        cache_scope = 'all'
        if dept_param not in (None, ""):
            try:
                dept_id = int(dept_param)
                if include_children:
                    try:
                        _ver = cache.get('dept_desc_ver', 1)
                    except Exception:
                        _ver = 1
                    cache_key_desc = f"dept_desc:v{_ver}:{dept_id}"
                    ids = cache.get(cache_key_desc)
                    if ids is None:
                        rows = Department.objects.values_list('id', 'parent_department_id')
                        children = {}
                        for _id, parent in rows:
                            children.setdefault(parent, []).append(_id)
                        ids_set = set()
                        stack = [dept_id]
                        while stack:
                            current = stack.pop()
                            if current in ids_set:
                                continue
                            ids_set.add(current)
                            for child in children.get(current, []):
                                if child not in ids_set:
                                    stack.append(child)
                        ids = list(ids_set)
                        try:
                            cache.set(cache_key_desc, ids, timeout=3600)
                        except Exception:  # nosec B110
                            pass
                    people_qs = people_qs.filter(department_id__in=ids)
                    cache_scope = f'dept_{dept_id}_children'
                else:
                    people_qs = people_qs.filter(department_id=dept_id)
                    cache_scope = f'dept_{dept_id}'
            except (TypeError, ValueError):  # nosec B110
                pass
        if vertical_param not in (None, ""):
            try:
                people_qs = self._apply_vertical_filter(people_qs, vertical_param)
                cache_scope = f"{cache_scope}_v{int(vertical_param)}"
            except Exception:  # nosec B110
                pass

        # Prefetch skills and assignments (if week provided)
        skill_qs = PersonSkill.objects.select_related('skill_tag')
        prefetches = [Prefetch('skills', queryset=skill_qs)]
        if week_monday is not None:
            asn_qs = Assignment.objects.filter(is_active=True)
            if vertical_param not in (None, ""):
                try:
                    asn_qs = asn_qs.filter(project__vertical_id=int(vertical_param))
                except Exception:
                    pass
            asn_qs = asn_qs.only('weekly_hours', 'person_id')
            prefetches.append(Prefetch('assignments', queryset=asn_qs))
        people_qs = people_qs.prefetch_related(*prefetches)

        # Cache & ETag computation
        try:
            version = cache.get('analytics_cache_version', 1)
        except Exception:
            version = 1
        cache_key = f"skill_match_v{version}:{','.join(sorted(req_skills))}:{cache_scope}:{limit}:{week_monday.isoformat() if week_monday else 'none'}"

        ps_lm = PersonSkill.objects.aggregate(last_modified=Max('updated_at')).get('last_modified')
        st_lm = SkillTag.objects.aggregate(last_modified=Max('updated_at')).get('last_modified')
        lm_candidates = [ps_lm, st_lm]
        if week_monday is not None:
            asn_lm_qs = Assignment.objects.all()
            if vertical_param not in (None, ""):
                try:
                    asn_lm_qs = asn_lm_qs.filter(project__vertical_id=int(vertical_param))
                except Exception:
                    pass
            asn_lm = asn_lm_qs.aggregate(last_modified=Max('updated_at')).get('last_modified')
            lm_candidates.append(asn_lm)
        last_modified = max([dt for dt in lm_candidates if dt]) if any(lm_candidates) else None

        etag_content = f"{cache_key}-" + (last_modified.isoformat() if last_modified else 'none')
        etag = hashlib.sha256(etag_content.encode()).hexdigest()

        # Conditional headers
        if_none_match = request.META.get('HTTP_IF_NONE_MATCH')
        if if_none_match and if_none_match.strip('"') == etag:
            resp = HttpResponseNotModified()
            resp['ETag'] = f'"{etag}"'
            if last_modified:
                resp['Last-Modified'] = http_date(last_modified.timestamp())
            return resp
        if_modified_since = request.META.get('HTTP_IF_MODIFIED_SINCE')
        if last_modified and if_modified_since:
            try:
                from django.utils.http import parse_http_date
                if_modified_ts = parse_http_date(if_modified_since)
                if int(last_modified.timestamp()) <= if_modified_ts:
                    resp = HttpResponseNotModified()
                    resp['ETag'] = f'"{etag}"'
                    resp['Last-Modified'] = http_date(last_modified.timestamp())
                    return resp
            except Exception:  # nosec B110
                pass

        payload = None
        try:
            payload = cache.get(cache_key)
        except Exception:
            payload = None
        if payload is None:
            lock_key = f"lock:{cache_key}"
            got_lock = False
            try:
                got_lock = cache.add(lock_key, '1', timeout=10)
            except Exception:
                got_lock = True
            if not got_lock:
                t0 = time.time()
                while time.time() - t0 < 2.0:
                    try:
                        payload = cache.get(cache_key)
                        if payload is not None:
                            break
                    except Exception:  # nosec B110
                        pass
                    time.sleep(0.05)
            if payload is None:
                # Compute results
                results = []
                for p in people_qs:
                    # person skill names (lowercase)
                    skill_names = []
                    for ps in getattr(p, 'skills').all():
                        if ps.skill_tag and ps.skill_tag.name:
                            skill_names.append(ps.skill_tag.name.lower())

                    matched, missing = [], []
                    for rs in req_skills:
                        ok = any((rs in sn) or (sn in rs) for sn in skill_names)
                        (matched if ok else missing).append(rs)

                    base_score = (len(matched) / len(req_skills)) * 100.0 if req_skills else 0.0

                    # Availability blend (70/30)
                    if week_monday is not None:
                        cap = float(p.weekly_capacity or 0)
                        if cap > 0:
                            wk_key = week_monday.strftime('%Y-%m-%d')
                            allocated = 0.0
                            for a in getattr(p, 'assignments').all():
                                wh = a.weekly_hours or {}
                                val = 0.0
                                if wk_key in wh:
                                    try:
                                        val = float(wh[wk_key] or 0)
                                    except (TypeError, ValueError):
                                        val = 0.0
                                else:
                                    for off in range(-3, 4):
                                        d = week_monday + _td(days=off)
                                        k = d.strftime('%Y-%m-%d')
                                        if k in wh:
                                            try:
                                                val = float(wh[k] or 0)
                                            except (TypeError, ValueError):
                                                val = 0.0
                                            break
                                allocated += val
                            avail_pct = max(0.0, (cap - allocated) / cap * 100.0)
                            base_score = 0.7 * base_score + 0.3 * avail_pct

                    results.append({
                        'personId': p.id,
                        'name': p.name,
                        'score': round(base_score, 1),
                        'matchedSkills': matched,
                        'missingSkills': missing,
                        'departmentId': p.department_id,
                        'roleName': getattr(p.role, 'name', None) if getattr(p, 'role', None) else None,
                    })

                results.sort(key=lambda x: (-x['score'], x['name']))
                payload = results[:limit]
                try:
                    cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
                except Exception:  # nosec B110
                    pass
            try:
                cache.delete(lock_key)
            except Exception:  # nosec B110
                pass

        response = Response(payload)
        response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
        response['Cache-Control'] = 'private, max-age=30'
        return response

    @extend_schema(
        description="Start async skill match job and return task ID for polling.",
        parameters=[
            OpenApiParameter(name='skills', type=str, required=True, description='Comma-separated skill names'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
            OpenApiParameter(name='limit', type=int, required=False, description='Max results (1-200), default 50'),
            OpenApiParameter(name='week', type=str, required=False, description='YYYY-MM-DD (Monday) for availability-aware scoring'),
        ],
        responses=inline_serializer(name='SkillMatchAsyncResponse', fields={'jobId': serializers.CharField()})
    )
    @action(detail=False, methods=['get'], url_path='skill_match_async', throttle_classes=[SkillMatchThrottle])
    def skill_match_async(self, request):
        if bulk_skill_matching_async is None:
            return Response({'detail': 'Async jobs not available'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        raw_skills = (request.query_params.get('skills') or '').strip()
        if not raw_skills:
            return Response({'detail': 'skills is required (comma-separated)'}, status=status.HTTP_400_BAD_REQUEST)
        skills = [s.strip() for s in raw_skills.split(',') if s.strip()]
        filters = {}
        for key in ('department', 'include_children', 'limit', 'week', 'vertical'):
            val = request.query_params.get(key)
            if val not in (None, ""):
                filters[key] = val
        try:
            job = bulk_skill_matching_async.delay(skills, filters)
        except Exception as e:
            return Response({'detail': f'Failed to enqueue job: {e.__class__.__name__}'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({'jobId': job.id}, status=status.HTTP_202_ACCEPTED)
    
    @action(detail=False, methods=['post'])
    def import_excel(self, request):
        """Import people from Excel with progress tracking"""
        if 'file' not in request.FILES:
            return Response({
                'success': False,
                'error': 'No file provided'
            }, status=status.HTTP_400_BAD_REQUEST)

        excel_file = request.FILES['file']

        # Validate file type (extension + basic MIME check)
        filename = excel_file.name
        lower_name = filename.lower()
        # Explicitly reject macro-enabled formats first for a clear error message
        if lower_name.endswith(('.xlsm', '.xltm')):
            return Response({'success': False, 'error': 'Macro-enabled Excel formats are not allowed (.xlsm/.xltm)'}, status=status.HTTP_400_BAD_REQUEST)
        if not lower_name.endswith(('.xlsx', '.xls')):
            return Response({
                'success': False,
                'error': 'File must be Excel format (.xlsx or .xls)'
            }, status=status.HTTP_400_BAD_REQUEST)
        ctype = getattr(excel_file, 'content_type', '') or ''
        allowed_types = {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
            'application/vnd.ms-excel',  # .xls
        }
        # If a content type is provided and it is not an allowed Excel type, reject
        if ctype and ctype not in allowed_types:
            return Response({
                'success': False,
                'error': f'Unsupported content type: {ctype}'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Enforce size limits
        max_bytes = int(getattr(django_settings, 'PEOPLE_UPLOAD_MAX_BYTES', 10 * 1024 * 1024))
        fsize = getattr(excel_file, 'size', None)
        if isinstance(fsize, int) and fsize > max_bytes:
            return Response({
                'success': False,
                'error': 'File too large'
            }, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        
        # Get options
        update_existing = request.data.get('update_existing', 'true').lower() == 'true'
        dry_run = request.data.get('dry_run', 'false').lower() == 'true'
        use_streaming = request.data.get('use_streaming', 'false').lower() == 'true'

        # When async jobs are enabled, submit background task and return job id
        if django_settings.FEATURES.get('ASYNC_JOBS') and import_people_excel_task is not None:
            # Persist uploaded file to a private, non-web-served directory (under BACKUPS_DIR)
            safe_dir = os.path.join(getattr(django_settings, 'BACKUPS_DIR', '/backups'), 'incoming', 'people')
            try:
                os.makedirs(safe_dir, exist_ok=True)
            except Exception:  # nosec B110
                pass
            safe_name = f"{int(time.time())}_{os.path.basename(filename)}"
            safe_path = os.path.join(safe_dir, safe_name)
            try:
                written = 0
                with open(safe_path, 'wb') as out:
                    for chunk in excel_file.chunks():
                        out.write(chunk)
                        written += len(chunk)
                        if written > max_bytes:
                            raise ValueError('upload_exceeds_limit')
            except Exception as e:
                try:
                    if os.path.exists(safe_path):
                        os.remove(safe_path)
                except Exception:  # nosec B110
                    pass
                if str(e) == 'upload_exceeds_limit':
                    return Response({'success': False, 'error': 'File too large'}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
                return Response({'success': False, 'error': f'Failed to store upload: {e.__class__.__name__}'}, status=status.HTTP_400_BAD_REQUEST)

            # Enqueue background task with absolute path (worker supports absolute path)
            task = import_people_excel_task.delay(safe_path, update_existing=update_existing, dry_run=dry_run)
            job_id = task.id
            return Response({
                'jobId': job_id,
                'statusUrl': request.build_absolute_uri(f"/api/jobs/{job_id}/"),
            }, status=status.HTTP_202_ACCEPTED)

        # For large imports or if streaming requested, use streaming response
        if use_streaming:
            return self._stream_excel_import(excel_file, update_existing, dry_run)
        else:
            # Process synchronously for small files
            try:
                results = import_people_from_excel(
                    excel_file, 
                    update_existing=update_existing,
                    dry_run=dry_run
                )
                
                # Add progress indicator for UI
                results['progress'] = 100
                results['stage'] = 'complete'
                
                return Response(results, status=status.HTTP_200_OK)
                
            except Exception as e:
                return Response({
                    'success': False,
                    'error': f'Import failed: {str(e)}',
                    'progress': 0,
                    'stage': 'error'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _stream_excel_import(self, excel_file, update_existing, dry_run):
        """Stream Excel import with real-time progress updates"""
        def generate_import_with_progress():
            """Generator that yields progress updates and final results"""
            
            def progress_callback(progress_data):
                """Callback to yield progress updates"""
                # This will be called by the import function
                pass  # We'll handle progress in a different way
            
            try:
                # Simple approach: just process and return results
                # For real streaming, we'd need a more complex architecture
                results = import_people_from_excel(
                    excel_file,
                    update_existing=update_existing,
                    dry_run=dry_run
                )
                
                # Yield completion progress
                yield self._progress_chunk({
                    'stage': 'complete',
                    'message': f'Import completed: {results.get("success_count", 0)} successful, {results.get("error_count", 0)} errors',
                    'progress': 100,
                    'total': results.get("total_rows", 0)
                })
                
                # Yield final results
                yield json.dumps({
                    'type': 'final_results',
                    **results
                }) + '\n'
                
            except Exception as e:
                yield json.dumps({
                    'type': 'error',
                    'success': False,
                    'error': f'Import failed: {str(e)}',
                    'stage': 'error'
                }) + '\n'
        
        response = StreamingHttpResponse(
            generate_import_with_progress(),
            content_type='text/plain'
        )
        response['Cache-Control'] = 'no-cache'
        return response

    @extend_schema(
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
        ],
        responses=PersonCapacityHeatmapItemSerializer(many=True)
    )
    @action(detail=False, methods=['get'], throttle_classes=[HeatmapThrottle])
    def capacity_heatmap(self, request):
        """Return per-person week summaries for the next N weeks (default 12)."""
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12

        people = self.get_queryset()
        # Heatmap must exclude inactive people regardless of detail/list behavior
        people = people.filter(is_active=True)
        # Optional department filter with include_children
        department_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        vertical_param = request.query_params.get('vertical')
        cache_scope = 'all'
        if department_param not in (None, ""):
            try:
                dept_id = int(department_param)
                if include_children:
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
                    people = people.filter(department_id__in=list(ids))
                else:
                    people = people.filter(department_id=dept_id)
                cache_scope = f'dept_{dept_id}{"_children" if include_children else ""}'
            except (TypeError, ValueError):  # nosec B110
                # Ignore invalid department filter; return unfiltered list
                pass
        if vertical_param not in (None, ""):
            try:
                people = self._apply_vertical_filter(people, vertical_param)
                cache_scope = f"{cache_scope}_v{int(vertical_param)}"
            except Exception:  # nosec B110
                pass
        # Prefetch active assignments to avoid N+1 when computing utilization
        try:
            asn_qs = Assignment.objects.filter(is_active=True)
            if vertical_param not in (None, ""):
                try:
                    asn_qs = asn_qs.filter(project__vertical_id=int(vertical_param))
                except Exception:
                    pass
            asn_qs = asn_qs.only('weekly_hours', 'person_id')
            people = people.prefetch_related(Prefetch('assignments', queryset=asn_qs))
        except Exception:  # nosec B110
            pass
        # Build cache key and short-TTL caching (optional via feature flag)
        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = f"people:capacity_heatmap:{weeks}:{cache_scope}"

        # Compute conservative validators across People + Assignments
        ppl_aggr = people.aggregate(last_modified=Max('updated_at'), total=Max('id'))  # total not used, but keeps shape
        asn_aggr_qs = Assignment.objects.filter(person__in=people)
        if vertical_param not in (None, ""):
            try:
                asn_aggr_qs = asn_aggr_qs.filter(project__vertical_id=int(vertical_param))
            except Exception:
                pass
        asn_aggr = asn_aggr_qs.aggregate(last_modified=Max('updated_at'))

        lm_candidates = [ppl_aggr.get('last_modified'), asn_aggr.get('last_modified')]
        last_modified = max([dt for dt in lm_candidates if dt]) if any(lm_candidates) else None

        # Include active people count to invalidate ETag when active/inactive toggles occur
        try:
            active_count = people.count()
        except Exception:
            active_count = 0
        etag_content = f"{weeks}-{cache_scope}-{active_count}-" + (last_modified.isoformat() if last_modified else 'none')
        etag = hashlib.sha256(etag_content.encode()).hexdigest()

        # Handle conditional request
        if_none_match = request.META.get('HTTP_IF_NONE_MATCH')
        if if_none_match and if_none_match.strip('"') == etag:
            resp = HttpResponseNotModified()
            resp['ETag'] = f'"{etag}"'
            if last_modified:
                resp['Last-Modified'] = http_date(last_modified.timestamp())
            return resp

        if_modified_since = request.META.get('HTTP_IF_MODIFIED_SINCE')
        if last_modified and if_modified_since:
            try:
                from django.utils.http import parse_http_date
                if_modified_ts = parse_http_date(if_modified_since)
                if int(last_modified.timestamp()) <= if_modified_ts:
                    resp = HttpResponseNotModified()
                    resp['ETag'] = f'"{etag}"'
                    resp['Last-Modified'] = http_date(last_modified.timestamp())
                    return resp
            except Exception:  # nosec B110
                pass

        payload = None
        if use_cache:
            try:
                payload = cache.get(cache_key)
            except Exception:
                payload = None
        if payload is None:
            # Single-flight lock to prevent cache stampedes on heavy compute
            lock_key = f"lock:{cache_key}"
            got_lock = False
            if use_cache:
                try:
                    got_lock = cache.add(lock_key, '1', timeout=10)
                except Exception:
                    got_lock = True
            try:
                if not got_lock and use_cache:
                    # Briefly wait for another worker
                    t0 = time.time()
                    while time.time() - t0 < 2.0:
                        try:
                            payload = cache.get(cache_key)
                            if payload is not None:
                                break
                        except Exception:  # nosec B110
                            pass
                        time.sleep(0.05)
                if payload is None:
                    payload = CapacityAnalysisService.get_capacity_heatmap(people, weeks, cache_scope=cache_scope)
            finally:
                if use_cache:
                    try:
                        cache.delete(lock_key)
                    except Exception:  # nosec B110
                        pass
            if use_cache:
                try:
                    cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
                except Exception:  # nosec B110
                    pass

        # Add convenience maps: percentByWeek and availableByWeek (optional fields)
        try:
            enhanced = []
            for item in (payload or []):
                wk_cap = float(item.get('weeklyCapacity') or 0)
                week_totals = item.get('weekTotals') or {}
                percent_map = {}
                available_map = {}
                if isinstance(week_totals, dict) and wk_cap >= 0:
                    for wk, hours in week_totals.items():
                        h = 0.0
                        try:
                            h = float(hours or 0)
                        except Exception:
                            h = 0.0
                        pct = round((h / wk_cap * 100.0), 1) if wk_cap > 0 else 0.0
                        avail = round(max(0.0, wk_cap - h), 1)
                        percent_map[wk] = pct
                        available_map[wk] = avail
                new_item = dict(item)
                new_item['percentByWeek'] = percent_map
                new_item['availableByWeek'] = available_map
                enhanced.append(new_item)
            payload = enhanced
        except Exception:  # nosec B110
            # In worst case, return original payload
            pass

        response = Response(payload)
        response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
        response['Cache-Control'] = 'private, max-age=30'
        return response

    @extend_schema(
        parameters=[
            OpenApiParameter(name='weeks', type=int, required=False),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
            OpenApiParameter(name='vertical', type=int, required=False, description='Filter by vertical id'),
        ],
        responses=WorkloadForecastItemSerializer(many=True)
    )
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated, IsAdminUser])
    def workload_forecast(self, request):
        """Aggregate team capacity vs allocated for N weeks ahead (default 8).

        Response array items:
        { weekStart, totalCapacity, totalAllocated, teamUtilization, peopleOverallocated[] }
        """
        try:
            weeks = int(request.query_params.get('weeks', 8))
        except ValueError:
            weeks = 8

        people_qs = self.get_queryset()

        # Optional department filter
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        vertical_param = request.query_params.get('vertical')
        cache_scope = 'all'
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
                        for d in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                            if d not in ids:
                                stack.append(d)
                    people_qs = people_qs.filter(department_id__in=list(ids))
                else:
                    people_qs = people_qs.filter(department_id=dept_id)
                cache_scope = f'dept_{dept_id}{"_children" if include_children else ""}'
            except (TypeError, ValueError):  # nosec B110
                pass
        if vertical_param not in (None, ""):
            try:
                people_qs = self._apply_vertical_filter(people_qs, vertical_param)
                cache_scope = f"{cache_scope}_v{int(vertical_param)}"
            except Exception:  # nosec B110
                pass
        try:
            asn_qs = Assignment.objects.filter(is_active=True)
            if vertical_param not in (None, ""):
                try:
                    asn_qs = asn_qs.filter(project__vertical_id=int(vertical_param))
                except Exception:
                    pass
            asn_qs = asn_qs.only('weekly_hours', 'person_id')
            people_qs = people_qs.prefetch_related(Prefetch('assignments', queryset=asn_qs))
        except Exception:  # nosec B110
            pass

        result = CapacityAnalysisService.get_workload_forecast(people_qs, weeks, cache_scope=cache_scope)
        return Response(result)
