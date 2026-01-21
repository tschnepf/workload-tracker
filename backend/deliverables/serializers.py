"""
Deliverable serializers - STANDARDS COMPLIANT
Follows R2-REBUILD-STANDARDS.md: snake_case -> camelCase transformation
"""

from rest_framework import serializers
from django.utils import timezone
import re
from drf_spectacular.utils import extend_schema_field
from .models import (
    Deliverable,
    DeliverableAssignment,
    PreDeliverableItem,
    DeliverableTaskTemplate,
    DeliverableTask,
    DeliverableQATask,
    DeliverableQATaskEdit,
)
from datetime import datetime, timedelta
from projects.models import Project
from core.choices import DeliverableTaskCompletionStatus, DeliverableTaskQaStatus, DeliverableQAReviewStatus
from assignments.utils.project_membership import is_current_project_assignee
from core.models import QATaskSettings


class DeliverableSerializer(serializers.ModelSerializer):
    """Deliverable serializer with snake_case -> camelCase field mapping"""
    
    # Map snake_case model fields to camelCase API fields
    sortOrder = serializers.IntegerField(source='sort_order', required=False)
    isCompleted = serializers.BooleanField(source='is_completed', required=False)
    completedDate = serializers.DateField(source='completed_date', required=False, allow_null=True, format='%Y-%m-%d')
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    preItems = serializers.SerializerMethodField(required=False)
    
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
            'updatedAt',
            'preItems',
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

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_preItems(self, obj):
        include = bool(self.context.get('include_pre_items'))
        if not include:
            return None
        items = obj.pre_items.all().select_related('pre_deliverable_type')
        return PreDeliverableItemSerializer(items, many=True).data


class DeliverableAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for linking people to deliverables with weekly hours."""

    # CamelCase API fields mapped to snake_case model fields
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

    # Validation for role
    
    def validate_roleOnMilestone(self, value):
        if value is None:
            return None
        value = value.strip()[:100]
        import re
        value = re.sub(r"[<>\"']", '', value)
        return value

    def validate_role_on_milestone(self, value):
        return self.validate_roleOnMilestone(value)


class DeliverableCalendarItemSerializer(serializers.Serializer):
    """Serializer for calendar items (aggregate), camelCase API fields.

    Accepts Deliverable instances annotated with assignmentCount.
    """
    id = serializers.IntegerField()
    project = serializers.IntegerField(source='project_id')
    projectName = serializers.CharField(source='project.name', allow_null=True)
    projectClient = serializers.CharField(source='project.client', allow_null=True, required=False)
    title = serializers.SerializerMethodField()
    date = serializers.DateField(allow_null=True, format='%Y-%m-%d')
    isCompleted = serializers.BooleanField(source='is_completed')
    assignmentCount = serializers.IntegerField()

    @extend_schema_field(serializers.CharField())
    def get_title(self, obj):
        if getattr(obj, 'description', None):
            return obj.description
        pct = getattr(obj, 'percentage', None)
        if pct is not None:
            return f"{pct}%"
        return 'Milestone'


class PreDeliverableCompletedBySerializer(serializers.Serializer):
    id = serializers.IntegerField(allow_null=True)
    username = serializers.CharField(allow_null=True, required=False)


class PreDeliverableParentSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    description = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    date = serializers.DateField(allow_null=True, required=False)


class PreDeliverableAssignedPersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class PreDeliverableItemSerializer(serializers.ModelSerializer):
    preDeliverableTypeId = serializers.IntegerField(source='pre_deliverable_type_id')
    typeName = serializers.CharField(source='pre_deliverable_type.name', read_only=True)
    generatedDate = serializers.DateField(source='generated_date', format='%Y-%m-%d')
    daysBefore = serializers.IntegerField(source='days_before')
    isCompleted = serializers.BooleanField(source='is_completed')
    completedDate = serializers.DateField(source='completed_date', allow_null=True, required=False, format='%Y-%m-%d')
    completedBy = serializers.SerializerMethodField()
    isActive = serializers.BooleanField(source='is_active')
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    displayName = serializers.SerializerMethodField()
    isOverdue = serializers.SerializerMethodField()
    parentDeliverable = serializers.SerializerMethodField()
    assignedPeople = serializers.SerializerMethodField()
    itemType = serializers.SerializerMethodField()

    class Meta:
        model = PreDeliverableItem
        fields = [
            'id', 'deliverable', 'preDeliverableTypeId', 'typeName', 'generatedDate', 'daysBefore',
            'isCompleted', 'completedDate', 'completedBy', 'notes', 'isActive', 'createdAt', 'updatedAt',
            'displayName', 'isOverdue', 'parentDeliverable', 'assignedPeople', 'itemType'
        ]
        extra_kwargs = {
            'deliverable': {'required': True},
            'notes': {'required': False, 'allow_blank': True},
        }

    @extend_schema_field(PreDeliverableCompletedBySerializer)
    def get_completedBy(self, obj) -> dict | None:
        u = getattr(obj, 'completed_by', None)
        if not u:
            return None
        return {'id': u.id, 'username': getattr(u, 'username', None)}

    @extend_schema_field(serializers.CharField())
    def get_displayName(self, obj) -> str:
        return obj.display_name

    @extend_schema_field(serializers.BooleanField())
    def get_isOverdue(self, obj) -> bool:
        return obj.is_overdue

    @extend_schema_field(PreDeliverableParentSerializer)
    def get_parentDeliverable(self, obj) -> dict:
        d = obj.deliverable
        return {'id': d.id, 'description': d.description, 'date': d.date.isoformat() if d.date else None}

    @extend_schema_field(PreDeliverableAssignedPersonSerializer(many=True))
    def get_assignedPeople(self, obj) -> list[dict]:
        people = obj.get_assigned_people().only('id', 'name')
        return [{'id': p.id, 'name': p.name} for p in people]

    @extend_schema_field(serializers.CharField())
    def get_itemType(self, obj) -> str:
        return 'pre_deliverable'


class DeliverableTaskTemplateSerializer(serializers.ModelSerializer):
    phase = serializers.ChoiceField(choices=DeliverableTaskTemplate._meta.get_field('phase').choices)
    departmentId = serializers.PrimaryKeyRelatedField(source='department', queryset=DeliverableTaskTemplate._meta.get_field('department').related_model.objects.all())
    departmentName = serializers.CharField(source='department.name', read_only=True)
    sheetNumber = serializers.CharField(source='sheet_number', allow_null=True, allow_blank=True, required=False)
    sheetName = serializers.CharField(source='sheet_name', allow_null=True, allow_blank=True, required=False)
    scopeDescription = serializers.CharField(source='scope_description', allow_blank=True, required=False)
    defaultCompletionStatus = serializers.ChoiceField(source='default_completion_status', choices=DeliverableTaskCompletionStatus.choices)
    defaultQaStatus = serializers.ChoiceField(source='default_qa_status', choices=DeliverableTaskQaStatus.choices)
    sortOrder = serializers.IntegerField(source='sort_order', required=False)
    isActive = serializers.BooleanField(source='is_active', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = DeliverableTaskTemplate
        fields = [
            'id',
            'phase',
            'departmentId',
            'departmentName',
            'sheetNumber',
            'sheetName',
            'scopeDescription',
            'defaultCompletionStatus',
            'defaultQaStatus',
            'sortOrder',
            'isActive',
            'createdAt',
            'updatedAt',
        ]

    def validate_phase(self, value):
        allowed = {'sd', 'dd', 'ifp', 'ifc'}
        if value not in allowed:
            raise serializers.ValidationError('phase must be sd, dd, ifp, or ifc')
        return value

    def validate_sheetNumber(self, value):
        if value and not re.match(r'^[A-Za-z0-9]+([-.][A-Za-z0-9]+)*$', value):
            raise serializers.ValidationError('sheetNumber must be alphanumeric with optional - or . separators')
        return value

    def validate_sheetName(self, value):
        if value and not re.match(r'^[A-Za-z0-9 ]+$', value):
            raise serializers.ValidationError('sheetName must be alphanumeric')
        return value

    def update(self, instance, validated_data):
        person_id = self._get_request_person_id()
        # Handle completion status transitions
        if 'completion_status' in validated_data:
            next_status = validated_data.get('completion_status')
            if next_status == DeliverableTaskCompletionStatus.COMPLETE:
                if not person_id:
                    raise serializers.ValidationError({'completionStatus': 'user_not_linked_to_person'})
                try:
                    deliverable = instance.deliverable
                    if not is_current_project_assignee(person_id, deliverable.project_id):
                        raise serializers.ValidationError({'completionStatus': 'user_not_on_project'})
                except serializers.ValidationError:
                    raise
                except Exception:
                    raise serializers.ValidationError({'completionStatus': 'user_not_on_project'})
                instance.completed_by_id = person_id
                instance.completed_at = timezone.now()
            else:
                # Clear completion metadata if status is not complete
                instance.completed_by = None
                instance.completed_at = None
        return super().update(instance, validated_data)

    def validate_sheetName(self, value):
        if value and not re.match(r'^[A-Za-z0-9 ]+$', value):
            raise serializers.ValidationError('sheetName must be alphanumeric')
        return value


class DeliverableTaskSerializer(serializers.ModelSerializer):
    deliverableInfo = serializers.SerializerMethodField()
    templateId = serializers.PrimaryKeyRelatedField(source='template', queryset=DeliverableTask._meta.get_field('template').related_model.objects.all(), allow_null=True, required=False)
    departmentId = serializers.PrimaryKeyRelatedField(source='department', queryset=DeliverableTask._meta.get_field('department').related_model.objects.all())
    departmentName = serializers.CharField(source='department.name', read_only=True)
    sheetNumber = serializers.CharField(source='sheet_number', allow_null=True, allow_blank=True, required=False)
    sheetName = serializers.CharField(source='sheet_name', allow_null=True, allow_blank=True, required=False)
    scopeDescription = serializers.CharField(source='scope_description', allow_blank=True, required=False)
    completionStatus = serializers.ChoiceField(source='completion_status', choices=DeliverableTaskCompletionStatus.choices)
    qaStatus = serializers.ChoiceField(source='qa_status', choices=DeliverableTaskQaStatus.choices)
    qaAssignedTo = serializers.PrimaryKeyRelatedField(source='qa_assigned_to', queryset=DeliverableTask._meta.get_field('qa_assigned_to').related_model.objects.all(), allow_null=True, required=False)
    qaAssignedToName = serializers.CharField(source='qa_assigned_to.name', read_only=True)
    assignedTo = serializers.PrimaryKeyRelatedField(source='assigned_to', queryset=DeliverableTask._meta.get_field('assigned_to').related_model.objects.all(), allow_null=True, required=False)
    assignedToName = serializers.CharField(source='assigned_to.name', read_only=True)
    completedBy = serializers.PrimaryKeyRelatedField(source='completed_by', allow_null=True, required=False, read_only=True)
    completedByName = serializers.CharField(source='completed_by.name', read_only=True)
    completedAt = serializers.DateTimeField(source='completed_at', allow_null=True, required=False, read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = DeliverableTask
        fields = [
            'id',
            'deliverable',
            'deliverableInfo',
            'templateId',
            'departmentId',
            'departmentName',
            'sheetNumber',
            'sheetName',
            'scopeDescription',
            'completionStatus',
            'qaStatus',
            'qaAssignedTo',
            'qaAssignedToName',
            'assignedTo',
            'assignedToName',
            'completedBy',
            'completedByName',
            'completedAt',
            'createdAt',
            'updatedAt',
        ]
        extra_kwargs = {
            'deliverable': {'required': True},
        }

    @extend_schema_field(serializers.DictField())
    def get_deliverableInfo(self, obj) -> dict:
        d = obj.deliverable
        return {
            'id': d.id,
            'projectId': d.project_id,
            'description': d.description,
            'date': d.date.isoformat() if d.date else None,
            'percentage': d.percentage,
        }

    def _get_request_person_id(self):
        req = self.context.get('request')
        user = getattr(req, 'user', None) if req else None
        try:
            return getattr(getattr(user, 'profile', None), 'person_id', None)
        except Exception:  # nosec B110
            return None

    def validate(self, attrs):
        deliverable = attrs.get('deliverable') or getattr(self.instance, 'deliverable', None)
        assigned_to = attrs.get('assigned_to', getattr(self.instance, 'assigned_to', None))
        if deliverable and assigned_to:
            if not is_current_project_assignee(assigned_to.id, deliverable.project_id):
                raise serializers.ValidationError({'assignedTo': 'assigned_person_not_on_project'})
        qa_assigned_to = attrs.get('qa_assigned_to', getattr(self.instance, 'qa_assigned_to', None))
        department = attrs.get('department', getattr(self.instance, 'department', None))
        if qa_assigned_to and department:
            qa_dept_id = getattr(qa_assigned_to, 'department_id', None)
            dept_id = getattr(department, 'id', department)
            if qa_dept_id != dept_id:
                raise serializers.ValidationError({'qaAssignedTo': 'qa_assigned_person_not_in_department'})
        return attrs

    def validate_sheetNumber(self, value):
        if value and not re.match(r'^[A-Za-z0-9]+([-.][A-Za-z0-9]+)*$', value):
            raise serializers.ValidationError('sheetNumber must be alphanumeric with optional - or . separators')
        return value


class DeliverableQATaskSerializer(serializers.ModelSerializer):
    deliverableInfo = serializers.SerializerMethodField()
    departmentId = serializers.PrimaryKeyRelatedField(source='department', queryset=DeliverableQATask._meta.get_field('department').related_model.objects.all())
    departmentName = serializers.CharField(source='department.name', read_only=True)
    qaStatus = serializers.ChoiceField(source='qa_status', choices=DeliverableQAReviewStatus.choices)
    qaAssignedTo = serializers.PrimaryKeyRelatedField(source='qa_assigned_to', queryset=DeliverableQATask._meta.get_field('qa_assigned_to').related_model.objects.all(), allow_null=True, required=False)
    qaAssignedToName = serializers.CharField(source='qa_assigned_to.name', read_only=True)
    reviewedAt = serializers.DateTimeField(source='reviewed_at', allow_null=True, required=False, read_only=True)
    dueDate = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = DeliverableQATask
        fields = [
            'id',
            'deliverable',
            'deliverableInfo',
            'departmentId',
            'departmentName',
            'qaStatus',
            'qaAssignedTo',
            'qaAssignedToName',
            'reviewedAt',
            'dueDate',
            'createdAt',
            'updatedAt',
        ]
        extra_kwargs = {
            'deliverable': {'required': True},
        }

    @extend_schema_field(serializers.DictField())
    def get_deliverableInfo(self, obj) -> dict:
        d = obj.deliverable
        return {
            'id': d.id,
            'projectId': d.project_id,
            'description': d.description,
            'date': d.date.isoformat() if d.date else None,
            'percentage': d.percentage,
        }

    def get_dueDate(self, obj):
        d = getattr(obj.deliverable, 'date', None)
        if not d:
            return None
        try:
            settings = QATaskSettings.get_active()
            days = int(settings.default_days_before)
        except Exception:  # nosec B110
            days = 7
        return (d - timedelta(days=days)).isoformat()

    def validate(self, attrs):
        department = attrs.get('department', getattr(self.instance, 'department', None))
        qa_assigned_to = attrs.get('qa_assigned_to', getattr(self.instance, 'qa_assigned_to', None))
        if qa_assigned_to and department:
            qa_dept_id = getattr(qa_assigned_to, 'department_id', None)
            dept_id = getattr(department, 'id', department)
            if qa_dept_id != dept_id:
                raise serializers.ValidationError({'qaAssignedTo': 'qa_assigned_person_not_in_department'})
        return attrs

    def update(self, instance, validated_data):
        new_status = validated_data.get('qa_status', instance.qa_status)
        prev_status = instance.qa_status
        if new_status != prev_status:
            if new_status == DeliverableQAReviewStatus.REVIEWED:
                validated_data['reviewed_at'] = timezone.now()
            else:
                validated_data['reviewed_at'] = None
            try:
                req = self.context.get('request')
                user = getattr(req, 'user', None) if req else None
                DeliverableQATaskEdit.objects.create(
                    qa_task=instance,
                    actor=user if getattr(user, 'is_authenticated', False) else None,
                    action='reviewed' if new_status == DeliverableQAReviewStatus.REVIEWED else 'unreviewed',
                    changes={'qaStatus': {'from': prev_status, 'to': new_status}},
                )
            except Exception:  # nosec B110
                pass
        return super().update(instance, validated_data)

    def create(self, validated_data):
        if validated_data.get('qa_status') == DeliverableQAReviewStatus.REVIEWED:
            validated_data['reviewed_at'] = timezone.now()
        return super().create(validated_data)
