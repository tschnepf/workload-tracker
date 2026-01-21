from django.contrib import admin
from .models import PreDeliverableGlobalSettings, CalendarFeedSettings, RiskAttachmentSettings, QATaskSettings


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


@admin.register(CalendarFeedSettings)
class CalendarFeedSettingsAdmin(admin.ModelAdmin):
    list_display = ('key', 'deliverables_token', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(RiskAttachmentSettings)
class RiskAttachmentSettingsAdmin(admin.ModelAdmin):
    list_display = ('key', 'base_path', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(QATaskSettings)
class QATaskSettingsAdmin(admin.ModelAdmin):
    list_display = ('key', 'default_days_before', 'updated_at')
    list_editable = ('default_days_before',)
