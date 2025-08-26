"""
People API Views - Using AutoMapped serializers for naming prevention
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Sum
from .models import Person
from .serializers import PersonSerializer

class PersonViewSet(viewsets.ModelViewSet):
    """
    Person CRUD API with utilization calculations
    Uses AutoMapped serializer for automatic snake_case ↔ camelCase conversion
    """
    queryset = Person.objects.all().order_by('-created_at')
    serializer_class = PersonSerializer
    permission_classes = []  # Remove auth requirement for Chunk 2 testing
    
    def get_queryset(self):
        """Filter active people by default"""
        return Person.objects.filter(is_active=True).order_by('name')
    
    # For Chunk 2: Simple CRUD only, utilization will be added in Chunk 3