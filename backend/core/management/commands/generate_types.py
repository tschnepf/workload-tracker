"""
Generate TypeScript interfaces from Django field registry.
This ensures frontend types always match backend API.
"""

from django.core.management.base import BaseCommand
from core.fields import PERSON_FIELDS, PROJECT_FIELDS, ASSIGNMENT_FIELDS, DEPARTMENT_FIELDS, get_typescript_interface
import os

class Command(BaseCommand):
    help = 'Generate TypeScript interfaces from field registry'

    def handle(self, *args, **options):
        # Generate TypeScript file content
        ts_content = f'''// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from Django field registry on {self._get_timestamp()}
// This file ensures frontend types always match backend API

{get_typescript_interface('Person', PERSON_FIELDS)}

{get_typescript_interface('Project', PROJECT_FIELDS)}

{get_typescript_interface('Assignment', ASSIGNMENT_FIELDS)}

{get_typescript_interface('Department', DEPARTMENT_FIELDS)}

// API Response types
export interface PersonListResponse {{
  results: Person[];
  count: number;
  next?: string;
  previous?: string;
}}

export interface ProjectListResponse {{
  results: Project[];
  count: number;
  next?: string;
  previous?: string;
}}

export interface AssignmentListResponse {{
  results: Assignment[];
  count: number;
  next?: string;
  previous?: string;
}}

export interface DepartmentListResponse {{
  results: Department[];
  count: number;
  next?: string;
  previous?: string;
}}

// Create/Update request types (exclude auto-generated fields)
export type PersonCreateRequest = Omit<Person, 'id' | 'createdAt' | 'updatedAt'>;
export type PersonUpdateRequest = Partial<PersonCreateRequest>;

export type ProjectCreateRequest = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
export type ProjectUpdateRequest = Partial<ProjectCreateRequest>;

export type AssignmentCreateRequest = Omit<Assignment, 'id' | 'createdAt' | 'updatedAt'> & {{
  person: number;  // Foreign key as ID
  project?: number;  // Optional foreign key
}};
export type AssignmentUpdateRequest = Partial<AssignmentCreateRequest>;

export type DepartmentCreateRequest = Omit<Department, 'id' | 'createdAt' | 'updatedAt'>;
export type DepartmentUpdateRequest = Partial<DepartmentCreateRequest>;
'''
        
        # Ensure frontend directory exists
        frontend_types_path = self._get_types_path()
        os.makedirs(os.path.dirname(frontend_types_path), exist_ok=True)
        
        # Write TypeScript file
        with open(frontend_types_path, 'w') as f:
            f.write(ts_content)
            
        self.stdout.write(
            self.style.SUCCESS(f'✅ TypeScript interfaces generated: {{frontend_types_path}}')
        )
        
        # Also generate field mapping reference for debugging
        debug_content = f'''// DEBUG: Field mapping reference
// This shows how Django fields map to API fields

Person field mappings:
{self._generate_field_mapping_debug(PERSON_FIELDS)}

Project field mappings:
{self._generate_field_mapping_debug(PROJECT_FIELDS)}

Assignment field mappings:
{self._generate_field_mapping_debug(ASSIGNMENT_FIELDS)}

Department field mappings:
{self._generate_field_mapping_debug(DEPARTMENT_FIELDS)}
'''
        
        debug_path = os.path.join(os.path.dirname(frontend_types_path), 'field-mappings.debug.txt')
        with open(debug_path, 'w') as f:
            f.write(debug_content)
            
        self.stdout.write(
            self.style.SUCCESS(f'✅ Field mapping debug info: {{debug_path}}')
        )
    
    def _get_types_path(self):
        """Get the path for generated TypeScript file"""
        # Look for frontend directory relative to Django project
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        frontend_path = os.path.join(base_dir, 'frontend', 'src', 'types', 'generated.ts')
        return frontend_path
    
    def _get_timestamp(self):
        """Get current timestamp for file header"""
        from datetime import datetime
        return datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')
    
    def _generate_field_mapping_debug(self, field_registry):
        """Generate debug info for field mappings"""
        lines = []
        for field_name, field_def in field_registry.items():
            lines.append(f"  {field_def.python_name} (Django) → {field_def.api_name} (API/Frontend)")
        return "\\n".join(lines)