from rest_framework import serializers
from .models import Project

class ProjectSerializer(serializers.ModelSerializer):
    projectNumber = serializers.CharField(source='project_number', required=False, allow_null=True, allow_blank=True)
    startDate = serializers.DateField(source='start_date', required=False, allow_null=True)
    endDate = serializers.DateField(source='end_date', required=False, allow_null=True) 
    estimatedHours = serializers.IntegerField(source='estimated_hours', required=False, allow_null=True)
    isActive = serializers.BooleanField(source='is_active', default=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'status', 'client', 'description', 'projectNumber', 
                 'startDate', 'endDate', 'estimatedHours', 'isActive', 'createdAt', 'updatedAt']
        read_only_fields = ['id', 'createdAt', 'updatedAt']