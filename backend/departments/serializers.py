from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import Department
from verticals.models import Vertical

class DepartmentSerializer(serializers.ModelSerializer):
    """Department serializer with explicit camelCase field mapping"""
    parentDepartment = serializers.PrimaryKeyRelatedField(
        source='parent_department', 
        queryset=Department.objects.all(), 
        required=False, 
        allow_null=True
    )
    vertical = serializers.PrimaryKeyRelatedField(
        queryset=Vertical.objects.all(),
        required=False,
        allow_null=True,
    )
    verticalName = serializers.CharField(source='vertical.name', read_only=True)
    shortName = serializers.CharField(source='short_name', required=False, allow_blank=True)
    managerName = serializers.CharField(source='manager.name', read_only=True)
    isActive = serializers.BooleanField(source='is_active')
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = Department
        fields = [
            'id', 
            'name', 
            'shortName',
            'parentDepartment',    
            'vertical',
            'verticalName',
            'manager',
            'managerName',         
            'description',
            'isActive',           
            'createdAt',          
            'updatedAt',          
        ]

    def validate(self, data):
        """Custom validation to prevent circular department hierarchies"""
        parent_department = data.get('parent_department')
        instance = getattr(self, 'instance', None)
        vertical = data.get('vertical')

        if parent_department:
            # Create a temporary instance to test the validation
            temp_instance = Department(
                id=getattr(instance, 'id', None),
                name=data.get('name', getattr(instance, 'name', None)),
                parent_department=parent_department,
                vertical=vertical if vertical is not None else getattr(instance, 'vertical', None),
            )

            try:
                temp_instance.clean()
            except DjangoValidationError as e:
                # Convert Django ValidationError to DRF ValidationError
                raise serializers.ValidationError({
                    'parentDepartment': e.messages
                })

        return data
