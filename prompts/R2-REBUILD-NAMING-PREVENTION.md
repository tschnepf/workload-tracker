# R2-REBUILD-NAMING-PREVENTION: Bulletproof Naming Strategy

## 🚨 CRITICAL: Preventing snake_case/camelCase Disasters

**This document prevents the naming mismatches that can destroy a project. Follow religiously.**

## 🎯 The Problem

### **What Goes Wrong:**
```python
# Backend defines:
class Person(models.Model):
    weekly_capacity = models.IntegerField()  # snake_case
    
# Serializer maps inconsistently:
class PersonSerializer(serializers.ModelSerializer):
    weeklyCapacity = serializers.IntegerField(source='weekly_capacity')  # ✅ Correct
    weeklyHours = serializers.IntegerField(source='weekly_capacity')     # ❌ WRONG - Different name!
    
# Frontend uses wrong name:
interface Person {
    weeklyCapacity: number;  // ✅ Matches serializer
    weeklyHours: number;     // ❌ WRONG - Doesn't exist in API response!
}

# Result: Runtime errors, API failures, data mismatches
```

### **Why This Happens:**
- Manual field mapping in serializers
- Copy/paste errors between files
- Inconsistent naming decisions over time
- No single source of truth for field names
- Different developers using different conventions

## 🛡️ The Solution: Automated Naming System

### **Strategy 1: Single Source of Truth**

**Create a master field registry that generates all naming automatically:**

```python
# backend/core/fields.py - MASTER FIELD REGISTRY
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
    
# MASTER REGISTRY - All fields defined once
PERSON_FIELDS = {
    'weekly_capacity': FieldDefinition(
        python_name='weekly_capacity',
        api_name='weeklyCapacity', 
        sql_name='weekly_capacity',
        display_name='Weekly Capacity',
        field_type='integer'
    ),
    'first_name': FieldDefinition(
        python_name='first_name',
        api_name='firstName',
        sql_name='first_name', 
        display_name='First Name',
        field_type='string'
    ),
    'is_active': FieldDefinition(
        python_name='is_active',
        api_name='isActive',
        sql_name='is_active',
        display_name='Active',
        field_type='boolean'
    ),
    # ... all other fields
}

ASSIGNMENT_FIELDS = {
    'allocation_percentage': FieldDefinition(
        python_name='allocation_percentage',
        api_name='allocationPercentage',
        sql_name='allocation_percentage',
        display_name='Allocation %',
        field_type='integer'
    ),
    'role_on_project': FieldDefinition(
        python_name='role_on_project', 
        api_name='roleOnProject',
        sql_name='role_on_project',
        display_name='Project Role',
        field_type='string'
    ),
    # ... all other fields
}

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
            'date': 'string'
        }[field_def.field_type]
        
        fields.append(f"  {field_def.api_name}: {ts_type};")
    
    return f"interface {model_name} {{\n" + "\n".join(fields) + "\n}"
```

### **Strategy 2: Generated Serializers**

**Never write serializers manually - generate them:**

```python
# backend/core/serializers.py - AUTO-GENERATED SERIALIZERS
from rest_framework import serializers
from .fields import PERSON_FIELDS, ASSIGNMENT_FIELDS, get_api_mapping

class AutoMappedSerializer(serializers.ModelSerializer):
    """Base class that auto-maps field names"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Auto-generate field mappings from registry
        field_registry = getattr(self.Meta, 'field_registry', {})
        
        for api_name, field_def in field_registry.items():
            if hasattr(self.Meta.model, field_def.python_name):
                # Create serializer field with correct source mapping
                field_class = self._get_field_class(field_def.field_type)
                self.fields[field_def.api_name] = field_class(source=field_def.python_name)
    
    def _get_field_class(self, field_type: str):
        mapping = {
            'string': serializers.CharField,
            'integer': serializers.IntegerField,
            'boolean': serializers.BooleanField,
            'date': serializers.DateField,
        }
        return mapping[field_type]()

# Generated Person serializer
class PersonSerializer(AutoMappedSerializer):
    class Meta:
        model = Person
        field_registry = PERSON_FIELDS
        fields = [field.api_name for field in PERSON_FIELDS.values()]

# Generated Assignment serializer  
class AssignmentSerializer(AutoMappedSerializer):
    class Meta:
        model = Assignment
        field_registry = ASSIGNMENT_FIELDS
        fields = [field.api_name for field in ASSIGNMENT_FIELDS.values()]
        
# Result: Zero manual field mapping, zero naming errors
```

