from core.serializers import AutoMappedSerializer
from core.fields import DEPARTMENT_FIELDS
from .models import Department

class DepartmentSerializer(AutoMappedSerializer):
    class Meta:
        model = Department
        field_registry = DEPARTMENT_FIELDS
        fields = [field.api_name for field in DEPARTMENT_FIELDS.values()] + ['id', 'createdAt', 'updatedAt']
        extra_kwargs = {
            'createdAt': {'source': 'created_at', 'read_only': True},
            'updatedAt': {'source': 'updated_at', 'read_only': True},
        }