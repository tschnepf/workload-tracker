from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field, OpenApiTypes
from django.http import QueryDict
from django.urls import reverse
import json
from .models import Project, ProjectRisk, ProjectRiskEdit
from departments.models import Department


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
    bqeClientName = serializers.CharField(source='bqe_client_name', read_only=True)
    bqeClientId = serializers.CharField(source='bqe_client_id', read_only=True)
    clientSyncPolicyState = serializers.CharField(source='client_sync_policy_state', read_only=True)
    # Scratch pad notes (rich-text HTML accepted)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # Canonical TipTap JSON (camelCase -> snake_case)
    notesJson = serializers.JSONField(source='notes_json', required=False, allow_null=True)
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'status', 'client', 'description', 'notes', 'notesJson', 'projectNumber',
                 'startDate', 'endDate', 'estimatedHours', 'isActive', 'bqeClientName', 'bqeClientId',
                 'clientSyncPolicyState', 'createdAt', 'updatedAt']
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


class ProjectRiskEditSerializer(serializers.ModelSerializer):
    actor = serializers.PrimaryKeyRelatedField(read_only=True)
    actorName = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = ProjectRiskEdit
        fields = [
            'id',
            'action',
            'changes',
            'actor',
            'actorName',
            'createdAt',
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_actorName(self, obj):
        user = getattr(obj, 'actor', None)
        if not user:
            return None
        try:
            person = getattr(getattr(user, 'profile', None), 'person', None)
            if person and getattr(person, 'name', None):
                return person.name
        except Exception:
            pass
        try:
            name = user.get_full_name()
            if name:
                return name
        except Exception:
            pass
        return getattr(user, 'username', None) or str(user)


class ProjectRiskSerializer(serializers.ModelSerializer):
    departments = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Department.objects.all(),
        required=False,
    )
    departmentNames = serializers.SerializerMethodField()
    createdBy = serializers.PrimaryKeyRelatedField(source='created_by', read_only=True)
    createdByName = serializers.SerializerMethodField()
    updatedBy = serializers.PrimaryKeyRelatedField(source='updated_by', read_only=True)
    updatedByName = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    attachmentUrl = serializers.SerializerMethodField()
    edits = serializers.SerializerMethodField()

    class Meta:
        model = ProjectRisk
        fields = [
            'id',
            'project',
            'description',
            'priority',
            'status',
            'departments',
            'departmentNames',
            'createdBy',
            'createdByName',
            'createdAt',
            'updatedBy',
            'updatedByName',
            'updatedAt',
            'attachment',
            'attachmentUrl',
            'edits',
        ]
        read_only_fields = [
            'id',
            'project',
            'createdBy',
            'createdByName',
            'createdAt',
            'updatedBy',
            'updatedByName',
            'updatedAt',
            'attachmentUrl',
        ]

    @extend_schema_field(ProjectRiskEditSerializer(many=True))
    def get_edits(self, obj):
        edits = getattr(obj, 'edits', None)
        if edits is None:
            return []
        return ProjectRiskEditSerializer(edits.all(), many=True, context=self.context).data

    def to_internal_value(self, data):
        is_querydict = isinstance(data, QueryDict)
        if is_querydict:
            data = data.copy()
        if isinstance(data, dict) and 'departments' in data:
            raw = data.get('departments')
            if isinstance(raw, str):
                try:
                    parsed = json.loads(raw)
                except Exception:
                    parsed = None
                if isinstance(parsed, list):
                    if is_querydict and isinstance(data, QueryDict):
                        data.setlist('departments', [str(v) for v in parsed])
                    else:
                        data['departments'] = parsed
                elif raw.strip() == '':
                    if is_querydict and isinstance(data, QueryDict):
                        data.setlist('departments', [])
                    else:
                        data['departments'] = []
        return super().to_internal_value(data)

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_departmentNames(self, obj):
        try:
            return [d.name for d in obj.departments.all()]
        except Exception:
            return []

    def _user_display_name(self, user):
        if not user:
            return None
        try:
            person = getattr(getattr(user, 'profile', None), 'person', None)
            if person and getattr(person, 'name', None):
                return person.name
        except Exception:
            pass
        try:
            name = user.get_full_name()
            if name:
                return name
        except Exception:
            pass
        return getattr(user, 'username', None) or str(user)

    @extend_schema_field(OpenApiTypes.STR)
    def get_createdByName(self, obj):
        return self._user_display_name(getattr(obj, 'created_by', None))

    @extend_schema_field(OpenApiTypes.STR)
    def get_updatedByName(self, obj):
        return self._user_display_name(getattr(obj, 'updated_by', None))

    @extend_schema_field(OpenApiTypes.STR)
    def get_attachmentUrl(self, obj):
        if not getattr(obj, 'attachment', None):
            return None
        request = self.context.get('request')
        if not request:
            return None
        return request.build_absolute_uri(
            reverse('project_risk_attachment', kwargs={'project_id': obj.project_id, 'risk_id': obj.id})
        )
