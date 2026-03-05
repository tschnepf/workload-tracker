from django.contrib import admin
from .models import (
    ProjectRole,
    ProjectRisk,
    ProjectRiskEdit,
    ProjectStatusDefinition,
    ProjectTaskTemplate,
    ProjectTask,
)


@admin.register(ProjectRole)
class ProjectRoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'is_active', 'sort_order', 'updated_at')
    list_filter = ('department', 'is_active')
    search_fields = ('name', 'normalized_name')
    ordering = ('department', 'sort_order', 'name')


@admin.register(ProjectRisk)
class ProjectRiskAdmin(admin.ModelAdmin):
    list_display = ('project', 'description', 'created_by', 'created_at')
    list_filter = ('project', 'departments')
    search_fields = ('description', 'project__name')
    ordering = ('-created_at',)


@admin.register(ProjectRiskEdit)
class ProjectRiskEditAdmin(admin.ModelAdmin):
    list_display = ('risk', 'action', 'actor', 'created_at')
    list_filter = ('action',)
    search_fields = ('risk__description', 'actor__username')


@admin.register(ProjectStatusDefinition)
class ProjectStatusDefinitionAdmin(admin.ModelAdmin):
    list_display = (
        'key',
        'label',
        'include_in_analytics',
        'treat_as_ca_when_no_deliverable',
        'is_system',
        'is_active',
        'sort_order',
        'updated_at',
    )
    list_filter = ('include_in_analytics', 'treat_as_ca_when_no_deliverable', 'is_system', 'is_active')
    search_fields = ('key', 'label')
    ordering = ('sort_order', 'label', 'key')


@admin.register(ProjectTaskTemplate)
class ProjectTaskTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'vertical', 'scope', 'department', 'sort_order', 'is_active', 'updated_at')
    list_filter = ('vertical', 'scope', 'department', 'is_active')
    search_fields = ('name', 'description')
    ordering = ('vertical', 'scope', 'sort_order', 'id')


@admin.register(ProjectTask)
class ProjectTaskAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'scope', 'deliverable', 'department', 'completion_percent', 'updated_at')
    list_filter = ('scope', 'department')
    search_fields = ('name', 'description', 'project__name')
    filter_horizontal = ('assignees',)
