"""
Management command to export people data to Excel or CSV files.
Usage: python manage.py export_people [options]
"""

import os
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from people.models import Person
from people.utils.excel_handler import export_people_to_excel
from people.utils.csv_handler import export_people_to_csv


class Command(BaseCommand):
    help = 'Export people data to Excel or CSV format'

    def add_arguments(self, parser):
        """Add command line arguments."""
        parser.add_argument(
            '--format',
            choices=['excel', 'csv'],
            default='excel',
            help='Export format (default: excel)'
        )
        
        parser.add_argument(
            '--output',
            type=str,
            help='Output filename (default: auto-generated with timestamp)'
        )
        
        parser.add_argument(
            '--department',
            type=str,
            help='Filter by department name'
        )
        
        parser.add_argument(
            '--role',
            type=str,
            help='Filter by role'
        )
        
        parser.add_argument(
            '--active-only',
            action='store_true',
            help='Export only active people (is_active=True)'
        )
        
        parser.add_argument(
            '--inactive-only',
            action='store_true',
            help='Export only inactive people (is_active=False)'
        )

    def handle(self, *args, **options):
        """Handle the export command."""
        try:
            # Build queryset with filters
            queryset = self.build_queryset(options)
            
            # Generate filename if not provided
            output_file = self.get_output_filename(options)
            
            # Export data
            self.export_data(queryset, output_file, options['format'])
            
        except Exception as e:
            raise CommandError(f'Export failed: {str(e)}')

    def build_queryset(self, options):
        """Build filtered queryset based on command options."""
        queryset = Person.objects.all()
        
        # Apply filters
        if options['department']:
            queryset = queryset.filter(department__name__icontains=options['department'])
            
        if options['role']:
            # Role is a ForeignKey; filter by related name
            queryset = queryset.filter(role__name__icontains=options['role'])
            
        if options['active_only']:
            queryset = queryset.filter(is_active=True)
            
        if options['inactive_only']:
            queryset = queryset.filter(is_active=False)
            
        # Order by name for consistent output
        queryset = queryset.order_by('name')
        
        count = queryset.count()
        self.stdout.write(f'Found {count} people matching filters')
        
        if count == 0:
            self.stdout.write(
                self.style.WARNING('No people found matching the specified filters')
            )
            
        return queryset

    def get_output_filename(self, options):
        """Generate output filename."""
        if options['output']:
            return options['output']
            
        # Auto-generate filename with timestamp
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        
        # Add filter info to filename
        filter_parts = []
        if options['department']:
            filter_parts.append(f"dept_{options['department']}")
        if options['role']:
            filter_parts.append(f"role_{options['role']}")
        if options['active_only']:
            filter_parts.append('active')
        if options['inactive_only']:
            filter_parts.append('inactive')
            
        filter_suffix = '_' + '_'.join(filter_parts) if filter_parts else ''
        
        extension = 'xlsx' if options['format'] == 'excel' else 'csv'
        filename = f'people_export_{timestamp}{filter_suffix}.{extension}'
        
        return filename

    def export_data(self, queryset, filename, format_type):
        """Export data to file."""
        self.stdout.write(f'Exporting to {filename} in {format_type.upper()} format...')
        
        if format_type == 'excel':
            response = export_people_to_excel(queryset, filename)
        else:
            response = export_people_to_csv(queryset, filename)
        
        # Save the response content to file
        self.save_response_to_file(response, filename)
        
        # Get file size for user feedback
        file_size = os.path.getsize(filename) if os.path.exists(filename) else 0
        file_size_mb = file_size / (1024 * 1024)
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully exported {queryset.count()} people to {filename} '
                f'({file_size_mb:.2f} MB)'
            )
        )

    def save_response_to_file(self, response, filename):
        """Save Django response content to file."""
        try:
            with open(filename, 'wb') as f:
                if hasattr(response, 'content'):
                    f.write(response.content)
                else:
                    # For streaming responses
                    for chunk in response:
                        f.write(chunk)
                        
        except Exception as e:
            raise CommandError(f'Failed to save file {filename}: {str(e)}')
