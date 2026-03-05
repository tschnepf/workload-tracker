from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field, OpenApiTypes
from django.http import QueryDict
from django.urls import reverse
import json
import re
from .models import (
    Project,
    ProjectRisk,
    ProjectRiskEdit,
    ProjectChangeLog,
    ProjectStatusDefinition,
    ProjectTaskTemplate,
    ProjectTask,
    ProjectTaskScope,
)
from .status_definitions import normalize_status_key, status_exists
from verticals.models import Vertical
from departments.models import Department
from people.models import Person
from assignments.utils.project_membership import is_current_project_assignee


class ProjectFilterEntrySerializer(serializers.Serializer):
    assignmentCount = serializers.IntegerField()
    hasFutureDeliverables = serializers.BooleanField()
    status = serializers.CharField()
    missingQa = serializers.BooleanField(required=False)


class ProjectFilterMetadataSerializer(serializers.Serializer):
    projectFilters = serializers.DictField(child=ProjectFilterEntrySerializer())


class ProjectStatusDefinitionSerializer(serializers.ModelSerializer):
    colorHex = serializers.CharField(source='color_hex')
    includeInAnalytics = serializers.BooleanField(source='include_in_analytics', required=False)
    treatAsCaWhenNoDeliverable = serializers.BooleanField(source='treat_as_ca_when_no_deliverable', required=False)
    isSystem = serializers.BooleanField(source='is_system', read_only=True)
    isActive = serializers.BooleanField(source='is_active', required=False)
    sortOrder = serializers.IntegerField(source='sort_order', required=False)
    inUseCount = serializers.IntegerField(read_only=True)
    canDelete = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProjectStatusDefinition
        fields = [
            'key',
            'label',
            'colorHex',
            'includeInAnalytics',
            'treatAsCaWhenNoDeliverable',
            'isSystem',
            'isActive',
            'sortOrder',
            'inUseCount',
            'canDelete',
        ]
        read_only_fields = ['isSystem', 'inUseCount', 'canDelete']

    def validate_key(self, value: str) -> str:
        key = normalize_status_key(value)
        if not re.fullmatch(r'[a-z][a-z0-9_]{1,63}', key):
            raise serializers.ValidationError(
                "Key must start with a letter and contain only lowercase letters, numbers, and underscores."
            )
        return key

    def validate_colorHex(self, value: str) -> str:
        if not re.fullmatch(r'^#[0-9a-fA-F]{6}$', value or ''):
            raise serializers.ValidationError('Color must be a valid hex code in #RRGGBB format.')
        return value.lower()

    def validate(self, attrs):
        include_in_analytics = attrs.get('include_in_analytics')
        treat_as_ca = attrs.get('treat_as_ca_when_no_deliverable')

        if include_in_analytics is None and self.instance is not None:
            include_in_analytics = bool(getattr(self.instance, 'include_in_analytics', False))
        if treat_as_ca is None and self.instance is not None:
            treat_as_ca = bool(getattr(self.instance, 'treat_as_ca_when_no_deliverable', False))

        if bool(treat_as_ca) and not bool(include_in_analytics):
            raise serializers.ValidationError({
                'treatAsCaWhenNoDeliverable': 'CA override requires "Include in analytics" to be enabled.'
            })
        return attrs


class ProjectSerializer(serializers.ModelSerializer):
    vertical = serializers.PrimaryKeyRelatedField(queryset=Vertical.objects.all(), required=False, allow_null=True)
    verticalName = serializers.CharField(source='vertical.name', read_only=True)
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
    autoHoursTemplateId = serializers.IntegerField(source='auto_hours_template_id', required=False, allow_null=True)
    # Scratch pad notes (rich-text HTML accepted)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # Canonical TipTap JSON (camelCase -> snake_case)
    notesJson = serializers.JSONField(source='notes_json', required=False, allow_null=True)
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'status', 'client', 'description', 'notes', 'notesJson', 'projectNumber',
                 'startDate', 'endDate', 'estimatedHours', 'isActive', 'bqeClientName', 'bqeClientId',
                 'clientSyncPolicyState', 'autoHoursTemplateId', 'vertical', 'verticalName', 'createdAt', 'updatedAt']
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

    def validate_status(self, value):
        key = normalize_status_key(value)
        if not key:
            raise serializers.ValidationError('Status is required')
        if not status_exists(key):
            raise serializers.ValidationError('Unknown project status key')
        return key


class ProjectAvailabilityItemSerializer(serializers.Serializer):
    """Availability snapshot item for a person in project context."""
    personId = serializers.IntegerField()
    personName = serializers.CharField()
    totalHours = serializers.FloatField()
    capacity = serializers.FloatField()
    availableHours = serializers.FloatField()
    utilizationPercent = serializers.FloatField()


