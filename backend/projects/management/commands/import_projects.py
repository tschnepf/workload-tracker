"""
Import projects data from Excel or CSV files.
Command-line interface for Projects import functionality.
"""

import os
from django.core.management.base import BaseCommand, CommandError
from django.core.files.uploadedfile import SimpleUploadedFile
from projects.utils.excel_handler import import_projects_from_file


class Command(BaseCommand):
    help = 'Import projects data from Excel or CSV files with comprehensive options'
    
    def add_arguments(self, parser):
        # Input file (required)
        parser.add_argument(
            '--file',
            type=str,
            required=True,
            help='Path to Excel (.xlsx) or CSV (.csv) file to import'
        )
        
        # Import behavior options
        parser.add_argument(
            '--update-existing',
            action='store_true',
            default=True,
            help='Update existing projects if they match by project number or name (default: True)'
        )
        
        parser.add_argument(
            '--no-update-existing',
            action='store_true',
            help='Only create new projects, skip existing ones'
        )
        
        parser.add_argument(
            '--include-assignments',
            action='store_true',
            default=True,
            help='Process assignments from Assignments sheet (Excel only, default: True)'
        )
        
        parser.add_argument(
            '--skip-assignments',
            action='store_true',
            help='Skip assignments processing, projects only'
        )
        
        parser.add_argument(
            '--include-deliverables',
            action='store_true',
            default=True,
            help='Process deliverables from Deliverables sheet (Excel only, default: True)'
        )
        
        parser.add_argument(
            '--skip-deliverables',
            action='store_true',
            help='Skip deliverables processing, projects only'
        )
        
        parser.add_argument(
            '--projects-only',
            action='store_true',
            help='Import projects only, skip assignments and deliverables'
        )
        
        # Processing options
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview import without making changes (recommended for first run)'
        )
        
        parser.add_argument(
            '--format',
            choices=['auto', 'excel', 'csv'],
            default='auto',
            help='Force file format detection. Default: auto (detect from extension)'
        )
        
        parser.add_argument(
            '--ignore-errors',
            action='store_true',
            help='Continue processing even if some rows have errors'
        )
        
        parser.add_argument(
            '--max-errors',
            type=int,
            default=10,
            help='Maximum number of errors before stopping import (default: 10)'
        )
        
        # Output control
        parser.add_argument(
            '--quiet',
            action='store_true',
            help='Suppress progress messages, show only results'
        )
        
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed processing information'
        )
        
        parser.add_argument(
            '--show-preview',
            type=int,
            default=5,
            metavar='N',
            help='Number of sample records to show in preview (default: 5)'
        )
    
    def handle(self, *args, **options):
        try:
            # Validate file and options
            self._validate_options(options)
            
            # Load and validate file
            uploaded_file = self._load_file(options['file'])
            
            # Determine import options
            import_options = self._build_import_options(options)
            
            if not options['quiet']:
                self._show_import_settings(options, import_options)
            
            # Process import
            results = import_projects_from_file(
                file=uploaded_file,
                update_existing=import_options['update_existing'],
                include_assignments=import_options['include_assignments'],
                include_deliverables=import_options['include_deliverables'],
                dry_run=options['dry_run']
            )
            
            # Display results
            self._display_results(results, options)
            
        except Exception as e:
            raise CommandError(f'Import failed: {str(e)}')
    
    def _validate_options(self, options):
        """Validate command options and file existence."""
        # Check if file exists
        if not os.path.exists(options['file']):
            raise CommandError(f'File not found: {options["file"]}')
        
        # Validate file extension
        file_ext = os.path.splitext(options['file'])[1].lower()
        if file_ext not in ['.xlsx', '.xls', '.csv']:
            raise CommandError(f'Unsupported file format: {file_ext}. Use .xlsx, .xls, or .csv files.')
        
        # Handle conflicting options
        if options['no_update_existing']:
            options['update_existing'] = False
        
        if options['skip_assignments']:
            options['include_assignments'] = False
        
        if options['skip_deliverables']:
            options['include_deliverables'] = False
        
        if options['projects_only']:
            options['include_assignments'] = False
            options['include_deliverables'] = False
        
        # Warn about Excel-only features with CSV files
        if file_ext == '.csv':
            if options['include_assignments']:
                self.stdout.write(
                    self.style.WARNING('Assignments import not available for CSV files. Will be skipped.')
                )
                options['include_assignments'] = False
            
            if options['include_deliverables']:
                self.stdout.write(
                    self.style.WARNING('Deliverables import not available for CSV files. Will be skipped.')
                )
                options['include_deliverables'] = False
    
    def _load_file(self, file_path):
        """Load file and create Django UploadedFile object."""
        try:
            with open(file_path, 'rb') as f:
                file_content = f.read()
            
            file_name = os.path.basename(file_path)
            
            # Determine content type
            file_ext = os.path.splitext(file_name)[1].lower()
            if file_ext in ['.xlsx', '.xls']:
                content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            else:
                content_type = 'text/csv'
            
            return SimpleUploadedFile(
                name=file_name,
                content=file_content,
                content_type=content_type
            )
            
        except Exception as e:
            raise CommandError(f'Error reading file {file_path}: {str(e)}')
    
    def _build_import_options(self, options):
        """Build import options dictionary."""
        return {
            'update_existing': options['update_existing'],
            'include_assignments': options['include_assignments'],
            'include_deliverables': options['include_deliverables']
        }
    
    def _show_import_settings(self, options, import_options):
        """Display import settings before processing."""
        self.stdout.write(self.style.SUCCESS('Import Settings:'))
        self.stdout.write(f'  File: {options["file"]}')
        self.stdout.write(f'  Format: {os.path.splitext(options["file"])[1].upper()}')
        self.stdout.write(f'  Update existing: {"Yes" if import_options["update_existing"] else "No"}')
        self.stdout.write(f'  Include assignments: {"Yes" if import_options["include_assignments"] else "No"}')
        self.stdout.write(f'  Include deliverables: {"Yes" if import_options["include_deliverables"] else "No"}')
        self.stdout.write(f'  Dry run: {"Yes" if options["dry_run"] else "No"}')
        self.stdout.write('')
    
    def _display_results(self, results, options):
        """Display import results."""
        if not results['success']:
            # Show errors
            self.stdout.write(self.style.ERROR('Import failed with errors:'))
            for error in results.get('errors', [])[:options['max_errors']]:
                self.stdout.write(f'  ERROR: {error}')
            
            if len(results.get('errors', [])) > options['max_errors']:
                remaining = len(results['errors']) - options['max_errors']
                self.stdout.write(f'  ... and {remaining} more errors')
            
            raise CommandError('Import failed due to errors above')
        
        # Show success summary
        summary = results.get('summary', {})
        
        if options['dry_run']:
            self.stdout.write(self.style.SUCCESS('DRY RUN PREVIEW - No changes made:'))
        else:
            self.stdout.write(self.style.SUCCESS('Import completed successfully:'))
        
        self.stdout.write(f'  Projects processed: {summary.get("total_processed", 0)}')
        self.stdout.write(f'  Projects created: {summary.get("projects_created", 0)}')
        self.stdout.write(f'  Projects updated: {summary.get("projects_updated", 0)}')
        
        if summary.get('people_created', 0) > 0:
            self.stdout.write(f'  People created: {summary.get("people_created", 0)}')
        
        if summary.get('assignments_created', 0) > 0:
            self.stdout.write(f'  Assignments created: {summary.get("assignments_created", 0)}')
        
        if summary.get('deliverables_created', 0) > 0:
            self.stdout.write(f'  Deliverables created: {summary.get("deliverables_created", 0)}')
        
        if summary.get('total_errors', 0) > 0:
            self.stdout.write(f'  Errors encountered: {summary.get("total_errors", 0)}')
        
        self.stdout.write(f'  Success rate: {summary.get("success_rate", "0%")}')
        
        # Show sample data if requested and verbose
        if options['verbose'] and not options['quiet']:
            self._show_sample_data(results, options)
        
        # Show errors if any
        if results.get('errors') and not options['ignore_errors']:
            self.stdout.write(self.style.WARNING('\nErrors encountered:'))
            for error in results['errors'][:5]:
                self.stdout.write(f'  WARNING: {error}')
            
            if len(results['errors']) > 5:
                self.stdout.write(f'  ... and {len(results["errors"]) - 5} more warnings')
        
        if options['dry_run']:
            self.stdout.write(self.style.WARNING('\nThis was a DRY RUN - no actual changes were made.'))
            self.stdout.write('Remove --dry-run flag to perform the actual import.')
    
    def _show_sample_data(self, results, options):
        """Show sample of imported data."""
        preview_count = min(options['show_preview'], 5)
        
        if results.get('projects_to_create'):
            self.stdout.write(f'\n  Sample projects to create (showing {preview_count}):')
            for project in results['projects_to_create'][:preview_count]:
                name = project.get('name', 'Unknown')
                client = project.get('client', 'No client')
                status = project.get('status', 'No status')
                self.stdout.write(f'    - {name} ({status}) - {client}')
        
        if results.get('projects_to_update'):
            self.stdout.write(f'\n  Sample projects to update (showing {preview_count}):')
            for project in results['projects_to_update'][:preview_count]:
                name = project.get('name', 'Unknown')
                changes = project.get('changes', 'Updated')
                self.stdout.write(f'    - {name}: {changes}')