### **Strategy 3: Generated TypeScript Interfaces**

**Auto-generate frontend types from the same registry:**

```python
# backend/management/commands/generate_types.py
from django.core.management.base import BaseCommand
from core.fields import PERSON_FIELDS, ASSIGNMENT_FIELDS, get_typescript_interface
import os

class Command(BaseCommand):
    help = 'Generate TypeScript interfaces from field registry'

    def handle(self, *args, **options):
        # Generate TypeScript file
        ts_content = f"""
// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from Django field registry

{get_typescript_interface('Person', PERSON_FIELDS)}

{get_typescript_interface('Assignment', ASSIGNMENT_FIELDS)}

// API Response types
export interface PersonListResponse {{
  results: Person[];
  count: number;
}}

export interface AssignmentListResponse {{
  results: Assignment[];  
  count: number;
}}
"""
        
        # Write to frontend
        frontend_types_path = os.path.join('frontend', 'src', 'types', 'generated.ts')
        with open(frontend_types_path, 'w') as f:
            f.write(ts_content)
            
        self.stdout.write('✅ TypeScript interfaces generated successfully')

# Run with: python manage.py generate_types
```

### **Strategy 4: Validation System**

**Catch mismatches automatically:**

```python
# backend/core/validation.py - AUTOMATIC VALIDATION
def validate_naming_consistency():
    """Check that all field mappings are consistent"""
    errors = []
    
    # Check Person model
    person_model_fields = [f.name for f in Person._meta.fields]
    person_registry_fields = [f.python_name for f in PERSON_FIELDS.values()]
    
    missing_in_registry = set(person_model_fields) - set(person_registry_fields)
    missing_in_model = set(person_registry_fields) - set(person_model_fields)
    
    if missing_in_registry:
        errors.append(f"Person fields in model but not registry: {missing_in_registry}")
    if missing_in_model:
        errors.append(f"Person fields in registry but not model: {missing_in_model}")
    
    # Check serializer field mappings
    serializer = PersonSerializer()
    for api_name, field in serializer.fields.items():
        if hasattr(field, 'source'):
            expected_source = PERSON_FIELDS[api_name].python_name
            if field.source != expected_source:
                errors.append(f"PersonSerializer.{api_name} maps to {field.source}, expected {expected_source}")
    
    return errors

# Run validation in tests
class NamingConsistencyTest(TestCase):
    def test_person_naming_consistency(self):
        errors = validate_naming_consistency()
        self.assertEqual([], errors, f"Naming inconsistencies found: {errors}")
```

### **Strategy 5: Development Workflow Integration**

**Make it impossible to create naming mismatches:**

```bash
# Makefile - Add validation to development workflow
.PHONY: validate-naming
validate-naming:
	@echo "🔍 Checking naming consistency..."
	@python manage.py shell -c "from core.validation import validate_naming_consistency; errors = validate_naming_consistency(); print('✅ All names consistent' if not errors else f'❌ Errors: {errors}')"

.PHONY: generate-types
generate-types:
	@echo "📝 Generating TypeScript interfaces..."
	@python manage.py generate_types
	@echo "✅ Types generated"

.PHONY: dev-setup
dev-setup: validate-naming generate-types
	@echo "🚀 Development setup complete"

# Pre-commit hook
#!/bin/bash
# .git/hooks/pre-commit
echo "Running naming validation..."
make validate-naming
if [ $? -ne 0 ]; then
    echo "❌ Naming validation failed. Commit blocked."
    exit 1
fi

make generate-types
git add frontend/src/types/generated.ts
echo "✅ Pre-commit checks passed"
```

## 🔒 Implementation in Chunks

### **Chunk 1: Foundation + Naming System**
```python
# Add to Chunk 1 implementation
1. Create field registry (PERSON_FIELDS, ASSIGNMENT_FIELDS)
2. Create AutoMappedSerializer base class  
3. Create validation system
4. Create TypeScript generation command
5. Add naming validation to tests
6. Set up pre-commit hooks
```

### **Chunk 2: Person CRUD with Generated Names**
```python
# Use generated serializer - zero manual mapping
class PersonSerializer(AutoMappedSerializer):
    class Meta:
        model = Person
        field_registry = PERSON_FIELDS
        fields = '__auto__'  # Uses registry automatically

# Frontend uses generated types
import { Person } from '@/types/generated';  // Auto-generated interface

const createPerson = (person: Omit<Person, 'id'>) => {
    return api.post('/api/people/', person);  // Names guaranteed to match
};
```

