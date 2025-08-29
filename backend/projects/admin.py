"""
Project admin interface with import/export functionality.
"""

from django.contrib import admin
from django.contrib import messages
from django.shortcuts import render, redirect
from django.urls import path, reverse
from django.utils.html import format_html
from django.contrib.admin import helpers
from django.template.response import TemplateResponse
from django.http import HttpResponse
from .models import Project
from .utils.excel_handler import export_projects_to_excel, import_projects_from_file
from .utils.csv_handler import (
    export_projects_to_csv, 
    export_projects_with_assignments_to_csv,
    export_projects_with_deliverables_to_csv
)
from .forms import ProjectsImportForm


def export_projects_excel(modeladmin, request, queryset):
    """Export selected projects to Excel format with assignments and deliverables."""
    return export_projects_to_excel(queryset)


def export_projects_csv(modeladmin, request, queryset):
    """Export selected projects to CSV format (main project data)."""
    return export_projects_to_csv(queryset)


def export_projects_with_assignments_csv(modeladmin, request, queryset):
    """Export selected projects with assignments to CSV (flattened)."""
    return export_projects_with_assignments_to_csv(queryset)


def export_projects_with_deliverables_csv(modeladmin, request, queryset):
    """Export selected projects with deliverables to CSV (flattened)."""
    return export_projects_with_deliverables_to_csv(queryset)


def export_all_projects_excel(modeladmin, request, queryset):
    """Export ALL projects to Excel format (ignores selection)."""
    all_projects = Project.objects.all()
    return export_projects_to_excel(all_projects)


def export_all_projects_csv(modeladmin, request, queryset):
    """Export ALL projects to CSV format (ignores selection)."""
    all_projects = Project.objects.all()
    return export_projects_to_csv(all_projects)


def bulk_delete_projects(modeladmin, request, queryset):
    """Bulk delete selected projects with confirmation."""
    selected_count = queryset.count()
    
    if request.POST.get('post') == 'yes':
        # User confirmed deletion
        deleted_projects = []
        for project in queryset:
            deleted_projects.append(f"{project.name} (ID: {project.id})")
        
        # Perform the deletion
        queryset.delete()
        
        # Show success message
        messages.success(
            request, 
            f"Successfully deleted {selected_count} projects: {', '.join(deleted_projects)}"
        )
        return None
    
    # Show confirmation page
    context = {
        'title': f'Delete {selected_count} selected projects',
        'queryset': queryset,
        'selected_count': selected_count,
        'action_checkbox_name': helpers.ACTION_CHECKBOX_NAME,
        'opts': modeladmin.model._meta,
        'app_label': modeladmin.model._meta.app_label,
    }
    
    return TemplateResponse(
        request, 
        'admin/projects/project/delete_confirmation.html', 
        context
    )


