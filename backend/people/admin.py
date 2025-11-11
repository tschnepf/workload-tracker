"""
Person admin interface
"""

from django.contrib import admin
from django.contrib import messages
from django.shortcuts import render, redirect
from django.urls import path, reverse
from django.utils.html import format_html
from django.contrib.admin import helpers
from django.template.response import TemplateResponse
from .models import Person, DeactivationAudit
from .utils.excel_handler import export_people_to_excel, import_people_from_excel
from .utils.csv_handler import export_people_to_csv, import_people_from_csv
from .forms import PeopleImportForm

def export_people_excel(modeladmin, request, queryset):
    """Export selected people to Excel format."""
    return export_people_to_excel(queryset)

def export_people_csv(modeladmin, request, queryset):
    """Export selected people to CSV format."""
    return export_people_to_csv(queryset)

def export_all_people_excel(modeladmin, request, queryset):
    """Export all people to Excel format (ignores selection)."""
    all_people = Person.objects.all()
    return export_people_to_excel(all_people)

def export_all_people_csv(modeladmin, request, queryset):
    """Export all people to CSV format (ignores selection)."""
    all_people = Person.objects.all()
    return export_people_to_csv(all_people)

# Set admin action descriptions
export_people_excel.short_description = "Export selected people to Excel"
export_people_csv.short_description = "Export selected people to CSV"
export_all_people_excel.short_description = "Export ALL people to Excel"
export_all_people_csv.short_description = "Export ALL people to CSV"

def bulk_delete_people(modeladmin, request, queryset):
    """Bulk delete selected people with confirmation."""
    selected_count = queryset.count()
    
    if request.POST.get('post') == 'yes':
        # User confirmed deletion
        deleted_people = []
        for person in queryset:
            deleted_people.append(f"{person.name} (ID: {person.id})")
        
        # Perform the deletion
        queryset.delete()
        
        # Show success message
        messages.success(
            request, 
            f"Successfully deleted {selected_count} people: {', '.join(deleted_people)}"
        )
        return None
    
    # Show confirmation page
    context = {
        'title': f'Delete {selected_count} selected people',
        'queryset': queryset,
        'selected_count': selected_count,
        'action_checkbox_name': helpers.ACTION_CHECKBOX_NAME,
        'opts': modeladmin.model._meta,
        'app_label': modeladmin.model._meta.app_label,
    }
    
    return TemplateResponse(
        request, 
        'admin/people/person/delete_confirmation.html', 
        context
    )

bulk_delete_people.short_description = "⚠️ DELETE selected people (PERMANENT)"

@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ('name', 'role', 'weekly_capacity', 'email', 'is_active', 'created_at')
    list_filter = ('role', 'is_active', 'department')
    search_fields = ('name', 'email', 'role__name')
    ordering = ('name',)


@admin.register(DeactivationAudit)
class DeactivationAuditAdmin(admin.ModelAdmin):
    list_display = (
        'person', 'mode', 'assignments_touched', 'assignments_deactivated',
        'hours_zeroed', 'deliverable_links_deactivated', 'started_at', 'finished_at'
    )
    list_filter = ('mode',)
    search_fields = ('person__name',)
    
    actions = [
        export_people_excel,
        export_people_csv,
        export_all_people_excel,
        export_all_people_csv,
        bulk_delete_people
    ]
    
    fieldsets = (
        ('Basic Info', {
            'fields': ('name', 'role', 'weekly_capacity')
        }),
        ('Contact', {
            'fields': ('email', 'phone', 'location')
        }),
        ('Employment', {
            'fields': ('department', 'hire_date')
        }),
        ('Additional', {
            'fields': ('notes', 'is_active'),
            'classes': ('collapse',)
        }),
    )
    
    def get_urls(self):
        """Add custom URLs for import functionality."""
        urls = super().get_urls()
        custom_urls = [
            path('import/', self.import_people_view, name='people_person_import'),
            path('download-template/', self.download_template_view, name='people_person_download_template'),
        ]
        return custom_urls + urls
    
    def import_people_view(self, request):
        """Handle people import from Excel/CSV files."""
        if request.method == 'POST':
            form = PeopleImportForm(request.POST, request.FILES)
            if form.is_valid():
                file = form.cleaned_data['file']
                update_existing = form.cleaned_data['update_existing']
                dry_run = form.cleaned_data['dry_run']
                
                # Determine file format
                file_format = 'excel'
                if file.name.lower().endswith('.csv'):
                    file_format = 'csv'
                
                # Process import
                try:
                    if file_format == 'excel':
                        results = import_people_from_excel(file, update_existing, dry_run)
                    else:
                        results = import_people_from_csv(file, update_existing, dry_run)
                    
                    # Add filename and format to results
                    results['filename'] = file.name
                    results['format'] = file_format.upper()
                    
                    # Show success message
                    if results.get('success', False):
                        if dry_run:
                            messages.success(request, f"Preview complete: {results['success_count']} would be processed")
                        else:
                            messages.success(request, f"Import complete: {results['success_count']} people processed")
                    else:
                        messages.error(request, f"Import failed: {results.get('error', 'Unknown error')}")
                    
                    return render(request, 'admin/import_people.html', {
                        'form': form,
                        'import_results': results,
                        'title': 'Import People'
                    })
                    
                except Exception as e:
                    messages.error(request, f"Import failed: {str(e)}")
            else:
                messages.error(request, "Please correct the errors below")
        else:
            form = PeopleImportForm()
        
        return render(request, 'admin/import_people.html', {
            'form': form,
            'title': 'Import People'
        })
    
    def download_template_view(self, request):
        """Download Excel template for people import."""
        # Create empty queryset to generate template structure
        empty_queryset = Person.objects.none()
        return export_people_to_excel(empty_queryset, 'people_import_template.xlsx')
    
    def changelist_view(self, request, extra_context=None):
        """Add import button to changelist."""
        extra_context = extra_context or {}
        extra_context['import_url'] = reverse('admin:people_person_import')
        return super().changelist_view(request, extra_context)
