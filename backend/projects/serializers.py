from rest_framework import serializers
from .models import Project


class ProjectFilterEntrySerializer(serializers.Serializer):
    assignmentCount = serializers.IntegerField()
    hasFutureDeliverables = serializers.BooleanField()
    status = serializers.CharField()


class ProjectFilterMetadataSerializer(serializers.Serializer):
    projectFilters = serializers.DictField(child=ProjectFilterEntrySerializer())

class ProjectSerializer(serializers.ModelSerializer):
    projectNumber = serializers.CharField(source='project_number', required=False, allow_null=True, allow_blank=True)
    startDate = serializers.DateField(source='start_date', required=False, allow_null=True)
    endDate = serializers.DateField(source='end_date', required=False, allow_null=True) 
    estimatedHours = serializers.IntegerField(source='estimated_hours', required=False, allow_null=True)
    isActive = serializers.BooleanField(source='is_active', default=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'status', 'client', 'description', 'projectNumber', 
                 'startDate', 'endDate', 'estimatedHours', 'isActive', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt']

    # Best practice: normalize optional fields and enforce constraints at the
    # serializer layer to avoid DB-level 500s (e.g., unique nullability).
    def validate_projectNumber(self, value):
        """Coerce blank/whitespace-only project numbers to None and trim."""
        if value is None:
            return None
        value = (value or '').strip()
        return value or None

    def validate_client(self, value):
        # Trim client; default to 'Internal' if blank
        value = (value or '').strip()
        return value or 'Internal'

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Name is required')
        return value
