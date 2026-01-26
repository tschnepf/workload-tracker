"""
Role serializers for API responses with camelCase transformation.
"""

from rest_framework import serializers
from .models import Role


class RoleSerializer(serializers.ModelSerializer):
    """Role serializer with camelCase field transformation"""
    
    # CRITICAL: All fields needed by frontend must be explicitly listed
    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'overheadHoursPerWeek', 'isActive', 'sortOrder', 'createdAt', 'updatedAt']
        extra_kwargs = {
            'isActive': {'source': 'is_active'},
            'sortOrder': {'source': 'sort_order', 'required': False},
            'overheadHoursPerWeek': {'source': 'overhead_hours_per_week', 'required': False},
            'createdAt': {'source': 'created_at', 'read_only': True},
            'updatedAt': {'source': 'updated_at', 'read_only': True},
        }
    
    def validate_name(self, value):
        """Validate role name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Role name cannot be empty.")
        
        # Strip whitespace
        value = value.strip()
        
        # Check length
        if len(value) > 100:
            raise serializers.ValidationError("Role name cannot exceed 100 characters.")
        
        return value