### **Chunk 3+: All Subsequent Chunks**
```python
# Every new model follows same pattern:
1. Define fields in registry first
2. Generate serializer automatically  
3. Generate TypeScript interface automatically
4. Run validation tests
5. Zero manual field mapping anywhere
```

## 🚧 Specific Prevention Rules

### **NEVER Do This:**
```python
# ❌ Manual serializer field mapping
class PersonSerializer(serializers.ModelSerializer):
    firstName = serializers.CharField(source='first_name')  # Manual mapping = error prone
    weeklyCapacity = serializers.IntegerField(source='weekly_capacity')  # Copy/paste errors
    
# ❌ Hardcoded frontend interfaces  
interface Person {
    firstName: string;      // Might not match API
    weeklyCapacity: number; // Might be named differently
}

# ❌ Different naming in different files
# models.py: weekly_capacity
# serializers.py: weeklyCapacity -> weekly_capacity  
# frontend: weeklyHours (WRONG!)
```

### **ALWAYS Do This:**
```python
# ✅ Registry-driven development
1. Define field in registry first
2. Generate all mappings automatically
3. Run validation before committing
4. Use generated TypeScript interfaces
5. Never write manual field mappings

# ✅ Generated serializer
class PersonSerializer(AutoMappedSerializer):
    class Meta:
        model = Person
        field_registry = PERSON_FIELDS  # Single source of truth
        
# ✅ Generated TypeScript
import { Person } from '@/types/generated';  // Guaranteed to match API
```

## 🧪 Testing Strategy

### **Comprehensive Naming Tests:**
```python
# tests/test_naming.py - RUN IN EVERY CHUNK
class NamingConsistencyTests(TestCase):
    def test_person_serializer_mapping(self):
        """Test that PersonSerializer maps all fields correctly"""
        serializer = PersonSerializer()
        
        for api_name, field_def in PERSON_FIELDS.items():
            self.assertIn(api_name, serializer.fields)
            self.assertEqual(serializer.fields[api_name].source, field_def.python_name)
    
    def test_person_api_response_structure(self):
        """Test that API returns correct field names"""
        person = Person.objects.create(name="Test", weekly_capacity=40)
        response = self.client.get(f'/api/people/{person.id}/')
        
        for field_def in PERSON_FIELDS.values():
            self.assertIn(field_def.api_name, response.data)
    
    def test_no_orphaned_fields(self):
        """Test that all model fields are in registry"""
        model_fields = [f.name for f in Person._meta.fields]
        registry_fields = [f.python_name for f in PERSON_FIELDS.values()]
        
        orphaned = set(model_fields) - set(registry_fields) - {'id', 'created_at', 'updated_at'}
        self.assertEqual(set(), orphaned, f"Fields not in registry: {orphaned}")
    
    def test_typescript_generation(self):
        """Test that TypeScript generation works"""
        ts_interface = get_typescript_interface('Person', PERSON_FIELDS)
        
        for field_def in PERSON_FIELDS.values():
            self.assertIn(field_def.api_name, ts_interface)
```

## 📋 Naming Prevention Checklist

### **Before Starting Any Chunk:**
```bash
✅ All new fields added to field registry first
✅ No manual serializer field mappings planned
✅ TypeScript generation set up
✅ Naming validation tests written
✅ Pre-commit hooks configured
```

### **During Each Chunk:**
```bash
✅ All serializers use AutoMappedSerializer
✅ All frontend interfaces use generated types
✅ No hardcoded field names anywhere
✅ Validation tests pass
✅ Generated TypeScript is up to date
```

### **Before Completing Any Chunk:**
```bash
✅ Run `make validate-naming` (must pass)
✅ Run `make generate-types` (must generate clean types)  
✅ All tests pass including naming consistency tests
✅ No manual field mappings in code review
✅ Frontend uses only generated type imports
```

## 🎯 Success Metrics

### **Zero Tolerance:**
- **Manual field mappings**: 0 allowed
- **Hardcoded field names**: 0 allowed  
- **Naming validation errors**: 0 allowed
- **Type generation failures**: 0 allowed

### **Automation Level:**
- **Field mappings**: 100% generated
- **TypeScript interfaces**: 100% generated
- **Naming validation**: 100% automated
- **Pre-commit checking**: 100% automated

This system makes it **impossible** to create naming mismatches by automating all field mapping and validation. The single source of truth prevents inconsistencies, and the automated checks catch any issues before they reach production.