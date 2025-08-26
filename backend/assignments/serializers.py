from core.serializers import AutoMappedSerializer
from core.fields import ASSIGNMENT_FIELDS
from .models import Assignment

class AssignmentSerializer(AutoMappedSerializer):
    class Meta:
        model = Assignment
        field_registry = ASSIGNMENT_FIELDS
        fields = [field.api_name for field in ASSIGNMENT_FIELDS.values()] + ['id', 'person', 'project', 'createdAt', 'updatedAt']
        extra_kwargs = {
            'createdAt': {'source': 'created_at', 'read_only': True},
            'updatedAt': {'source': 'updated_at', 'read_only': True},
        }