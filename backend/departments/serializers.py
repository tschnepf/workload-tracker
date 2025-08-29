from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import Department

class DepartmentSerializer(serializers.ModelSerializer):
    """Department serializer with explicit camelCase field mapping"""
    parentDepartment = serializers.PrimaryKeyRelatedField(
        source='parent_department', 
        queryset=Department.objects.all(), 
        required=False, 
        allow_null=True
    )
    managerName = serializers.CharField(source='manager.name', read_only=True)
    isActive = serializers.BooleanField(source='is_active')
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = Department
        fields = [
            'id', 
            'name', 
            'parentDepartment',    
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
        
        if parent_department and instance:
            # Create a temporary instance to test the validation
            temp_instance = Department(
                id=instance.id,
                name=data.get('name', instance.name),
                parent_department=parent_department
            )
            
            try:
                temp_instance.clean()
            except DjangoValidationError as e:
                # Convert Django ValidationError to DRF ValidationError
                raise serializers.ValidationError({
                    'parentDepartment': e.messages
                })
        
        return data