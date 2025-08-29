from rest_framework import serializers
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