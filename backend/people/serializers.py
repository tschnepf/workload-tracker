"""
Person serializers using auto-mapping to prevent naming mismatches.
NEVER write manual field mappings here.
"""

from rest_framework import serializers
from core.serializers import AutoMappedSerializer
from core.fields import PERSON_FIELDS
from .models import Person

class PersonSerializer(serializers.ModelSerializer):
    """Person serializer with department integration (Phase 2)"""
    
    # Core fields
    weeklyCapacity = serializers.IntegerField(source='weekly_capacity', required=False, default=36)
    
    # Department fields (Phase 2)
    departmentName = serializers.CharField(source='department.name', read_only=True)
    
    class Meta:
        model = Person
        fields = ['id', 'name', 'weeklyCapacity', 'department', 'departmentName', 'location', 'notes', 'createdAt', 'updatedAt']
        extra_kwargs = {
            'createdAt': {'source': 'created_at', 'read_only': True},
            'updatedAt': {'source': 'updated_at', 'read_only': True},
        }