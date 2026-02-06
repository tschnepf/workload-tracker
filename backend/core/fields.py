"""
CRITICAL: Single source of truth for all field names.
This prevents snake_case/camelCase mismatches by auto-generating all mappings.
"""

from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class FieldDefinition:
    """Single source of truth for field names"""
    python_name: str      # Snake case for Python/Django
    api_name: str         # Camel case for API/Frontend
    sql_name: str         # Snake case for database
    display_name: str     # Human readable
    field_type: str       # Data type
    required: bool = False # Whether field is required

# MASTER REGISTRY - All Person fields defined once
PERSON_FIELDS = {
    'name': FieldDefinition(
        python_name='name',
        api_name='name', 
        sql_name='name',
        display_name='Name',
        field_type='string',
        required=True
    ),
    'weekly_capacity': FieldDefinition(
        python_name='weekly_capacity',
        api_name='weeklyCapacity',
        sql_name='weekly_capacity', 
        display_name='Weekly Capacity',
        field_type='integer'
    ),
    'role': FieldDefinition(
        python_name='role',
        api_name='role',
        sql_name='role',
        display_name='Role', 
        field_type='string'
    ),
    'email': FieldDefinition(
        python_name='email',
        api_name='email',
        sql_name='email',
        display_name='Email',
        field_type='string'
    ),
    'phone': FieldDefinition(
        python_name='phone',
        api_name='phone',
        sql_name='phone',
        display_name='Phone',
        field_type='string'
    ),
    'location': FieldDefinition(
        python_name='location',
        api_name='location',
        sql_name='location',
        display_name='Location',
        field_type='string'
    ),
    'hire_date': FieldDefinition(
        python_name='hire_date',
        api_name='hireDate',
        sql_name='hire_date',
        display_name='Hire Date',
        field_type='date'
    ),
    'notes': FieldDefinition(
        python_name='notes',
        api_name='notes',
        sql_name='notes',
        display_name='Notes',
        field_type='text'
    ),
    'is_active': FieldDefinition(
        python_name='is_active',
        api_name='isActive',
        sql_name='is_active',
        display_name='Active',
        field_type='boolean'
    ),
}

# MASTER REGISTRY - All Project fields defined once  
PROJECT_FIELDS = {
    'name': FieldDefinition(
        python_name='name',
        api_name='name',
        sql_name='name',
        display_name='Name',
        field_type='string',
        required=True
    ),
    'status': FieldDefinition(
        python_name='status',
        api_name='status',
        sql_name='status',
        display_name='Status',
        field_type='string'
    ),
    'client': FieldDefinition(
        python_name='client',
        api_name='client',
        sql_name='client',
        display_name='Client',
        field_type='string'
    ),
    'description': FieldDefinition(
        python_name='description',
        api_name='description',
        sql_name='description',
        display_name='Description',
        field_type='text'
    ),
    'start_date': FieldDefinition(
        python_name='start_date',
        api_name='startDate',
        sql_name='start_date',
        display_name='Start Date',
        field_type='date'
    ),
    'end_date': FieldDefinition(
        python_name='end_date',
        api_name='endDate',
        sql_name='end_date',
        display_name='End Date',
        field_type='date'
    ),
    'estimated_hours': FieldDefinition(
        python_name='estimated_hours',
        api_name='estimatedHours',
        sql_name='estimated_hours',
        display_name='Estimated Hours',
        field_type='integer'
    ),
    'project_number': FieldDefinition(
        python_name='project_number',
        api_name='projectNumber',
        sql_name='project_number',
        display_name='Project Number',
        field_type='string'
    ),
    'vertical': FieldDefinition(
        python_name='vertical',
        api_name='vertical',
        sql_name='vertical_id',
        display_name='Vertical',
        field_type='integer'
    ),
    'is_active': FieldDefinition(
        python_name='is_active',
        api_name='isActive',
        sql_name='is_active',
        display_name='Active',
        field_type='boolean'
    ),
}

