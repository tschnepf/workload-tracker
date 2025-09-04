from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Max, Count, Exists, OuterRef, Q
from django.http import HttpResponseNotModified, StreamingHttpResponse
from django.utils.http import http_date, parse_http_date
from django.utils import timezone
from .models import Project
from .serializers import ProjectSerializer
from .utils.excel_handler import export_projects_to_excel, import_projects_from_file
from deliverables.models import Deliverable
from assignments.models import Assignment
import hashlib
import json
import time

class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.filter(is_active=True)
    serializer_class = ProjectSerializer
    # Use global default permissions (IsAuthenticated)
    
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
            response['Cache-Control'] = 'private, max-age=30'  # 30 seconds cache for authenticated responses
        
        return response
    
    @action(detail=False, methods=['get'])
    def export_excel(self, request):
        """Export projects to Excel with streaming response for large datasets"""
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
                
                # Small delay to show progress
                time.sleep(0.1)
            
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

        response = Response({
            'projectFilters': {
                str(p['id']): {
                    'assignmentCount': p['assignment_count'],
                    'hasFutureDeliverables': p['has_future_deliverables'],
                    'status': p['status'],
                }
                for p in projects_data
            }
        })

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
