"""
Auto-mapped serializers that prevent naming mismatches.
NEVER write manual field mappings - always use these base classes.
"""

from rest_framework import serializers
from .fields import PERSON_FIELDS, PROJECT_FIELDS, ASSIGNMENT_FIELDS, DEPARTMENT_FIELDS


class PreDeliverableGlobalSettingsItemSerializer(serializers.Serializer):
    typeId = serializers.IntegerField()
    typeName = serializers.CharField()
    defaultDaysBefore = serializers.IntegerField()
    isEnabledByDefault = serializers.BooleanField()
    sortOrder = serializers.IntegerField(required=False)
    isActive = serializers.BooleanField(required=False)


class PreDeliverableGlobalSettingsUpdateSerializer(serializers.Serializer):
    typeId = serializers.IntegerField()
    defaultDaysBefore = serializers.IntegerField(min_value=0)
    isEnabledByDefault = serializers.BooleanField()

class AutoMappedSerializer(serializers.ModelSerializer):
    """Base class that auto-maps field names from registry"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        # Get field registry from Meta
        field_registry = getattr(self.Meta, 'field_registry', {})
        
        # Auto-generate field mappings
        for field_name, field_def in field_registry.items():
            if hasattr(self.Meta.model, field_def.python_name):
                # Create serializer field with correct source mapping
                field_class = self._get_field_class(field_def)
                self.fields[field_def.api_name] = field_class
    
    def _get_field_class(self, field_def):
        """Get appropriate serializer field class"""
        field_kwargs = {'source': field_def.python_name}
        
        # Set required based on field definition
        if field_def.required:
            field_kwargs['required'] = True
        else:
            field_kwargs['required'] = False
            field_kwargs['allow_blank'] = True
        
        # Handle null fields
        if not field_def.required:
            field_kwargs['allow_null'] = True
        
        # Map field types to serializer fields
        field_mapping = {
            'string': serializers.CharField,
            'integer': serializers.IntegerField,
            'boolean': serializers.BooleanField,
            'date': serializers.DateField,
            'text': serializers.CharField,
        }
        
        field_class = field_mapping[field_def.field_type]
        return field_class(**field_kwargs)
