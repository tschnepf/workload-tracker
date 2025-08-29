"""
Deliverable views - STANDARDS COMPLIANT API endpoints
Follows R2-REBUILD-STANDARDS.md naming conventions
"""

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
import logging
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
            logging.exception("Failed to reorder deliverables")
            return Response(
                {"error": "Failed to reorder deliverables."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
