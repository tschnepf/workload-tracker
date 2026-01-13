"""
Deliverable serializers - STANDARDS COMPLIANT
Follows R2-REBUILD-STANDARDS.md: snake_case -> camelCase transformation
"""

from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Deliverable, DeliverableAssignment, PreDeliverableItem
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
