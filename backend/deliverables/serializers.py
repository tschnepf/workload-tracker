"""
Deliverable serializers - STANDARDS COMPLIANT
Follows R2-REBUILD-STANDARDS.md: snake_case → camelCase transformation
"""

from rest_framework import serializers
from .models import Deliverable
from projects.models import Project


class DeliverableSerializer(serializers.ModelSerializer):
    """Deliverable serializer with snake_case → camelCase field mapping"""
    
    # Map snake_case model fields to camelCase API fields
    sortOrder = serializers.IntegerField(source='sort_order', required=False)
    isCompleted = serializers.BooleanField(source='is_completed', required=False)
    completedDate = serializers.DateField(source='completed_date', required=False, allow_null=True, format='%Y-%m-%d')
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    # Date field with proper formatting
    date = serializers.DateField(required=False, allow_null=True, format='%Y-%m-%d')
    
    class Meta:
        model = Deliverable
        fields = [
            'id',
            'project',
            'percentage', 
            'description',
            'date',
            'notes',
            'sortOrder',
            'isCompleted', 
            'completedDate',
            'createdAt',
            'updatedAt'
        ]
        extra_kwargs = {
            'percentage': {'required': False, 'allow_null': True},
            'description': {'required': False, 'allow_blank': True},
            'notes': {'required': False, 'allow_blank': True},
        }
    
    def validate_percentage(self, value):
        """Validate percentage is within 0-100 range if provided"""
        if value is not None and (value < 0 or value > 100):
            raise serializers.ValidationError("Percentage must be between 0 and 100")
        return value