# MASTER REGISTRY - All Assignment fields defined once
ASSIGNMENT_FIELDS = {
    'allocation_percentage': FieldDefinition(
        python_name='allocation_percentage',
        api_name='allocationPercentage',
        sql_name='allocation_percentage',
        display_name='Allocation %',
        field_type='integer'
    ),
    'project_name': FieldDefinition(
        python_name='project_name',
        api_name='projectName', 
        sql_name='project_name',
        display_name='Project Name',
        field_type='string'
    ),
    'role_on_project': FieldDefinition(
        python_name='role_on_project',
        api_name='roleOnProject',
        sql_name='role_on_project',
        display_name='Project Role',
        field_type='string'
    ),
    'start_date': FieldDefinition(
        python_name='start_date',
        api_name='startDate',
        sql_name='start_date',
        display_name='Start Date',
        field_type='date'
    ),
    'end_date': FieldDefinition(
        python_name='end_date',
        api_name='endDate',
        sql_name='end_date',
        display_name='End Date',
        field_type='date'
    ),
    'notes': FieldDefinition(
        python_name='notes',
        api_name='notes',
        sql_name='notes',
        display_name='Notes',
        field_type='text'
    ),
    'is_active': FieldDefinition(
        python_name='is_active',
        api_name='isActive',
        sql_name='is_active',
        display_name='Active',
        field_type='boolean'
    ),
}

# MASTER REGISTRY - All Department fields defined once
DEPARTMENT_FIELDS = {
    'name': FieldDefinition(
        python_name='name',
        api_name='name',
        sql_name='name',
        display_name='Name',
        field_type='string',
        required=True
    ),
    'parent_department': FieldDefinition(
        python_name='parent_department',
        api_name='parentDepartment',
        sql_name='parent_department_id',
        display_name='Parent Department',
        field_type='integer'
    ),
    'manager': FieldDefinition(
        python_name='manager',
        api_name='manager',
        sql_name='manager_id',
        display_name='Manager',
        field_type='integer'
    ),
    'description': FieldDefinition(
        python_name='description',
        api_name='description',
        sql_name='description',
        display_name='Description',
        field_type='text'
    ),
    'vertical': FieldDefinition(
        python_name='vertical',
        api_name='vertical',
        sql_name='vertical_id',
        display_name='Vertical',
        field_type='integer'
    ),
    'is_active': FieldDefinition(
        python_name='is_active',
        api_name='isActive',
        sql_name='is_active',
        display_name='Active',
        field_type='boolean'
    ),
}

# COMBINED REGISTRY - All fields from all models
ALL_FIELD_DEFINITIONS = {}

# Add prefixes to avoid conflicts
for field_name, field_def in PERSON_FIELDS.items():
    ALL_FIELD_DEFINITIONS[f'person.{field_name}'] = field_def

for field_name, field_def in PROJECT_FIELDS.items():
    ALL_FIELD_DEFINITIONS[f'project.{field_name}'] = field_def

for field_name, field_def in ASSIGNMENT_FIELDS.items():
    ALL_FIELD_DEFINITIONS[f'assignment.{field_name}'] = field_def

for field_name, field_def in DEPARTMENT_FIELDS.items():
    ALL_FIELD_DEFINITIONS[f'department.{field_name}'] = field_def

# Auto-generate mappings
def get_api_mapping(model_fields: Dict[str, FieldDefinition]) -> Dict[str, str]:
    """Generate serializer field mapping automatically"""
    return {field.api_name: field.python_name for field in model_fields.values()}

def get_typescript_interface(model_name: str, model_fields: Dict[str, FieldDefinition]) -> str:
    """Generate TypeScript interface automatically"""
    fields = []
    for field_def in model_fields.values():
        ts_type = {
            'string': 'string',
            'integer': 'number', 
            'boolean': 'boolean',
            'date': 'string',
            'text': 'string'
        }[field_def.field_type]
        
        optional = '' if field_def.required else '?'
        fields.append(f"  {field_def.api_name}{optional}: {ts_type};")
    
    return f"interface {model_name} {{\n  id: number;\n" + "\n".join(fields) + "\n  createdAt: string;\n  updatedAt: string;\n}"
