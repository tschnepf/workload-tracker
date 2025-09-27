"""
CSV handler for People import/export functionality.
Fallback option when Excel is not suitable.
"""

import csv
from django.http import HttpResponse
from datetime import datetime
import codecs
from ..serializers import PersonSerializer
from ..models import Person
from core.utils.excel_sanitize import sanitize_cell


def export_people_to_csv(queryset, filename=None):
    """Export people queryset to CSV format."""
    if not filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"people_export_{timestamp}.csv"
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    writer = csv.writer(response)
    
    # CSV headers (camelCase to match API)
    headers = [
        'name', 'role', 'email', 'phone', 'location',
        'weeklyCapacity', 'departmentName', 'hireDate', 
        'notes', 'isActive'
    ]
    
    writer.writerow(headers)
    
    # Serialize data using PersonSerializer
    serializer = PersonSerializer(queryset, many=True)
    serialized_data = serializer.data
    
    # Write data rows (sanitize strings to prevent CSV injection)
    for person_data in serialized_data:
        row = []
        for header in headers:
            value = person_data.get(header, '')
            # Handle None values
            if value is None:
                value = ''
            if isinstance(value, str):
                value = sanitize_cell(value)
            row.append(str(value))
        writer.writerow(row)
    
    return response


def import_people_from_csv(file, update_existing=True, dry_run=False):
    """Import people from CSV file."""
    try:
        # Detect encoding
        file.seek(0)
        raw_data = file.read(1024)
        file.seek(0)
        
        encoding = 'utf-8'
        try:
            raw_data.decode('utf-8')
        except UnicodeDecodeError:
            encoding = 'latin-1'
        
        # Read CSV file
        file_content = file.read().decode(encoding)
        csv_reader = csv.DictReader(file_content.splitlines())
        
        results = {
            'success': True,
            'total_rows': 0,
            'success_count': 0,
            'updated_count': 0,
            'error_count': 0,
            'errors': [],
            'warnings': [],
            'success_items': [],
            'dry_run': dry_run
        }
        
        # Process CSV rows
        for row_num, row_data in enumerate(csv_reader, start=2):
            # Skip empty rows
            if not any(value.strip() for value in row_data.values() if value):
                continue
            
            results['total_rows'] += 1
            
            # Clean row data (remove empty strings)
            cleaned_row = {}
            for key, value in row_data.items():
                if value and str(value).strip():
                    cleaned_row[key.strip()] = str(value).strip()
            
            # Process individual row
            row_result = _process_csv_people_row(cleaned_row, update_existing, dry_run, row_num)
            
            if row_result['success']:
                results['success_count'] += 1
                if row_result.get('updated'):
                    results['updated_count'] += 1
                results['success_items'].append(row_result['message'])
            else:
                results['error_count'] += 1
                results['errors'].append(f"Row {row_num}: {row_result['error']}")
        
        return results
        
    except Exception as e:
        return {
            'success': False,
            'error': f'Failed to process CSV file: {str(e)}',
            'total_rows': 0,
            'success_count': 0,
            'error_count': 1,
            'errors': [f'Failed to process CSV file: {str(e)}']
        }


def _process_csv_people_row(row_data, update_existing, dry_run, row_num):
    """Process single person row from CSV using PersonSerializer."""
    try:
        # Check if person exists by email OR name
        existing_person = None
        
        # First try to find by email (more reliable if available)
        if 'email' in row_data and row_data['email']:
            try:
                existing_person = Person.objects.get(email=row_data['email'])
            except Person.DoesNotExist:
                pass
        
        # If not found by email, try to find by name
        if not existing_person and 'name' in row_data and row_data['name']:
            try:
                existing_person = Person.objects.get(name=row_data['name'])
            except Person.DoesNotExist:
                pass
            except Person.MultipleObjectsReturned:
                # If multiple people have the same name, we can't safely update
                # Return an error to let user know they need to be more specific
                return {
                    'success': False,
                    'error': f"Multiple people found with name '{row_data['name']}'. Please use unique names or add email addresses to distinguish."
                }
        
        # Update existing person
        if existing_person:
            if not update_existing:
                identifier = row_data.get('email', row_data.get('name', 'Unknown'))
                return {
                    'success': True,
                    'updated': False,
                    'message': f"Skipped existing person: {row_data.get('name', 'Unknown')} ({identifier})"
                }
            
            if not dry_run:
                serializer = PersonSerializer(existing_person, data=row_data, partial=True)
                if serializer.is_valid():
                    serializer.save()
                    identifier = row_data.get('email', row_data.get('name', 'Unknown'))
                    return {
                        'success': True,
                        'updated': True,
                        'message': f"Updated: {row_data.get('name', 'Unknown')} ({identifier})"
                    }
                else:
                    return {
                        'success': False,
                        'error': f"Validation errors: {serializer.errors}"
                    }
            else:
                identifier = row_data.get('email', row_data.get('name', 'Unknown'))
                return {
                    'success': True,
                    'updated': True,
                    'message': f"[DRY RUN] Would update: {row_data.get('name', 'Unknown')} ({identifier})"
                }
        
        # Create new person
        else:
            if not dry_run:
                serializer = PersonSerializer(data=row_data)
                if serializer.is_valid():
                    serializer.save()
                    identifier = row_data.get('email', row_data.get('name', 'Unknown'))
                    return {
                        'success': True,
                        'updated': False,
                        'message': f"Created: {row_data.get('name', 'Unknown')} ({identifier})"
                    }
                else:
                    return {
                        'success': False,
                        'error': f"Validation errors: {serializer.errors}"
                    }
            else:
                identifier = row_data.get('email', row_data.get('name', 'Unknown'))
                return {
                    'success': True,
                    'updated': False,
                    'message': f"[DRY RUN] Would create: {row_data.get('name', 'Unknown')} ({identifier})"
                }
                
    except Exception as e:
        return {
            'success': False,
            'error': f"Unexpected error: {str(e)}"
        }
