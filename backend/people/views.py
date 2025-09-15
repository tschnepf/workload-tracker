﻿"""
People API Views - Using AutoMapped serializers for naming prevention
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import UserRateThrottle, ScopedRateThrottle
from django.db.models import Sum, Max, Prefetch
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
    from .tasks import export_people_excel_task, import_people_excel_task
except Exception:
    export_people_excel_task = None  # type: ignore
    import_people_excel_task = None  # type: ignore

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
        """Filter active people by default"""
        # Phase 3: tighten fields to reduce payload and queries
        return (
            Person.objects
            .filter(is_active=True)
            .select_related('department', 'role')
            .only(
                'id', 'name', 'weekly_capacity', 'role', 'department', 'location', 'notes', 'created_at', 'updated_at',
                'department__name', 'role__name'
            )
            .order_by('name')
        )
    
    @extend_schema(
        parameters=[
            OpenApiParameter(name='page', type=int, required=False, description='Page number'),
            OpenApiParameter(name='page_size', type=int, required=False, description='Page size'),
            OpenApiParameter(name='department', type=int, required=False, description='Filter by department id'),
            OpenApiParameter(name='include_children', type=int, required=False, description='Include child departments (0|1)'),
            OpenApiParameter(name='all', type=str, required=False, description='Return all items without pagination when true'),
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
                        except Exception:
                            pass
                    queryset = queryset.filter(department_id__in=ids)
                else:
                    queryset = queryset.filter(department_id=dept_id)
            except (TypeError, ValueError):
                # Ignore invalid department filter; return unfiltered list
                pass
        
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
            etag = hashlib.md5(etag_content.encode()).hexdigest()
            
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
            queryset = queryset.filter(role__icontains=role)
            
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
        ],
        responses=inline_serializer(name='PeopleSearchItem', fields={
            'id': serializers.IntegerField(),
            'name': serializers.CharField(),
            'department': serializers.IntegerField(allow_null=True, required=False),
        })
    )
    @action(detail=False, methods=['get'], url_path='search', throttle_classes=[HotEndpointThrottle])
    def search(self, request):
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

        # Use a fresh base queryset without select_related to avoid
        # deferred-field conflicts with only().
        qs = (
            Person.objects.filter(is_active=True)
            .only('id', 'name', 'department')
            .filter(Q(name__icontains=q) | Q(email__icontains=q))
            .order_by('name')[:limit]
        )
        results = [
            {
                'id': p.id,
                'name': p.name,
                'department': p.department_id,
            }
            for p in qs
        ]
        return Response(results)

    @extend_schema(
        parameters=[
            OpenApiParameter(name='week', type=str, required=False, description='YYYY-MM-DD (Monday) week key'),
            OpenApiParameter(name='skills', type=str, required=False, description='Comma-separated skill names'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
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
                        except Exception:
                            pass
                    people_qs = people_qs.filter(department_id__in=ids)
                    cache_scope = f'dept_{dept_id}_children'
                else:
                    people_qs = people_qs.filter(department_id=dept_id)
                    cache_scope = f'dept_{dept_id}'
            except (TypeError, ValueError):
                pass

        skill_qs = PersonSkill.objects.select_related('skill_tag')
        asn_qs = Assignment.objects.filter(is_active=True).only('weekly_hours', 'person_id')
        people_qs = people_qs.prefetch_related(Prefetch('skills', queryset=skill_qs), Prefetch('assignments', queryset=asn_qs))

        try:
            version = cache.get('analytics_cache_version', 1)
        except Exception:
            version = 1
        skills_key = ','.join(sorted(req_skills)) if req_skills else 'none'
        cache_key = f"find_available_v{version}:{week_monday.isoformat()}:{skills_key}:{cache_scope}:{limit}:{int(min_available)}"

        ps_lm = PersonSkill.objects.aggregate(last_modified=Max('updated_at')).get('last_modified')
        st_lm = SkillTag.objects.aggregate(last_modified=Max('updated_at')).get('last_modified')
        asn_lm = Assignment.objects.aggregate(last_modified=Max('updated_at')).get('last_modified')
        lm_candidates = [ps_lm, st_lm, asn_lm]
        last_modified = max([dt for dt in lm_candidates if dt]) if any(lm_candidates) else None

        etag = hashlib.md5(f"{cache_key}-".encode() + (last_modified.isoformat().encode() if last_modified else b'none')).hexdigest()

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
                    except Exception:
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
            except Exception:
                pass
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
        parameters=[
            OpenApiParameter(name='skills', type=str, required=True, description='Comma-separated skill names'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
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
                        except Exception:
                            pass
                    people_qs = people_qs.filter(department_id__in=ids)
                    cache_scope = f'dept_{dept_id}_children'
                else:
                    people_qs = people_qs.filter(department_id=dept_id)
                    cache_scope = f'dept_{dept_id}'
            except (TypeError, ValueError):
                pass

        # Prefetch skills and assignments (if week provided)
        skill_qs = PersonSkill.objects.select_related('skill_tag')
        prefetches = [Prefetch('skills', queryset=skill_qs)]
        if week_monday is not None:
            asn_qs = Assignment.objects.filter(is_active=True).only('weekly_hours', 'person_id')
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
            asn_lm = Assignment.objects.aggregate(last_modified=Max('updated_at')).get('last_modified')
            lm_candidates.append(asn_lm)
        last_modified = max([dt for dt in lm_candidates if dt]) if any(lm_candidates) else None

        etag_content = f"{cache_key}-" + (last_modified.isoformat() if last_modified else 'none')
        etag = hashlib.md5(etag_content.encode()).hexdigest()

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
            except Exception:
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
                    except Exception:
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
                except Exception:
                    pass
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
        description="Start async skill match job and return task ID for polling.",
        parameters=[
            OpenApiParameter(name='skills', type=str, required=True, description='Comma-separated skill names'),
            OpenApiParameter(name='department', type=int, required=False),
            OpenApiParameter(name='include_children', type=int, required=False, description='0|1'),
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
        for key in ('department', 'include_children', 'limit', 'week'):
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
        
        # Validate file type
        if not excel_file.name.endswith(('.xlsx', '.xls')):
            return Response({
                'success': False,
                'error': 'File must be Excel format (.xlsx or .xls)'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get options
        update_existing = request.data.get('update_existing', 'true').lower() == 'true'
        dry_run = request.data.get('dry_run', 'false').lower() == 'true'
        use_streaming = request.data.get('use_streaming', 'false').lower() == 'true'

        # When async jobs are enabled, submit background task and return job id
        if django_settings.FEATURES.get('ASYNC_JOBS') and import_people_excel_task is not None:
            # Persist uploaded file to storage for worker to access
            # Use a safe path under media storage
            filename = excel_file.name
            storage_key = f"imports/people/{int(time.time())}_{os.path.basename(filename)}"
            default_storage.save(storage_key, excel_file)
            task = import_people_excel_task.delay(storage_key, update_existing=update_existing, dry_run=dry_run)
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
        # Optional department filter with include_children
        department_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
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
            except (TypeError, ValueError):
                # Ignore invalid department filter; return unfiltered list
                pass
        # Build cache key and short-TTL caching (optional via feature flag)
        use_cache = bool(settings.FEATURES.get('SHORT_TTL_AGGREGATES'))
        cache_key = f"people:capacity_heatmap:{weeks}:{cache_scope}"

        # Compute conservative validators across People + Assignments
        ppl_aggr = people.aggregate(last_modified=Max('updated_at'), total=Max('id'))  # total not used, but keeps shape
        asn_aggr = Assignment.objects.filter(person__in=people).aggregate(last_modified=Max('updated_at'))

        lm_candidates = [ppl_aggr.get('last_modified'), asn_aggr.get('last_modified')]
        last_modified = max([dt for dt in lm_candidates if dt]) if any(lm_candidates) else None

        etag_content = f"{weeks}-{cache_scope}-" + (last_modified.isoformat() if last_modified else 'none')
        etag = hashlib.md5(etag_content.encode()).hexdigest()

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
            except Exception:
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
                        except Exception:
                            pass
                        time.sleep(0.05)
                if payload is None:
                    payload = CapacityAnalysisService.get_capacity_heatmap(people, weeks, cache_scope=cache_scope)
            finally:
                if use_cache:
                    try:
                        cache.delete(lock_key)
                    except Exception:
                        pass
            if use_cache:
                try:
                    cache.set(cache_key, payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '30')))
                except Exception:
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
        except Exception:
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
        ],
        responses=WorkloadForecastItemSerializer(many=True)
    )
    @action(detail=False, methods=['get'])
    def workload_forecast(self, request):
        """Aggregate team capacity vs allocated for N weeks ahead (default 8).

        Response array items:
        { weekStart, totalCapacity, totalAllocated, teamUtilization, peopleOverallocated[] }
        """
        try:
            weeks = int(request.query_params.get('weeks', 8))
        except ValueError:
            weeks = 8

        people_qs = (
            self.get_queryset()
            .prefetch_related(
                Prefetch('assignments', queryset=Assignment.objects.filter(is_active=True).only('weekly_hours', 'person_id'))
            )
        )

        # Optional department filter
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
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
            except (TypeError, ValueError):
                pass

        result = CapacityAnalysisService.get_workload_forecast(people_qs, weeks, cache_scope=cache_scope)
        return Response(result)
