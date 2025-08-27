"""
Assignment API Views - Chunk 3
Uses AutoMapped serializers for naming prevention
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Sum
from .models import Assignment
from .serializers import AssignmentSerializer

class AssignmentViewSet(viewsets.ModelViewSet):
    """
    Assignment CRUD API with utilization tracking
    Uses AutoMapped serializer for automatic snake_case ↔ camelCase conversion
    """
    queryset = Assignment.objects.filter(is_active=True).select_related('person').order_by('-created_at')
    serializer_class = AssignmentSerializer
    permission_classes = []  # Remove auth for Chunk 3 testing
    
    def list(self, request):
        """Get all assignments with person details"""
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        
        return Response({
            'results': serializer.data,
            'count': len(serializer.data)
        })
    
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