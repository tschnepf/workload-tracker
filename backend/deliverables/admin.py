from django.contrib import admin
from .models import (
    Deliverable,
    DeliverableAssignment,
    PreDeliverableType,
    PreDeliverableItem,
    DeliverableTaskTemplate,
    DeliverableTask,
    DeliverableQATask,
)


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


@admin.register(DeliverableTaskTemplate)
class DeliverableTaskTemplateAdmin(admin.ModelAdmin):
    list_display = ("id", "phase", "department", "sheet_number", "sheet_name", "sort_order", "is_active", "updated_at")
    list_filter = ("phase", "department", "is_active")
    search_fields = ("sheet_number", "sheet_name", "scope_description")
    ordering = ("phase", "sort_order", "id")


@admin.register(DeliverableTask)
class DeliverableTaskAdmin(admin.ModelAdmin):
    list_display = ("id", "deliverable", "department", "assigned_to", "qa_assigned_to", "completion_status", "qa_status", "updated_at")
    list_filter = ("completion_status", "qa_status", "department")
    search_fields = ("deliverable__description", "sheet_number", "sheet_name", "scope_description")


@admin.register(DeliverableQATask)
class DeliverableQATaskAdmin(admin.ModelAdmin):
    list_display = ("id", "deliverable", "department", "qa_assigned_to", "qa_status", "reviewed_at", "updated_at")
    list_filter = ("qa_status", "department")
    search_fields = ("deliverable__description",)
