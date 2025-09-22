from django.contrib import admin
from .models import Deliverable, DeliverableAssignment, PreDeliverableType, PreDeliverableItem


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


@admin.register(PreDeliverableType)
class PreDeliverableTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "default_days_before", "is_active", "sort_order", "created_at", "updated_at")
    list_editable = ("default_days_before", "is_active", "sort_order")
    search_fields = ("name",)
    ordering = ("sort_order", "name")


@admin.register(PreDeliverableItem)
class PreDeliverableItemAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "deliverable",
        "pre_deliverable_type",
        "generated_date",
        "days_before",
        "is_completed",
        "is_active",
        "created_at",
    )
    list_filter = ("is_completed", "is_active", "pre_deliverable_type")
    search_fields = ("deliverable__description", "pre_deliverable_type__name")
    readonly_fields = ("created_at", "updated_at")
