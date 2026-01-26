"""
Django admin configuration for roles app.
"""

from django.contrib import admin
from .models import Role


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    """Admin interface for Role model"""
    
    list_display = ('name', 'overhead_hours_per_week', 'people_count', 'is_active', 'created_at', 'updated_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at', 'updated_at', 'people_count')
    
    fieldsets = (
        (None, {
            'fields': ('name', 'description', 'overhead_hours_per_week', 'is_active')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
        ('Usage', {
            'fields': ('people_count',),
            'classes': ('collapse',)
        }),
    )
