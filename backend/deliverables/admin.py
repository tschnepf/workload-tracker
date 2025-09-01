from django.contrib import admin
from .models import Deliverable, DeliverableAssignment


@admin.register(Deliverable)
class DeliverableAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "description", "percentage", "date", "is_completed", "sort_order")
    list_filter = ("is_completed", "project")
    search_fields = ("description", "project__name")


@admin.register(DeliverableAssignment)
class DeliverableAssignmentAdmin(admin.ModelAdmin):
    list_display = ("id", "deliverable", "person", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("deliverable__description", "person__name")
