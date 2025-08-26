"""
Automatic validation to catch naming mismatches.
Run this before every commit to ensure consistency.
"""

from .fields import PERSON_FIELDS, PROJECT_FIELDS, ASSIGNMENT_FIELDS, DEPARTMENT_FIELDS

def validate_naming_consistency():
    """Check that all field mappings are consistent"""
    errors = []
    
    try:
        # Import models dynamically to avoid circular imports
        from people.models import Person
        from projects.models import Project  
        from assignments.models import Assignment
        from departments.models import Department
        
        # Validate Person model
        errors.extend(_validate_model_fields(Person, PERSON_FIELDS, 'Person'))
        
        # Validate Project model
        errors.extend(_validate_model_fields(Project, PROJECT_FIELDS, 'Project'))
        
        # Validate Assignment model
        errors.extend(_validate_model_fields(Assignment, ASSIGNMENT_FIELDS, 'Assignment'))
        
        # Validate Department model
        errors.extend(_validate_model_fields(Department, DEPARTMENT_FIELDS, 'Department'))
        
    except ImportError as e:
        errors.append(f"Could not import models: {e}")
    
    return errors

def _validate_model_fields(model_class, field_registry, model_name):
    """Validate that model fields match registry"""
    errors = []
    
    # Get actual model fields (exclude auto-generated ones)
    model_fields = [f.name for f in model_class._meta.fields 
                   if f.name not in ['id', 'created_at', 'updated_at']]
    
    # Get registry fields
    registry_fields = [f.python_name for f in field_registry.values()]
    
    # Check for fields in model but not in registry
    missing_in_registry = set(model_fields) - set(registry_fields)
    if missing_in_registry:
        errors.append(f"{model_name} fields in model but not registry: {missing_in_registry}")
    
    # Check for fields in registry but not in model  
    missing_in_model = set(registry_fields) - set(model_fields)
    if missing_in_model:
        errors.append(f"{model_name} fields in registry but not model: {missing_in_model}")
    
    return errors

def validate_serializer_mappings():
    """Validate that serializers map fields correctly"""
    errors = []
    
    try:
        from people.serializers import PersonSerializer
        from projects.serializers import ProjectSerializer
        from assignments.serializers import AssignmentSerializer
        from departments.serializers import DepartmentSerializer
        
        # Check each serializer
        errors.extend(_validate_serializer(PersonSerializer, PERSON_FIELDS, 'PersonSerializer'))
        errors.extend(_validate_serializer(ProjectSerializer, PROJECT_FIELDS, 'ProjectSerializer'))  
        errors.extend(_validate_serializer(AssignmentSerializer, ASSIGNMENT_FIELDS, 'AssignmentSerializer'))
        errors.extend(_validate_serializer(DepartmentSerializer, DEPARTMENT_FIELDS, 'DepartmentSerializer'))
        
    except ImportError as e:
        errors.append(f"Could not import serializers: {e}")
    
    return errors

def _validate_serializer(serializer_class, field_registry, serializer_name):
    """Validate that serializer maps fields correctly"""
    errors = []
    
    try:
        serializer = serializer_class()
        
        for field_name, field_def in field_registry.items():
            if field_def.api_name in serializer.fields:
                serializer_field = serializer.fields[field_def.api_name]
                if hasattr(serializer_field, 'source'):
                    expected_source = field_def.python_name
                    actual_source = serializer_field.source
                    if actual_source != expected_source:
                        errors.append(f"{serializer_name}.{field_def.api_name} maps to '{actual_source}', expected '{expected_source}'")
            else:
                errors.append(f"{serializer_name} missing field: {field_def.api_name}")
                
    except Exception as e:
        errors.append(f"Error validating {serializer_name}: {e}")
    
    return errors