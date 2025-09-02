"""
People API Views - Using AutoMapped serializers for naming prevention
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import UserRateThrottle
from django.db.models import Sum, Max, Prefetch
from django.http import HttpResponseNotModified, StreamingHttpResponse
from django.utils.http import http_date
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from .models import Person
from .serializers import PersonSerializer
from .utils.excel_handler import export_people_to_excel, import_people_from_excel
from .services import CapacityAnalysisService
import hashlib
import json
import io
import time
from datetime import datetime, timedelta, date
from assignments.models import Assignment

class HotEndpointThrottle(UserRateThrottle):
    """Special throttle for hot endpoints like utilization checking"""
    scope = 'hot_endpoint'

class PersonViewSet(viewsets.ModelViewSet):
    """
    Person CRUD API with utilization calculations
    Uses AutoMapped serializer for automatic snake_case â†” camelCase conversion
    """
    queryset = Person.objects.all().order_by('-created_at')
    serializer_class = PersonSerializer
    permission_classes = []  # Remove auth requirement for Chunk 2 testing
    
    def get_queryset(self):
        """Filter active people by default"""
        return Person.objects.filter(is_active=True).order_by('name')
    
    def list(self, request, *args, **kwargs):
        """Get all people with conditional request support (ETag/Last-Modified) and bulk loading"""
        queryset = self.get_queryset()
        
        # Check if bulk loading is requested
        if request.query_params.get('all') == 'true':
            # Return all people without pagination (Phase 2 optimization)
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        
        # Get the latest update timestamp
        last_modified = queryset.aggregate(Max('updated_at'))['updated_at__max']
        
        if last_modified:
            # Generate ETag from count and last modified timestamp
            count = queryset.count()
            etag_content = f"{count}-{last_modified.isoformat()}"
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
            response['Cache-Control'] = 'public, max-age=30'  # 30 seconds cache
        
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
        # Get filtered queryset
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
                
                # Small delay to show progress (remove in production)
                time.sleep(0.1)
            
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

    @action(detail=False, methods=['get'])
    def capacity_heatmap(self, request):
        """Return per-person week summaries for the next N weeks (default 12)."""
        try:
            weeks = int(request.query_params.get('weeks', 12))
        except ValueError:
            weeks = 12

        people = self.get_queryset().select_related('department')
        # Optional department filter to align with dashboard filtering
        department_param = request.query_params.get('department')
        cache_scope = 'all'
        if department_param not in (None, ""):
            try:
                dept_id = int(department_param)
                people = people.filter(department_id=dept_id)
                cache_scope = f'dept_{dept_id}'
            except (TypeError, ValueError):
                # Ignore invalid department filter; return unfiltered list
                pass
        result = CapacityAnalysisService.get_capacity_heatmap(people, weeks, cache_scope=cache_scope)
        return Response(result)

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
        cache_scope = 'all'
        if dept_param not in (None, ""): 
            try:
                dept_id = int(dept_param)
                people_qs = people_qs.filter(department_id=dept_id)
                cache_scope = f'dept_{dept_id}'
            except (TypeError, ValueError):
                pass

        result = CapacityAnalysisService.get_workload_forecast(people_qs, weeks, cache_scope=cache_scope)
        return Response(result)
