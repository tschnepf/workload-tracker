from rest_framework import viewsets
from rest_framework.response import Response
from .models import Department
from .serializers import DepartmentSerializer

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.filter(is_active=True).order_by('name')
    serializer_class = DepartmentSerializer
    permission_classes = []  # Remove auth requirement to match people API
    
    def list(self, request, *args, **kwargs):
        """Get all departments with bulk loading support"""
        # Check if bulk loading is requested
        if request.query_params.get('all') == 'true':
            # Return all departments without pagination (Phase 2 optimization)
            queryset = self.get_queryset()
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        
        # Use default pagination
        return super().list(request, *args, **kwargs)