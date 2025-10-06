from django.contrib import admin
from .models import PreDeliverableGlobalSettings, DepartmentProjectRole


@admin.register(PreDeliverableGlobalSettings)
class PreDeliverableGlobalSettingsAdmin(admin.ModelAdmin):
    list_display = (
        'pre_deliverable_type',
        'default_days_before',
        'is_enabled_by_default',
        'created_at',
        'updated_at',
    )
    list_editable = ('default_days_before', 'is_enabled_by_default')
    search_fields = ('pre_deliverable_type__name',)
    ordering = ('pre_deliverable_type__sort_order',)


@admin.register(DepartmentProjectRole)
class DepartmentProjectRoleAdmin(admin.ModelAdmin):
    list_display = (
        'department', 'project_role', 'is_active', 'created_at', 'updated_at'
    )
    list_filter = ('is_active', 'department')
    search_fields = ('department__name', 'project_role__name')
    ordering = ('department__name', 'project_role__name')
