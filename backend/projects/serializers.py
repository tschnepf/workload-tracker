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
    # Scratch pad notes (rich-text HTML accepted)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # Canonical TipTap JSON (camelCase -> snake_case)
    notesJson = serializers.JSONField(source='notes_json', required=False, allow_null=True)
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'status', 'client', 'description', 'notes', 'notesJson', 'projectNumber', 
                 'startDate', 'endDate', 'estimatedHours', 'isActive', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt']

    # Best practice: normalize optional fields and enforce constraints at the
    # serializer layer to avoid DB-level 500s (e.g., unique nullability).
    def validate_projectNumber(self, value):
        """Coerce blank/whitespace-only project numbers to None and trim."""
        if value is None:
            return None
        value = (value or '').strip()
        cleaned = value or None

        # Proactive uniqueness check to avoid DB IntegrityError (500)
        # when updating an existing Project. This returns a 400 with a
        # clear message instead.
        if cleaned:
            qs = Project.objects.all()
            # Exclude current instance on update
            instance = getattr(self, 'instance', None)
            if instance is not None and getattr(instance, 'pk', None) is not None:
                qs = qs.exclude(pk=instance.pk)
            if qs.filter(project_number=cleaned).exists():
                raise serializers.ValidationError('Project number must be unique')
        return cleaned

    def validate_client(self, value):
        # Trim client; default to 'Internal' if blank
        value = (value or '').strip()
        return value or 'Internal'

    def validate_name(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Name is required')
        return value


class ProjectAvailabilityItemSerializer(serializers.Serializer):
    """Availability snapshot item for a person in project context."""
    personId = serializers.IntegerField()
    personName = serializers.CharField()
    totalHours = serializers.FloatField()
    capacity = serializers.FloatField()
    availableHours = serializers.FloatField()
    utilizationPercent = serializers.FloatField()
