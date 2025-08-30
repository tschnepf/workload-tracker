"""
Deliverable views - STANDARDS COMPLIANT API endpoints
Follows R2-REBUILD-STANDARDS.md naming conventions
"""

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from collections import defaultdict
from .models import Deliverable
from .serializers import DeliverableSerializer


class DeliverableViewSet(viewsets.ModelViewSet):
    """
    CRUD operations for deliverables
    Supports filtering by project and manual reordering
    """
    serializer_class = DeliverableSerializer
    permission_classes = [permissions.AllowAny]  # Match existing project permissions
    
    def get_queryset(self):
        """Filter deliverables by project if specified"""
        queryset = Deliverable.objects.all().order_by('sort_order', 'percentage', 'date')
        
        # Filter by project if provided
        project_id = self.request.query_params.get('project', None)
        if project_id is not None:
            queryset = queryset.filter(project_id=project_id)
        
        return queryset
    
    def list(self, request, *args, **kwargs):
        """Get deliverables with bulk loading support (Phase 2 optimization)"""
        queryset = self.get_queryset()
        
        # Check if bulk loading is requested
        if request.query_params.get('all') == 'true':
            # Return all deliverables without pagination
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        
        # Use default pagination
        return super().list(request, *args, **kwargs)
    
    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """
        Manually reorder deliverables for a project
        Expected payload: {
            "project": project_id,
            "deliverable_ids": [id1, id2, id3, ...]
        }
        """
        project_id = request.data.get('project')
        deliverable_ids = request.data.get('deliverable_ids', [])
        
        if not project_id or not deliverable_ids:
            return Response(
                {"error": "Both 'project' and 'deliverable_ids' are required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                # Update sort_order for each deliverable
                for index, deliverable_id in enumerate(deliverable_ids):
                    Deliverable.objects.filter(
                        id=deliverable_id, 
                        project_id=project_id
                    ).update(sort_order=(index + 1) * 10)
                
                return Response({"success": True}, status=status.HTTP_200_OK)
                
        except Exception as e:
            return Response(
                {"error": f"Failed to reorder deliverables: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def bulk(self, request):
        """
        Bulk fetch deliverables for multiple projects
        GET /api/deliverables/bulk/?project_ids=1,2,3,4
        
        Returns: { "1": [...], "2": [...], "3": [...], "4": [...] }
        """
        project_ids_param = request.query_params.get('project_ids', '')
        
        if not project_ids_param:
            return Response(
                {"error": "project_ids parameter is required"}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Parse and validate project IDs
            project_ids = [int(pid.strip()) for pid in project_ids_param.split(',') if pid.strip()]
            
            if not project_ids:
                return Response(
                    {"error": "At least one valid project ID is required"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Limit to reasonable number of projects to prevent abuse
            if len(project_ids) > 200:
                return Response(
                    {"error": "Maximum 200 project IDs allowed"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Single efficient query to get all deliverables
            deliverables = Deliverable.objects.filter(
                project_id__in=project_ids
            ).order_by('sort_order', 'percentage', 'date').select_related('project')
            
            # Group deliverables by project_id
            grouped_deliverables = defaultdict(list)
            for deliverable in deliverables:
                serialized_data = DeliverableSerializer(deliverable).data
                grouped_deliverables[str(deliverable.project_id)].append(serialized_data)
            
            # Ensure all requested projects are represented in response
            result = {}
            for project_id in project_ids:
                result[str(project_id)] = grouped_deliverables.get(str(project_id), [])
            
            return Response(result, status=status.HTTP_200_OK)
            
        except ValueError:
            return Response(
                {"error": "Invalid project ID format. Use comma-separated integers."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"error": f"Failed to fetch bulk deliverables: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
