"""
Person serializers using auto-mapping to prevent naming mismatches.
NEVER write manual field mappings here.
"""

from rest_framework import serializers
from core.serializers import AutoMappedSerializer
from core.fields import PERSON_FIELDS
from .models import Person

class PersonSerializer(serializers.ModelSerializer):
    """Person serializer with department and role integration"""
    
    # Core fields
    weeklyCapacity = serializers.IntegerField(source='weekly_capacity', required=False, default=36)
    
    # Department fields (Phase 2)
    departmentName = serializers.CharField(source='department.name', read_only=True)
    
    # Role fields - proper implementation without workarounds
    roleName = serializers.CharField(source='role.name', read_only=True)
    
    class Meta:
        model = Person
        fields = ['id', 'name', 'weeklyCapacity', 'role', 'roleName', 'department', 'departmentName', 'location', 'notes', 'createdAt', 'updatedAt']
        extra_kwargs = {
            'createdAt': {'source': 'created_at', 'read_only': True},
            'updatedAt': {'source': 'updated_at', 'read_only': True},
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Set role field queryset to active roles only
        from roles.models import Role
        if 'role' in self.fields:
            self.fields['role'].queryset = Role.objects.filter(is_active=True)