class ProjectTaskTemplateSerializer(serializers.ModelSerializer):
    verticalId = serializers.PrimaryKeyRelatedField(source='vertical', queryset=Vertical.objects.all())
    verticalName = serializers.CharField(source='vertical.name', read_only=True)
    departmentId = serializers.PrimaryKeyRelatedField(source='department', queryset=Department.objects.all())
    departmentName = serializers.CharField(source='department.name', read_only=True)
    sortOrder = serializers.IntegerField(source='sort_order', required=False)
    isActive = serializers.BooleanField(source='is_active', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = ProjectTaskTemplate
        fields = [
            'id',
            'verticalId',
            'verticalName',
            'scope',
            'departmentId',
            'departmentName',
            'name',
            'description',
            'sortOrder',
            'isActive',
            'createdAt',
            'updatedAt',
        ]

    def validate_scope(self, value):
        if value not in {ProjectTaskScope.PROJECT, ProjectTaskScope.DELIVERABLE}:
            raise serializers.ValidationError('scope must be project or deliverable')
        return value

    def create(self, validated_data):
        instance = super().create(validated_data)
        # If a manager/admin creates templates for a vertical, default that
        # vertical to enabled so templates are immediately usable on projects.
        vertical = getattr(instance, 'vertical', None)
        if vertical and not getattr(vertical, 'task_tracking_enabled', False):
            try:
                vertical.task_tracking_enabled = True
                vertical.save(update_fields=['task_tracking_enabled', 'updated_at'])
            except Exception:
                pass
        return instance


class ProjectTaskSerializer(serializers.ModelSerializer):
    templateId = serializers.PrimaryKeyRelatedField(
        source='template',
        queryset=ProjectTaskTemplate.objects.all(),
        allow_null=True,
        required=False,
    )
    departmentId = serializers.PrimaryKeyRelatedField(source='department', queryset=Department.objects.all())
    departmentName = serializers.CharField(source='department.name', read_only=True)
    completionPercent = serializers.IntegerField(source='completion_percent')
    assigneeIds = serializers.PrimaryKeyRelatedField(
        source='assignees',
        many=True,
        queryset=Person.objects.all(),
        required=False,
    )
    assigneeNames = serializers.SerializerMethodField()
    deliverableInfo = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = ProjectTask
        fields = [
            'id',
            'project',
            'deliverable',
            'deliverableInfo',
            'templateId',
            'scope',
            'departmentId',
            'departmentName',
            'name',
            'description',
            'completionPercent',
            'assigneeIds',
            'assigneeNames',
            'createdAt',
            'updatedAt',
        ]

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_assigneeNames(self, obj):
        names = []
        try:
            for person in obj.assignees.all():
                names.append(person.name)
        except Exception:
            return []
        return names

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_deliverableInfo(self, obj):
        d = getattr(obj, 'deliverable', None)
        if not d:
            return None
        return {
            'id': d.id,
            'projectId': d.project_id,
            'description': d.description,
            'date': d.date.isoformat() if d.date else None,
            'percentage': d.percentage,
        }

    def validate_completionPercent(self, value):
        try:
            percent = int(value)
        except Exception:
            raise serializers.ValidationError('completionPercent must be an integer')
        if percent < 0 or percent > 100:
            raise serializers.ValidationError('completionPercent must be between 0 and 100')
        if percent % 5 != 0:
            raise serializers.ValidationError('completionPercent must be in 5% increments')
        return percent

    def validate(self, attrs):
        project = attrs.get('project') or getattr(self.instance, 'project', None)
        if not project:
            raise serializers.ValidationError({'project': 'project is required'})
        deliverable = attrs.get('deliverable', getattr(self.instance, 'deliverable', None))
        scope = attrs.get('scope', getattr(self.instance, 'scope', None))
        if scope == ProjectTaskScope.PROJECT and deliverable is not None:
            raise serializers.ValidationError({'deliverable': 'project-scope tasks cannot target a deliverable'})
        if scope == ProjectTaskScope.DELIVERABLE:
            if deliverable is None:
                raise serializers.ValidationError({'deliverable': 'deliverable is required for deliverable scope'})
            if deliverable.project_id != project.id:
                raise serializers.ValidationError({'deliverable': 'deliverable must belong to project'})

        assignees = attrs.get('assignees', None)
        if assignees is not None:
            invalid = []
            for person in assignees:
                if not is_current_project_assignee(person.id, project.id):
                    invalid.append(person.id)
            if invalid:
                raise serializers.ValidationError({'assigneeIds': f'assignees must be current project members: {invalid}'})
        return attrs


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


class ProjectChangeLogSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()
    actorName = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = ProjectChangeLog
        fields = [
            'id',
            'project',
            'action',
            'detail',
            'createdAt',
            'actor',
            'actorName',
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_actor(self, obj):
        user = getattr(obj, 'actor', None)
        if not user:
            return None
        return {
            'id': getattr(user, 'id', None),
            'username': getattr(user, 'username', None),
            'email': getattr(user, 'email', None),
        }

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
