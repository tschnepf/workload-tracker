from rest_framework import viewsets, permissions, status
import os
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import ScopedRateThrottle
from django.db.models import Max, Count, Exists, OuterRef, Q, Prefetch
from django.http import HttpResponseNotModified, StreamingHttpResponse
from django.utils.http import http_date, parse_http_date
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from .models import Project
from core.etag import ETagConditionalMixin
from .serializers import ProjectSerializer, ProjectFilterMetadataSerializer, ProjectAvailabilityItemSerializer
from drf_spectacular.utils import extend_schema, inline_serializer, OpenApiParameter
from rest_framework import serializers
from .utils.excel_handler import export_projects_to_excel, import_projects_from_file
from deliverables.models import Deliverable
from assignments.models import Assignment
from people.models import Person
from departments.models import Department
import hashlib
import json
import time
from django.conf import settings as django_settings
try:
    from .tasks import export_projects_excel_task
except Exception:
    export_projects_excel_task = None  # type: ignore

class ProjectAvailabilityThrottle(ScopedRateThrottle):
    scope = 'project_availability'


class ProjectViewSet(ETagConditionalMixin, viewsets.ModelViewSet):
    queryset = Project.objects.filter(is_active=True)
    serializer_class = ProjectSerializer
    # Use global default permissions (IsAuthenticated)
    
    def get_queryset(self):
        # Phase 3: tighten fields to reduce payload
        return (
            Project.objects
            .filter(is_active=True)
            .only(
                'id', 'name', 'status', 'client', 'description', 'project_number',
                'start_date', 'end_date', 'estimated_hours', 'is_active', 'created_at', 'updated_at'
            )
        )
    
    def list(self, request, *args, **kwargs):
        """Get all projects with conditional request support (ETag/Last-Modified) and bulk loading"""
        queryset = self.get_queryset()
        
        # Check if bulk loading is requested
        if request.query_params.get('all') == 'true':
            # Return all projects without pagination (Phase 2 optimization)
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

    @extend_schema(
        responses=inline_serializer(name='ProjectPreDeliverableSettingsResponse', fields={
            'projectId': serializers.IntegerField(),
            'settings': serializers.ListSerializer(child=inline_serializer(name='ProjectTypeSetting', fields={
                'typeId': serializers.IntegerField(),
                'typeName': serializers.CharField(),
                'isEnabled': serializers.BooleanField(),
                'daysBefore': serializers.IntegerField(allow_null=True),
                'source': serializers.ChoiceField(choices=['project','global','default'])
            }))
        })
    )
    @action(detail=True, methods=['get', 'put'], url_path='pre-deliverable-settings')
    def pre_deliverable_settings(self, request, pk=None):
        from deliverables.models import PreDeliverableType
        from core.models import PreDeliverableGlobalSettings
        from .models import ProjectPreDeliverableSettings

        try:
            project = Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)

        if request.method.lower() == 'get':
            types = PreDeliverableType.objects.all().order_by('sort_order', 'name')
            proj_map = {s.pre_deliverable_type_id: s for s in ProjectPreDeliverableSettings.objects.filter(project=project)}
            glob_map = {g.pre_deliverable_type_id: g for g in PreDeliverableGlobalSettings.objects.select_related('pre_deliverable_type')}
            items = []
            for t in types:
                if t.id in proj_map:
                    s = proj_map[t.id]
                    items.append({'typeId': t.id, 'typeName': t.name, 'isEnabled': s.is_enabled, 'daysBefore': s.days_before, 'source': 'project'})
                elif t.id in glob_map:
                    g = glob_map[t.id]
                    items.append({'typeId': t.id, 'typeName': t.name, 'isEnabled': g.is_enabled_by_default, 'daysBefore': g.default_days_before, 'source': 'global'})
                else:
                    items.append({'typeId': t.id, 'typeName': t.name, 'isEnabled': t.is_active, 'daysBefore': t.default_days_before, 'source': 'default'})
            return Response({'projectId': project.id, 'settings': items})

        # PUT
        if not request.user.is_staff:
            return Response({'detail': 'Only admins may update project pre-deliverable settings'}, status=status.HTTP_403_FORBIDDEN)
        payload = request.data or {}
        settings_list = payload.get('settings') or []
        if not isinstance(settings_list, list):
            return Response({'error': 'settings must be a list'}, status=status.HTTP_400_BAD_REQUEST)
        for entry in settings_list:
            try:
                type_id = int(entry.get('typeId'))
            except Exception:
                return Response({'error': 'typeId required'}, status=status.HTTP_400_BAD_REQUEST)
            is_enabled = bool(entry.get('isEnabled'))
            days_before = entry.get('daysBefore')
            if days_before is None:
                # Remove override to fall back to global/default
                ProjectPreDeliverableSettings.objects.filter(project=project, pre_deliverable_type_id=type_id).delete()
                continue
            try:
                days_before = int(days_before)
            except Exception:
                return Response({'error': 'daysBefore must be an integer or null'}, status=status.HTTP_400_BAD_REQUEST)
            if days_before < 0:
                return Response({'error': 'daysBefore must be >= 0'}, status=status.HTTP_400_BAD_REQUEST)
            ProjectPreDeliverableSettings.objects.update_or_create(
                project=project, pre_deliverable_type_id=type_id,
                defaults={'days_before': days_before, 'is_enabled': is_enabled}
            )
        # Return updated view
        return self.pre_deliverable_settings(request._request, pk=pk)  # type: ignore

    @extend_schema(
        parameters=[
            OpenApiParameter(name='week', type=str, required=False, description='YYYY-MM-DD (Sunday key)'),
            OpenApiParameter(name='department', type=int, required=False, description='Filter people by department id'),
            OpenApiParameter(name='include_children', type=int, required=False, description='Include child departments (0|1)'),
            OpenApiParameter(name='candidates_only', type=int, required=False, description='Limit to departments already staffing this project (0|1)')
        ],
        responses=ProjectAvailabilityItemSerializer(many=True)
    )
    @action(detail=True, methods=['get'], url_path='availability', throttle_classes=[ProjectAvailabilityThrottle])
    def availability(self, request, pk=None):
        """Return availability snapshot for people relevant to the project context.

        Response items: { personId, personName, totalHours, capacity, availableHours, utilizationPercent }
        Uses Sunday as canonical week key; exact JSON key lookup (no tolerance).
        """
        from datetime import date as _date, timedelta as _td, datetime as _dt
        try:
            # Normalize week to Sunday
            week_str = request.query_params.get('week')
            if week_str:
                d = _dt.strptime(week_str, '%Y-%m-%d').date()
            else:
                today = _date.today()
                d = today
            from core.week_utils import sunday_of_week
            week_monday = sunday_of_week(d)
        except Exception:
            return Response({'detail': 'Invalid week format, expected YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        # Department scoping
        dept_param = request.query_params.get('department')
        include_children = request.query_params.get('include_children') == '1'
        candidates_only = request.query_params.get('candidates_only') == '1'

        # Build people queryset
        people_qs = (
            ProjectViewSet._people_base_queryset()
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

        # Candidate department ids for this project
        cand_dept_ids = list(
            Assignment.objects.filter(project_id=pk, is_active=True)
            .values_list('person__department_id', flat=True)
            .exclude(person__department_id__isnull=True)
            .distinct()
        )
        if candidates_only:
            if cand_dept_ids:
                people_qs = people_qs.filter(department_id__in=cand_dept_ids)
        else:
            # If no explicit department scope provided, narrow by default to candidate departments to keep payload small
            if not dept_param and cand_dept_ids:
                people_qs = people_qs.filter(department_id__in=cand_dept_ids)

        # Prefetch active assignments for availability computation
        asn_qs = Assignment.objects.filter(is_active=True).only('weekly_hours', 'person_id')
        people_qs = people_qs.prefetch_related(Prefetch('assignments', queryset=asn_qs))

        # Short TTL caching + ETag/Last-Modified
        try:
            version = cache.get('analytics_cache_version', 1)
        except Exception:
            version = 1
        cache_key = f"project_availability_v{version}:{pk}:{week_monday.isoformat()}:{cache_scope}:{'cand' if candidates_only else 'all'}"

        agg = people_qs.aggregate(
            ppl_lm=Max('updated_at')
        )
        asn_lm = Assignment.objects.filter(person__in=people_qs).aggregate(last_modified=Max('updated_at')).get('last_modified')
        lm_candidates = [agg.get('ppl_lm'), asn_lm]
        last_modified = max([dt for dt in lm_candidates if dt]) if any(lm_candidates) else None

        import hashlib
        etag_content = f"{cache_key}-" + (last_modified.isoformat() if last_modified else 'none')
        etag = hashlib.md5(etag_content.encode()).hexdigest()

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
                if_modified_timestamp = parse_http_date(if_modified_since)
                last_modified_timestamp = last_modified.timestamp()
                if last_modified_timestamp <= if_modified_timestamp:
                    resp = HttpResponseNotModified()
                    resp['ETag'] = f'"{etag}"'
                    resp['Last-Modified'] = http_date(last_modified_timestamp)
                    return resp
            except ValueError:
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
                wk_key = week_monday.strftime('%Y-%m-%d')
                result = []
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
                        allocated += val
                    available = max(0.0, cap - allocated)
                    util = round((allocated / cap * 100.0), 1) if cap > 0 else 0.0
                    result.append({
                        'personId': p.id,
                        'personName': p.name,
                        'totalHours': round(allocated, 1),
                        'capacity': cap,
                        'availableHours': round(available, 1),
                        'utilizationPercent': util,
                    })
                # Optional: sort by availability desc then name
                result.sort(key=lambda x: (-x['availableHours'], x['personName'].lower()))
                payload = result
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

    @staticmethod
    def _people_base_queryset():
        # Mirror people list base fields to keep payload lean when selecting
        return (
            Person.objects
            .filter(is_active=True)
            .only('id', 'name', 'weekly_capacity', 'department', 'updated_at', 'created_at')
            .order_by('name')
        )
    
    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        """Export projects to Excel with streaming response for large datasets"""
        # Async path: submit job and return id when feature is enabled
        if django_settings.FEATURES.get('ASYNC_JOBS') and export_projects_excel_task is not None:
            filters = {}
            status_filter = request.query_params.get('status')
            if status_filter:
                filters['status'] = status_filter
            client = request.query_params.get('client')
            if client:
                filters['client'] = client
            task = export_projects_excel_task.delay(filters)
            job_id = task.id
            return Response({
                'jobId': job_id,
                'statusUrl': request.build_absolute_uri(f"/api/jobs/{job_id}/"),
                'downloadUrl': request.build_absolute_uri(f"/api/jobs/{job_id}/download/")
            }, status=status.HTTP_202_ACCEPTED)

        # Get filtered queryset
        queryset = self.get_queryset()
        
        # Apply any filters from query params
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status__iexact=status_filter)
            
        client = request.query_params.get('client')
        if client:
            queryset = queryset.filter(client__icontains=client)
        
        count = queryset.count()
        
        # For large datasets, use streaming response with progress
        if count > 50:  # Lower threshold for projects since they have related data
            return self._stream_excel_export(queryset, count)
        else:
            # Direct response for small datasets
            response = export_projects_to_excel(queryset)
            return response
    
    def _stream_excel_export(self, queryset, total_count):
        """Stream Excel export with progress updates for large datasets"""
        def generate_excel_with_progress():
            """Generator that yields progress updates and final Excel data"""
            
            # Yield initial progress
            yield self._progress_chunk({
                'stage': 'preparing',
                'message': f'Preparing to export {total_count} projects with assignments and deliverables...',
                'progress': 0,
                'total': total_count
            })
            
            # Process in chunks of 25 (smaller for projects due to related data)
            chunk_size = 25
            processed = 0
            
            # Get data in chunks with progress updates
            for chunk_start in range(0, total_count, chunk_size):
                chunk_queryset = queryset[chunk_start:chunk_start + chunk_size]
                
                processed += chunk_queryset.count()
                progress_percent = int((processed / total_count) * 80)  # Reserve 20% for Excel generation
                
                yield self._progress_chunk({
                    'stage': 'processing',
                    'message': f'Processed {processed}/{total_count} projects...',
                    'progress': progress_percent,
                    'total': total_count
                })
                
                # Small delay to show progress (dev only)
                if settings.DEBUG:
                    time.sleep(0.05)
            
            # Generate Excel file
            yield self._progress_chunk({
                'stage': 'generating',
                'message': 'Generating Excel file with multiple sheets...',
                'progress': 95,
                'total': total_count
            })
            
            # Create Excel response (this processes all assignments and deliverables)
            response = export_projects_to_excel(queryset)
            
            # Yield completion with file data
            yield self._progress_chunk({
                'stage': 'complete',
                'message': f'Export completed: {total_count} projects with all related data',
                'progress': 100,
                'total': total_count,
                'download_ready': True
            })
            
            # Yield the actual file data as base64
            excel_content = response.content
            import base64
            yield json.dumps({
                'type': 'file_data',
                'filename': f'projects_export_{total_count}_records.xlsx',
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
        responses=inline_serializer(name='ProjectFilterMetadataResponse', fields={
            'projectFilters': serializers.DictField(child=inline_serializer(name='ProjectFilterItem', fields={
                'assignmentCount': serializers.IntegerField(),
                'hasFutureDeliverables': serializers.BooleanField(),
                'status': serializers.CharField(),
            }))
        })
    )
    @action(detail=False, methods=['get'], url_path='filter-metadata')
    def filter_metadata(self, request):
        """Get optimized filter metadata for all projects.

        Returns camelCase keys for direct frontend consumption:
        {
          "projectFilters": {
            "<projectId>": {
              "assignmentCount": number,
              "hasFutureDeliverables": boolean,
              "status": string
            }, ...
          }
        }
        """
        today = timezone.now().date()

        queryset = self.get_queryset()

        # Compute conservative cache validators (counts + last modified across related models)
        proj_aggr = queryset.aggregate(
            last_modified=Max('updated_at'),
            total=Count('id')
        )
        asn_aggr = Assignment.objects.filter(
            project__is_active=True
        ).aggregate(
            last_modified=Max('updated_at'),
            total=Count('id')
        )
        del_aggr = Deliverable.objects.filter(
            project__is_active=True
        ).aggregate(
            last_modified=Max('updated_at'),
            total=Count('id')
        )

        # Determine overall last_modified across models
        lm_candidates = [
            proj_aggr.get('last_modified'),
            asn_aggr.get('last_modified'),
            del_aggr.get('last_modified'),
        ]
        last_modified = max([dt for dt in lm_candidates if dt]) if any(lm_candidates) else None

        # Build a stable ETag based on totals and last_modified
        etag_content = f"{proj_aggr.get('total', 0)}-{asn_aggr.get('total', 0)}-{del_aggr.get('total', 0)}-"
        etag_content += last_modified.isoformat() if last_modified else 'none'
        etag = hashlib.md5(etag_content.encode()).hexdigest()

        # Conditional request handling
        if_none_match = request.META.get('HTTP_IF_NONE_MATCH')
        if if_none_match and if_none_match.strip('"') == etag:
            response = HttpResponseNotModified()
            response['ETag'] = f'"{etag}"'
            if last_modified:
                response['Last-Modified'] = http_date(last_modified.timestamp())
            return response

        if_modified_since = request.META.get('HTTP_IF_MODIFIED_SINCE')
        if last_modified and if_modified_since:
            try:
                if_modified_timestamp = parse_http_date(if_modified_since)
                last_modified_timestamp = last_modified.timestamp()
                if last_modified_timestamp <= if_modified_timestamp:
                    response = HttpResponseNotModified()
                    response['ETag'] = f'"{etag}"'
                    response['Last-Modified'] = http_date(last_modified_timestamp)
                    return response
            except ValueError:
                # Ignore malformed header
                pass
        payload = None
        if settings.FEATURES.get('SHORT_TTL_AGGREGATES'):
            payload = cache.get('projects:filter_metadata')
        if payload is None:
            projects_data = (
                queryset
                .annotate(
                    assignment_count=Count(
                        'assignment',
                        filter=Q(assignment__is_active=True),
                    ),
                    has_future_deliverables=Exists(
                        Deliverable.objects.filter(
                            project=OuterRef('pk'),
                            date__gt=today,
                            date__isnull=False,
                            is_completed=False,
                        )
                    ),
                )
                .values('id', 'assignment_count', 'has_future_deliverables', 'status')
            )
            # Build mapping and validate via serializer to enforce naming discipline
            mapping = {
                str(p['id']): {
                    'assignmentCount': p['assignment_count'],
                    'hasFutureDeliverables': p['has_future_deliverables'],
                    'status': p['status'],
                }
                for p in projects_data
            }
            ser = ProjectFilterMetadataSerializer(data={'projectFilters': mapping})
            ser.is_valid(raise_exception=True)
            payload = ser.validated_data
            if settings.FEATURES.get('SHORT_TTL_AGGREGATES'):
                cache.set('projects:filter_metadata', payload, timeout=int(os.getenv('AGGREGATE_CACHE_TTL', '15')))

        response = Response(payload)

        # Add cache headers
        response['ETag'] = f'"{etag}"'
        if last_modified:
            response['Last-Modified'] = http_date(last_modified.timestamp())
        response['Cache-Control'] = 'private, max-age=30'
        return response
    
    @action(detail=False, methods=['post'])
    def import_excel(self, request):
        """Import projects from Excel with progress tracking"""
        if 'file' not in request.FILES:
            return Response({
                'success': False,
                'error': 'No file provided'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        excel_file = request.FILES['file']
        
        # Validate file type
        if not excel_file.name.endswith(('.xlsx', '.xls', '.csv')):
            return Response({
                'success': False,
                'error': 'File must be Excel (.xlsx/.xls) or CSV format'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get options
        update_existing = request.data.get('update_existing', 'true').lower() == 'true'
        include_assignments = request.data.get('include_assignments', 'true').lower() == 'true'
        include_deliverables = request.data.get('include_deliverables', 'true').lower() == 'true'
        dry_run = request.data.get('dry_run', 'false').lower() == 'true'
        
        # For large files, this could be enhanced with background processing
        # For now, process synchronously with result
        try:
            results = import_projects_from_file(
                excel_file,
                update_existing=update_existing,
                include_assignments=include_assignments,
                include_deliverables=include_deliverables,
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
    
    @action(detail=False, methods=['get'])
    def export_template(self, request):
        """Export Excel import template with examples"""
        # Create template with empty queryset to get template format
        empty_queryset = self.queryset.none()
        response = export_projects_to_excel(empty_queryset, is_template=True)
        return response
