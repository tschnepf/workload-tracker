"""
Role API views with CRUD operations.
"""

from django.db import models
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Role
from .serializers import RoleSerializer
from drf_spectacular.utils import extend_schema, OpenApiParameter


class RoleViewSet(viewsets.ModelViewSet):
    """
    Role ViewSet providing CRUD operations
    - List all roles (paginated)
    - Create new role
    - Retrieve specific role
    - Update role
    - Delete role
    - Bulk list (for autocomplete)
    """
    
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    # Use global default permissions (IsAuthenticated)
    
    def get_queryset(self):
        """Filter queryset based on query parameters"""
        queryset = Role.objects.all()
        
        # Filter by active status if requested
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset.order_by('name')
    
    @extend_schema(
        parameters=[
            OpenApiParameter(name='include_inactive', type=bool, required=False, description='Include inactive roles when present'),
        ],
        responses=RoleSerializer(many=True),
    )
    @action(detail=False, methods=['get'])
    def bulk(self, request):
        """
        Return all roles without pagination for autocomplete/dropdowns
        Access via: GET /api/roles/bulk/
        """
        queryset = self.get_queryset()
        
        # Limit to active roles by default for autocomplete
        if 'include_inactive' not in request.query_params:
            queryset = queryset.filter(is_active=True)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    def destroy(self, request, *args, **kwargs):
        """
        Override destroy to check for role usage before deletion
        """
        role = self.get_object()
        
        # Check if role is assigned to any people
        people_count = role.people_count
        if people_count > 0:
            return Response({
                'error': f'Cannot delete role "{role.name}" as it is assigned to {people_count} people. '
                         'Please reassign those people to other roles first.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        return super().destroy(request, *args, **kwargs)
