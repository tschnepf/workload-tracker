"""
Auto-generated code generators using the field registry
Part of our naming prevention system
"""

from .fields import ALL_FIELD_DEFINITIONS, FieldDefinition

def generate_typescript_interfaces() -> str:
    """Generate TypeScript interfaces from field registry"""
    
    # Group fields by model
    models = {}
    for field_key, field_def in ALL_FIELD_DEFINITIONS.items():
        model_name = field_key.split('.')[0]  # Extract model name
        if model_name not in models:
            models[model_name] = []
        models[model_name].append(field_def)
    
    interfaces = []
    
    for model_name, fields in models.items():
        # Convert to PascalCase for TypeScript interface name
        interface_name = model_name.replace('_', ' ').title().replace(' ', '')
        
        interfaces.append(f"export interface {interface_name} {{")
        
        for field in fields:
            ts_type = _get_typescript_type(field.field_type)
            optional = "?" if not field.required else ""
            interfaces.append(f"  {field.api_name}{optional}: {ts_type};")
        
        interfaces.append("}")
        interfaces.append("")
    
    return "\n".join(interfaces)

def generate_serializer_tests() -> str:
    """Generate serializer tests to validate naming consistency"""
    
    test_cases = []
    
    for field_key, field_def in ALL_FIELD_DEFINITIONS.items():
        model_name = field_key.split('.')[0]
        test_cases.append(f"""
def test_{model_name}_{field_def.python_name}_serialization():
    # Test that {field_def.python_name} maps to {field_def.api_name}
    serializer = {model_name.title()}Serializer()
    assert '{field_def.python_name}' in serializer.get_fields()
    # Verify API name mapping in actual serialization
    pass  # Add actual test logic here
""")
    
    return "\n".join(test_cases)

def _get_typescript_type(field_type: str) -> str:
    """Convert Django field type to TypeScript type"""
    type_map = {
        'string': 'string',
        'text': 'string', 
        'integer': 'number',
        'decimal': 'number',
        'boolean': 'boolean',
        'date': 'string',  # ISO date string
        'datetime': 'string',  # ISO datetime string
        'email': 'string',
        'foreign_key': 'number',  # ID reference
    }
    return type_map.get(field_type, 'any')