# Set admin action descriptions
export_projects_excel.short_description = "Export selected projects to Excel (Full)"
export_projects_csv.short_description = "Export selected projects to CSV (Simple)"
export_projects_with_assignments_csv.short_description = "Export projects + assignments to CSV"
export_projects_with_deliverables_csv.short_description = "Export projects + deliverables to CSV"
export_all_projects_excel.short_description = "Export ALL projects to Excel"
export_all_projects_csv.short_description = "Export ALL projects to CSV"
bulk_delete_projects.short_description = "WARNING: DELETE selected projects (PERMANENT)"


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'project_number', 'status', 'client', 'start_date', 'end_date', 'is_active', 'created_at')
    list_filter = ('status', 'is_active', 'client')
    search_fields = ('name', 'project_number', 'client', 'description')
    ordering = ('-created_at', 'name')
    
    actions = [
        export_projects_excel,
        export_projects_csv,
        export_projects_with_assignments_csv,
        export_projects_with_deliverables_csv,
        export_all_projects_excel,
        export_all_projects_csv,
        bulk_delete_projects
    ]
    
    fieldsets = (
        ('Project Info', {
            'fields': ('name', 'project_number', 'status', 'client')
        }),
        ('Details', {
            'fields': ('description', 'estimated_hours')
        }),
        ('Timeline', {
            'fields': ('start_date', 'end_date')
        }),
        ('Status', {
            'fields': ('is_active',),
            'classes': ('collapse',)
        }),
    )
    
    def get_urls(self):
        """Add custom URLs for import functionality."""
        urls = super().get_urls()
        custom_urls = [
            path('import/', self.admin_site.admin_view(self.import_projects_view), name='projects_project_import'),
            path('download-template/', self.admin_site.admin_view(self.download_template_view), name='projects_project_download_template'),
        ]
        return custom_urls + urls
    
    def changelist_view(self, request, extra_context=None):
        """Add import button to changelist."""
        extra_context = extra_context or {}
        extra_context['import_url'] = reverse('admin:projects_project_import')
        return super().changelist_view(request, extra_context)
    
    def import_projects_view(self, request):
        """Handle projects import from Excel/CSV files."""
        if request.method == 'POST':
            form = ProjectsImportForm(request.POST, request.FILES)
            
            if form.is_valid():
                file = form.cleaned_data['file']
                update_existing = form.cleaned_data['update_existing']
                include_assignments = form.cleaned_data['include_assignments']
                include_deliverables = form.cleaned_data['include_deliverables']
                dry_run = form.cleaned_data['dry_run']
                
                # Process import
                results = import_projects_from_file(
                    file=file,
                    update_existing=update_existing,
                    include_assignments=include_assignments,
                    include_deliverables=include_deliverables,
                    dry_run=dry_run
                )
                
                if 'preview' in request.POST:
                    # Show preview results
                    context = {
                        'title': 'Import Projects - Preview',
                        'form': form,
                        'import_preview': results,
                        'opts': self.model._meta,
                        'app_label': self.model._meta.app_label,
                    }
                    return TemplateResponse(request, 'admin/projects/project/import_projects.html', context)
                
                elif 'import' in request.POST:
                    # Process actual import (not dry run)
                    if dry_run:
                        # Re-run without dry_run
                        results = import_projects_from_file(
                            file=file,
                            update_existing=update_existing,
                            include_assignments=include_assignments,
                            include_deliverables=include_deliverables,
                            dry_run=False
                        )
                    
                    if results['success']:
                        summary = results['summary']
                        success_msg = (
                            f"Import completed successfully! "
                            f"Created: {summary['projects_created']} projects, "
                            f"Updated: {summary['projects_updated']} projects"
                        )
                        if summary.get('people_created', 0) > 0:
                            success_msg += f", People: {summary['people_created']}"
                        if summary.get('assignments_created', 0) > 0:
                            success_msg += f", Assignments: {summary['assignments_created']}"
                        if summary.get('deliverables_created', 0) > 0:
                            success_msg += f", Deliverables: {summary['deliverables_created']}"
                        
                        messages.success(request, success_msg)
                        return redirect('admin:projects_project_changelist')
                    else:
                        for error in results['errors'][:5]:  # Show first 5 errors
                            messages.error(request, error)
                        if len(results['errors']) > 5:
                            messages.error(request, f"... and {len(results['errors']) - 5} more errors")
            else:
                messages.error(request, 'Please correct the errors below.')
        else:
            form = ProjectsImportForm()
        
        context = {
            'title': 'Import Projects',
            'form': form,
            'opts': self.model._meta,
            'app_label': self.model._meta.app_label,
        }
        
        return TemplateResponse(request, 'admin/projects/project/import_projects.html', context)
    
    def download_template_view(self, request):
        """Download Excel template for projects import."""
        # Generate comprehensive Excel template with example data
        response = export_projects_to_excel(
            queryset=Project.objects.none(),
            filename='projects_import_template.xlsx',
            is_template=True
        )
        
        return response