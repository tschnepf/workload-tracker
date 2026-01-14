from django.contrib import admin
from .models import ProjectRole, ProjectRisk, ProjectRiskEdit


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
