from django.contrib import admin
from .models import ProjectRole


@admin.register(ProjectRole)
class ProjectRoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'is_active', 'sort_order', 'updated_at')
    list_filter = ('department', 'is_active')
    search_fields = ('name', 'normalized_name')
    ordering = ('department', 'sort_order', 'name')

