from core.serializers import AutoMappedSerializer
from core.fields import PROJECT_FIELDS
from .models import Project

class ProjectSerializer(AutoMappedSerializer):
    class Meta:
        model = Project
        field_registry = PROJECT_FIELDS
        fields = [field.api_name for field in PROJECT_FIELDS.values()] + ['id', 'createdAt', 'updatedAt']
        extra_kwargs = {
            'createdAt': {'source': 'created_at', 'read_only': True},
            'updatedAt': {'source': 'updated_at', 'read_only': True},
        }