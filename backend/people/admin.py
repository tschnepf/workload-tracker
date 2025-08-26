"""
Person admin interface
"""

from django.contrib import admin
from .models import Person

@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ('name', 'role', 'weekly_capacity', 'email', 'is_active', 'created_at')
    list_filter = ('role', 'is_active', 'department')
    search_fields = ('name', 'email', 'role')
    ordering = ('name',)
    
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