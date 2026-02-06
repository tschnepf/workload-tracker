"""
Person serializers using auto-mapping to prevent naming mismatches.
NEVER write manual field mappings here.
"""

from rest_framework import serializers
from core.serializers import AutoMappedSerializer
from core.fields import PERSON_FIELDS
from .models import Person
from drf_spectacular.utils import extend_schema_field


class SkillMatchRequestSerializer(serializers.Serializer):
    """Query description for skill match endpoint (documentation aid)."""
    skills = serializers.CharField(required=True, help_text="Comma-separated skill names")
    department = serializers.IntegerField(required=False, allow_null=True)
    include_children = serializers.IntegerField(required=False, help_text="0|1")
    limit = serializers.IntegerField(required=False, min_value=1, max_value=200, default=50)
    week = serializers.DateField(required=False, help_text="YYYY-MM-DD (Monday)")


class SkillMatchResultItemSerializer(serializers.Serializer):
    """Result item for people skill match scoring."""
    personId = serializers.IntegerField()
    name = serializers.CharField()
    score = serializers.FloatField(help_text="0-100")
    matchedSkills = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    missingSkills = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    departmentId = serializers.IntegerField(allow_null=True)
    roleName = serializers.CharField(allow_null=True, required=False)


class FindAvailableResultItemSerializer(serializers.Serializer):
    """Result item for availability + skill ranking."""
    personId = serializers.IntegerField()
    name = serializers.CharField()
    availableHours = serializers.FloatField()
    capacity = serializers.FloatField()
    utilizationPercent = serializers.FloatField()
    skillScore = serializers.FloatField()
    matchedSkills = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    missingSkills = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    departmentId = serializers.IntegerField(allow_null=True)
    roleName = serializers.CharField(allow_null=True, required=False)

class PersonSerializer(serializers.ModelSerializer):
    """Person serializer with department and role integration"""
    
    # Core fields
    weeklyCapacity = serializers.IntegerField(source='weekly_capacity', required=False, default=36)
    # Employment fields
    hireDate = serializers.DateField(source='hire_date', required=False, allow_null=True)
    isActive = serializers.BooleanField(source='is_active', required=False)
    
    # Department fields (Phase 2)
    departmentName = serializers.CharField(source='department.name', read_only=True)
    vertical = serializers.IntegerField(source='department.vertical_id', read_only=True, allow_null=True)
    verticalName = serializers.CharField(source='department.vertical.name', read_only=True, allow_null=True)
    
    # Role fields - proper implementation without workarounds
    roleName = serializers.CharField(source='role.name', read_only=True)
    
    class Meta:
        model = Person
        fields = ['id', 'name', 'weeklyCapacity', 'role', 'roleName', 'department', 'departmentName', 'vertical', 'verticalName', 'location', 'hireDate', 'isActive', 'notes', 'createdAt', 'updatedAt']
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


class PersonCapacityHeatmapItemSerializer(serializers.Serializer):
    """Serializer for capacity heatmap items returned by capacity_heatmap action."""
    id = serializers.IntegerField()
    name = serializers.CharField()
    weeklyCapacity = serializers.IntegerField()
    department = serializers.CharField(allow_null=True, required=False)
    weekKeys = serializers.ListField(child=serializers.CharField())
    weekTotals = serializers.DictField(child=serializers.FloatField())
    peak = serializers.DictField(child=serializers.FloatField(), allow_empty=True)
    averagePercentage = serializers.FloatField()
    # Optional, additive fields (server-side computed convenience)
    percentByWeek = serializers.DictField(child=serializers.FloatField(), required=False)
    availableByWeek = serializers.DictField(child=serializers.FloatField(), required=False)


class WorkloadForecastOverallocatedItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class WorkloadForecastItemSerializer(serializers.Serializer):
    """Serializer for workload forecast items returned by workload_forecast action."""
    weekStart = serializers.CharField()
    totalCapacity = serializers.FloatField()
    totalAllocated = serializers.FloatField()
    teamUtilization = serializers.FloatField()
    peopleOverallocated = serializers.ListField(child=WorkloadForecastOverallocatedItemSerializer())
