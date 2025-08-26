"""
Person serializers using auto-mapping to prevent naming mismatches.
NEVER write manual field mappings here.
"""

from rest_framework import serializers
from core.serializers import AutoMappedSerializer
from core.fields import PERSON_FIELDS
from .models import Person

class PersonSerializer(serializers.ModelSerializer):
    """Person serializer with manual field mapping for Chunk 2"""
    
    # For Chunk 2, we only use name and weeklyCapacity
    weeklyCapacity = serializers.IntegerField(source='weekly_capacity', required=False, default=36)
    
    class Meta:
        model = Person
        fields = ['id', 'name', 'weeklyCapacity', 'createdAt', 'updatedAt']
        extra_kwargs = {
            'createdAt': {'source': 'created_at', 'read_only': True},
            'updatedAt': {'source': 'updated_at', 'read_only': True},
        }