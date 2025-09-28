"""
Export projects data to Excel or CSV format.
Command-line interface for Projects export functionality.
"""

import os
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from projects.models import Project
from projects.utils.excel_handler import export_projects_to_excel
from projects.utils.csv_handler import export_projects_to_csv


class Command(BaseCommand):
    help = 'Export projects data to Excel or CSV format with filtering options'
    
    def add_arguments(self, parser):
        # Output options
        parser.add_argument(
            '--format',
            choices=['excel', 'csv'],
            default='excel',
            help='Export format: excel (.xlsx) or csv (.csv). Default: excel'
        )
        
        parser.add_argument(
            '--output',
            type=str,
            help='Output file path. If not specified, generates timestamped filename'
        )
        
        # Filtering options
        parser.add_argument(
            '--status',
            type=str,
            help='Filter by project status (e.g., "active", "completed", "planning")'
        )
        
        parser.add_argument(
            '--client',
            type=str,
            help='Filter by client name (exact match or contains)'
        )
        
        parser.add_argument(
            '--project',
            type=str,
            help='Export specific project by name or project number'
        )
        
        parser.add_argument(
            '--active-only',
            action='store_true',
            help='Export only active projects (is_active=True)'
        )
        
        parser.add_argument(
            '--with-assignments',
            action='store_true',
            help='Include assignments data (Excel format only)'
        )
        
        parser.add_argument(
            '--with-deliverables',
            action='store_true',
            help='Include deliverables data (Excel format only)'
        )
        
        parser.add_argument(
            '--projects-only',
            action='store_true',
            help='Export projects only, skip assignments and deliverables'
        )
        
        # Date range filtering
        parser.add_argument(
            '--start-date',
            type=str,
            help='Filter projects starting after this date (YYYY-MM-DD format)'
        )
        
        parser.add_argument(
            '--end-date',
            type=str,
            help='Filter projects ending before this date (YYYY-MM-DD format)'
        )
        
        # Output control
        parser.add_argument(
            '--quiet',
            action='store_true',
            help='Suppress output messages'
        )
        
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be exported without creating the file'
        )
        
        parser.add_argument(
            '--template',
            action='store_true',
            help='Generate import template with example data instead of exporting real projects'
        )
        
        parser.add_argument(
            '--wide-template',
            action='store_true',
            help='Generate wide format template (multiple people per project row)'
        )
    
    def handle(self, *args, **options):
        try:
            if options['template'] or options['wide_template']:
                # Generate template instead of exporting real data
                self._generate_template(options)
                return
            
            # Build queryset with filters
            queryset = self._build_queryset(options)
            total = queryset.count()
            
            # Validate options
            self._validate_options(options, total)
            
            if options['dry_run']:
                self._show_dry_run_preview(queryset, options)
                return
            
            # Generate output filename
            output_file = self._get_output_filename(options)
            
            # Export data
            self._export_data(queryset, total, output_file, options)
            
            if not options['quiet']:
                self.stdout.write(
                    self.style.SUCCESS(f'Successfully exported {total} projects to {output_file}')
                )
        
        except Exception as e:
            raise CommandError(f'Export failed: {str(e)}')
    
    def _build_queryset(self, options):
        """Build filtered queryset based on command options."""
        queryset = Project.objects.all()
        
        # Filter by status
        if options['status']:
            queryset = queryset.filter(status__icontains=options['status'])
        
        # Filter by client
        if options['client']:
            queryset = queryset.filter(client__icontains=options['client'])
        
        # Filter by specific project
        if options['project']:
            project_filter = (
                queryset.filter(project_number__icontains=options['project']) |
                queryset.filter(name__icontains=options['project'])
            )
            queryset = project_filter
        
        # Filter by active status
        if options['active_only']:
            queryset = queryset.filter(is_active=True)
        
        # Filter by date range
        if options['start_date']:
            try:
                start_date = timezone.datetime.strptime(options['start_date'], '%Y-%m-%d').date()
                queryset = queryset.filter(start_date__gte=start_date)
            except ValueError:
                raise CommandError('Invalid start-date format. Use YYYY-MM-DD')
        
        if options['end_date']:
            try:
                end_date = timezone.datetime.strptime(options['end_date'], '%Y-%m-%d').date()
                queryset = queryset.filter(end_date__lte=end_date)
            except ValueError:
                raise CommandError('Invalid end-date format. Use YYYY-MM-DD')
        
        return queryset.order_by('-created_at')
    
    def _validate_options(self, options, total):
        """Validate command options."""
        if total == 0:
            raise CommandError('No projects match the specified filters')
        
        # Warn about Excel-only features with CSV format
        if options['format'] == 'csv':
            if options['with_assignments']:
                self.stdout.write(
                    self.style.WARNING('--with-assignments ignored for CSV format. Use Excel format for multi-sheet export.')
                )
            if options['with_deliverables']:
                self.stdout.write(
                    self.style.WARNING('--with-deliverables ignored for CSV format. Use Excel format for multi-sheet export.')
                )
    
    def _get_output_filename(self, options):
        """Generate output filename based on options."""
        if options['output']:
            return options['output']
        
        # Generate timestamped filename
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        
        if options['format'] == 'excel':
            base_name = 'projects_export'
            if options['status']:
                base_name += f'_{options["status"]}'
            if options['client']:
                base_name += f'_{options["client"].replace(" ", "_")}'
            if options['active_only']:
                base_name += '_active'
            
            return f'{base_name}_{timestamp}.xlsx'
        else:
            return f'projects_export_{timestamp}.csv'
    
    def _export_data(self, queryset, total, output_file, options):
        """Export data using appropriate handler."""
        if options['format'] == 'excel':
            # Excel export with multi-sheet support
            response = export_projects_to_excel(queryset, filename=os.path.basename(output_file))
            
            # Write response content to file
            with open(output_file, 'wb') as f:
                f.write(response.content)
        
        else:
            # CSV export (simple format)
            if options['with_assignments']:
                from projects.utils.csv_handler import export_projects_with_assignments_to_csv
                response = export_projects_with_assignments_to_csv(queryset, filename=os.path.basename(output_file))
            elif options['with_deliverables']:
                from projects.utils.csv_handler import export_projects_with_deliverables_to_csv
                response = export_projects_with_deliverables_to_csv(queryset, filename=os.path.basename(output_file))
            else:
                response = export_projects_to_csv(queryset, filename=os.path.basename(output_file))
            
            # Write response content to file
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(response.content.decode('utf-8'))
    
    def _show_dry_run_preview(self, queryset, options):
        """Show preview of what would be exported."""
        self.stdout.write(self.style.SUCCESS('DRY RUN - Export Preview:'))
        total = queryset.count()
        self.stdout.write(f'  Format: {options["format"].upper()}')
        self.stdout.write(f'  Projects to export: {total}')
        
        if options['status']:
            self.stdout.write(f'  Status filter: {options["status"]}')
        if options['client']:
            self.stdout.write(f'  Client filter: {options["client"]}')
        if options['project']:
            self.stdout.write(f'  Project filter: {options["project"]}')
        if options['active_only']:
            self.stdout.write('  Active projects only: Yes')
        
        # Show sample projects
        self.stdout.write('\n  Sample projects to be exported:')
        for project in queryset[:5]:
            self.stdout.write(f'    - {project.name} ({project.status}) - {project.client}')
        
        if total > 5:
            self.stdout.write(f'    ... and {total - 5} more projects')
        
        # Show would-be filename
        output_file = self._get_output_filename(options)
        self.stdout.write(f'\n  Output file: {output_file}')
        
        self.stdout.write(self.style.WARNING('\nNo file created (dry run mode). Use --no-dry-run to export.'))
    
    def _generate_template(self, options):
        """Generate import template with comprehensive example data."""
        # Generate template filename
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        output_file = options.get('output', f'projects_import_template_{timestamp}.xlsx')
        
        # Only Excel format supported for templates
        if options['format'] == 'csv':
            self.stdout.write(
                self.style.WARNING('Template generation only supports Excel format. Switching to Excel.')
            )
        
        # Generate template
        response = export_projects_to_excel(
            queryset=Project.objects.none(),
            filename=os.path.basename(output_file),
            is_template=True
        )
        
        # Write template to file
        with open(output_file, 'wb') as f:
            f.write(response.content)
        
        if not options['quiet']:
            self.stdout.write(
                self.style.SUCCESS(f'Successfully generated import template: {output_file}')
            )
            self.stdout.write('Template includes:')
            self.stdout.write('  • Projects sheet with 4 example projects')
            self.stdout.write('  • Assignments sheet with 5 example assignments')
            self.stdout.write('  • Deliverables sheet with 7 example deliverables')
            self.stdout.write('  • Template sheet with formatted examples')
            self.stdout.write('  • Instructions sheet with detailed field descriptions')
            self.stdout.write('\nReady for import after customization!')
