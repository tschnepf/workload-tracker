"""
People API Views - Using AutoMapped serializers for naming prevention
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import UserRateThrottle
from django.db.models import Sum, Max
from django.http import HttpResponseNotModified
from django.utils.http import http_date
from .models import Person
from .serializers import PersonSerializer
import hashlib

class HotEndpointThrottle(UserRateThrottle):
    """Special throttle for hot endpoints like utilization checking"""
    scope = 'hot_endpoint'

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
    
    def list(self, request, *args, **kwargs):
        """Get all people with conditional request support (ETag/Last-Modified)"""
        queryset = self.get_queryset()
        
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