"""
Deliverable serializers - STANDARDS COMPLIANT
Follows R2-REBUILD-STANDARDS.md: snake_case -> camelCase transformation
"""

from rest_framework import serializers
from .models import Deliverable, DeliverableAssignment
from datetime import datetime
from projects.models import Project


class DeliverableSerializer(serializers.ModelSerializer):
    """Deliverable serializer with snake_case -> camelCase field mapping"""
    
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


class DeliverableAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for linking people to deliverables with weekly hours."""

    # CamelCase API fields mapped to snake_case model fields
    weeklyHours = serializers.JSONField(source='weekly_hours')
    roleOnMilestone = serializers.CharField(source='role_on_milestone', allow_null=True, allow_blank=True, required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    # Read-only denormalized fields
    personName = serializers.CharField(source='person.name', read_only=True)
    projectId = serializers.IntegerField(source='deliverable.project_id', read_only=True)

    class Meta:
        model = DeliverableAssignment
        fields = [
            'id',
            'deliverable',
            'person',
            'weeklyHours',
            'roleOnMilestone',
            'is_active',
            'personName',
            'projectId',
            'createdAt',
            'updatedAt',
        ]
        extra_kwargs = {
            'deliverable': {'required': True},
            'person': {'required': True},
            'is_active': {'required': False},
        }

    # Validation following R2 prompt (Sunday keys, 0-80 hours, sanitize role)
    def validate_weeklyHours(self, value):  # Field name is the serializer field
        if not isinstance(value, dict):
            raise serializers.ValidationError("Weekly hours must be a dictionary")
        for date_key, hours in value.items():
            try:
                date_obj = datetime.strptime(date_key, '%Y-%m-%d')
                if date_obj.weekday() != 6:  # Sunday == 6
                    raise serializers.ValidationError(f"Week key {date_key} must be a Sunday")
            except ValueError:
                raise serializers.ValidationError(f"Invalid date format: {date_key}. Use YYYY-MM-DD Sunday")
            if not isinstance(hours, (int, float)) or hours < 0 or hours > 80:
                raise serializers.ValidationError(f"Hours must be 0-80, got: {hours}")
        return value

    # Support alternate method name for clarity in code references
    def validate_weekly_hours(self, value):
        return self.validate_weeklyHours(value)

    def validate_roleOnMilestone(self, value):
        if value is None:
            return None
        value = value.strip()[:100]
        import re
        value = re.sub(r"[<>\"']", '', value)
        return value

    def validate_role_on_milestone(self, value):
        return self.validate_roleOnMilestone(value)
