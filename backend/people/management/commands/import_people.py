"""
Management command to import people data from Excel or CSV files.
Usage: python manage.py import_people --file <filename> [options]
"""

import os
from django.core.management.base import BaseCommand, CommandError
from people.utils.excel_handler import import_people_from_excel
from people.utils.csv_handler import import_people_from_csv


class Command(BaseCommand):
    help = 'Import people data from Excel or CSV files'

    def add_arguments(self, parser):
        """Add command line arguments."""
        parser.add_argument(
            '--file',
            type=str,
            required=True,
            help='Input file path (Excel .xlsx or CSV .csv)'
        )
        
        parser.add_argument(
            '--format',
            choices=['excel', 'csv', 'auto'],
            default='auto',
            help='File format (default: auto-detect from file extension)'
        )
        
        parser.add_argument(
            '--update-existing',
            action='store_true',
            default=True,
            help='Update existing people if email/name matches (default: True)'
        )
        
        parser.add_argument(
            '--no-update-existing',
            action='store_true',
            help='Skip existing people instead of updating them'
        )
        
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview import without making changes to database'
        )

    def handle(self, *args, **options):
        """Handle the import command."""
        try:
            # Validate file
            file_path = self.validate_file(options['file'])
            
            # Determine format
            file_format = self.determine_format(file_path, options['format'])
            
            # Determine update behavior
            update_existing = not options['no_update_existing']
            
            # Import data
            results = self.import_data(
                file_path, 
                file_format, 
                update_existing, 
                options['dry_run']
            )
            
            # Display results
            self.display_results(results)
            
        except Exception as e:
            raise CommandError(f'Import failed: {str(e)}')

    def validate_file(self, file_path):
        """Validate that the input file exists and is readable."""
        if not os.path.exists(file_path):
            raise CommandError(f'File does not exist: {file_path}')
            
        if not os.path.isfile(file_path):
            raise CommandError(f'Path is not a file: {file_path}')
            
        if not os.access(file_path, os.R_OK):
            raise CommandError(f'File is not readable: {file_path}')
            
        return file_path

    def determine_format(self, file_path, format_option):
        """Determine file format from extension or user option."""
        if format_option == 'auto':
            # Auto-detect from file extension
            if file_path.lower().endswith(('.xlsx', '.xls')):
                return 'excel'
            elif file_path.lower().endswith('.csv'):
                return 'csv'
            else:
                raise CommandError(
                    f'Cannot auto-detect format for {file_path}. '
                    'Please specify --format excel or --format csv'
                )
        else:
            return format_option

    def import_data(self, file_path, file_format, update_existing, dry_run):
        """Import data from file."""
        self.stdout.write(f'Importing from {file_path} ({file_format.upper()} format)...')
        
        if dry_run:
            self.stdout.write(
                self.style.WARNING('DRY RUN MODE: No changes will be saved to database')
            )
        
        # Open file and import
        with open(file_path, 'rb') as file:
            if file_format == 'excel':
                results = import_people_from_excel(file, update_existing, dry_run)
            else:
                results = import_people_from_csv(file, update_existing, dry_run)
                
        return results

    def display_results(self, results):
        """Display import results to user."""
        if results.get('success', False):
            self.stdout.write('\n' + '='*60)
            self.stdout.write(self.style.SUCCESS('IMPORT COMPLETED SUCCESSFULLY'))
            self.stdout.write('='*60)
            
            # Summary statistics
            self.stdout.write(f'📊 SUMMARY:')
            self.stdout.write(f'   Total rows processed: {results.get("total_rows", 0)}')
            self.stdout.write(f'   Successfully imported: {results.get("success_count", 0)}')
            self.stdout.write(f'   Updated existing: {results.get("updated_count", 0)}')
            self.stdout.write(f'   Errors: {results.get("error_count", 0)}')
            
            if results.get('dry_run', False):
                self.stdout.write(
                    self.style.WARNING('   ⚠️  DRY RUN - No data was actually saved')
                )
            
            # Success items
            if results.get('success_items'):
                self.stdout.write('\n✅ SUCCESSFUL IMPORTS:')
                for item in results['success_items'][:10]:  # Show first 10
                    self.stdout.write(f'   • {item}')
                    
                remaining = len(results['success_items']) - 10
                if remaining > 0:
                    self.stdout.write(f'   ... and {remaining} more')
            
            # Warnings
            if results.get('warnings'):
                self.stdout.write('\n⚠️  WARNINGS:')
                for warning in results['warnings']:
                    self.stdout.write(
                        self.style.WARNING(f'   • {warning}')
                    )
            
            # Errors
            if results.get('errors'):
                self.stdout.write('\n❌ ERRORS:')
                for error in results['errors']:
                    self.stdout.write(
                        self.style.ERROR(f'   • {error}')
                    )
                    
        else:
            # Import failed completely
            self.stdout.write('\n' + '='*60)
            self.stdout.write(self.style.ERROR('IMPORT FAILED'))
            self.stdout.write('='*60)
            
            error_msg = results.get('error', 'Unknown error occurred')
            self.stdout.write(self.style.ERROR(f'Error: {error_msg}'))
            
            if results.get('errors'):
                self.stdout.write('\nDetailed errors:')
                for error in results['errors']:
                    self.stdout.write(self.style.ERROR(f'   • {error}'))

    def add_usage_examples(self):
        """Add usage examples to help text."""
        return """
Examples:
  # Import Excel file with auto-detection
  python manage.py import_people --file people.xlsx
  
  # Import CSV file with dry run
  python manage.py import_people --file people.csv --dry-run
  
  # Import without updating existing people
  python manage.py import_people --file people.xlsx --no-update-existing
  
  # Force CSV format
  python manage.py import_people --file data.txt --format csv
        """