from django.contrib import admin
from .models import WeeklyAssignmentSnapshot, AssignmentMembershipEvent


@admin.register(WeeklyAssignmentSnapshot)
class WeeklyAssignmentSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        'week_start', 'person_name', 'project_name', 'client', 'role_on_project_id',
        'deliverable_phase', 'hours', 'source', 'updated_at'
    )
    list_filter = ('deliverable_phase', 'source', 'client')
    search_fields = ('person_name', 'project_name', 'client')
    readonly_fields = [f.name for f in WeeklyAssignmentSnapshot._meta.fields]

    def has_add_permission(self, request):  # pragma: no cover - admin policy
        return False

    def has_change_permission(self, request, obj=None):  # pragma: no cover
        return False

    def has_delete_permission(self, request, obj=None):  # pragma: no cover
        return False


@admin.register(AssignmentMembershipEvent)
class AssignmentMembershipEventAdmin(admin.ModelAdmin):
    list_display = (
        'week_start', 'event_type', 'person_name', 'project_name', 'client',
        'role_on_project_id', 'deliverable_phase', 'hours_before', 'hours_after', 'updated_at'
    )
    list_filter = ('event_type', 'deliverable_phase', 'client')
    search_fields = ('person_name', 'project_name', 'client')
    readonly_fields = [f.name for f in AssignmentMembershipEvent._meta.fields]

    def has_add_permission(self, request):  # pragma: no cover
        return False

    def has_change_permission(self, request, obj=None):  # pragma: no cover
        return False

    def has_delete_permission(self, request, obj=None):  # pragma: no cover
        return False

