"""
Assignment serializers - Retrofitted for weekly hours
RETROFIT: Support weekly hours for 12-week planning horizon
"""

from rest_framework import serializers
from .models import Assignment
from projects.models import Project
from skills.serializers import PersonSkillSummarySerializer

class AssignmentSerializer(serializers.ModelSerializer):
    """Assignment serializer with weekly hours support"""
    
    # Weekly hours as the primary field (replaces allocationPercentage)
    weeklyHours = serializers.JSONField(source='weekly_hours')
    projectName = serializers.CharField(source='project_name', max_length=200, required=False)
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all(), required=False, allow_null=True)
    projectDisplayName = serializers.CharField(source='project_display', read_only=True)
    personName = serializers.CharField(source='person.name', read_only=True)
    personWeeklyCapacity = serializers.IntegerField(source='person.weekly_capacity', read_only=True)
    personSkills = PersonSkillSummarySerializer(source='person.skills', many=True, read_only=True)
    roleOnProject = serializers.CharField(source='role_on_project', max_length=100, required=False, allow_blank=True)
    
    # Calculated fields removed for performance - not used on projects page
    
    # Legacy field - kept for backward compatibility but not used in UI
    allocationPercentage = serializers.IntegerField(source='allocation_percentage', read_only=True)
    
    class Meta:
        model = Assignment
        fields = [
            'id', 
            'person', 
            'personName', 
            'personWeeklyCapacity',
            'personSkills',
            'projectName', 
            'project',
            'projectDisplayName',
            'roleOnProject',
            'weeklyHours',
            'allocationPercentage',  # Legacy
            'createdAt', 
            'updatedAt'
        ]
        extra_kwargs = {
            'createdAt': {'source': 'created_at', 'read_only': True},
            'updatedAt': {'source': 'updated_at', 'read_only': True},
        }
    
    def validate_weeklyHours(self, value):
        """Validate weekly hours data structure and values.

        Over-allocation is allowed; we only check structure, date format, and non-negativity.
        """
        if not isinstance(value, dict):
            raise serializers.ValidationError("Weekly hours must be a dictionary")

        from datetime import datetime
        for week_key, hours in value.items():
            # Validate week key format (should be YYYY-MM-DD)
            try:
                datetime.strptime(week_key, '%Y-%m-%d')
            except ValueError:
                raise serializers.ValidationError(f"Invalid week date format: {week_key}. Use YYYY-MM-DD")

            # Validate hours value (non-negative, numeric). No hard caps.
            try:
                hours_float = float(hours)
                if hours_float < 0:
                    raise serializers.ValidationError(f"Hours cannot be negative for week {week_key}")
            except (ValueError, TypeError):
                raise serializers.ValidationError(f"Invalid hours value for week {week_key}: {hours}")

        return value
    
    def validate(self, attrs):
        """Cross-field validation: allow overages; no blocking caps."""
        return attrs
    
    def create(self, validated_data):
        """Create assignment with weekly hours"""
        # If no weekly_hours provided, initialize with empty dict
        if 'weekly_hours' not in validated_data:
            validated_data['weekly_hours'] = {}
        
        return super().create(validated_data)
    
    def to_representation(self, instance):
        """Add computed fields to the response"""
        data = super().to_representation(instance)
        
        # Add the list of next 12 weeks for the frontend
        data['availableWeeks'] = Assignment.get_next_12_weeks()
        
        return data
