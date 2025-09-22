from django.db import models


class PreDeliverableGlobalSettings(models.Model):
    """System-wide default settings for pre-deliverable generation.

    One row per PreDeliverableType (1:1).
    """

    pre_deliverable_type = models.OneToOneField(
        'deliverables.PreDeliverableType', on_delete=models.CASCADE, related_name='global_settings'
    )
    default_days_before = models.PositiveIntegerField()
    is_enabled_by_default = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['pre_deliverable_type__sort_order']
        verbose_name = 'Global Pre-Deliverable Setting'

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Global: {self.pre_deliverable_type.name}"

    @classmethod
    def get_effective_settings(cls, project_instance, pre_deliverable_type_id: int):
        """Resolve effective settings for a project + type.

        Priority:
        1) Project-specific (projects.ProjectPreDeliverableSettings)
        2) Global (this model)
        3) Type defaults (deliverables.PreDeliverableType)
        """
        # Project-specific override
        try:
            from projects.models import ProjectPreDeliverableSettings  # local import to avoid cycles
            project_setting = ProjectPreDeliverableSettings.objects.get(
                project=project_instance,
                pre_deliverable_type_id=pre_deliverable_type_id,
            )
            return {
                'days_before': project_setting.days_before,
                'is_enabled': project_setting.is_enabled,
                'source': 'project',
            }
        except Exception:
            pass

        # Global
        try:
            global_setting = cls.objects.get(pre_deliverable_type_id=pre_deliverable_type_id)
            return {
                'days_before': global_setting.default_days_before,
                'is_enabled': global_setting.is_enabled_by_default,
                'source': 'global',
            }
        except cls.DoesNotExist:
            pass

        # Type defaults
        from deliverables.models import PreDeliverableType
        try:
            t = PreDeliverableType.objects.get(id=pre_deliverable_type_id)
            return {
                'days_before': t.default_days_before,
                'is_enabled': t.is_active,
                'source': 'default',
            }
        except PreDeliverableType.DoesNotExist:
            return None


class NotificationPreference(models.Model):
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE, related_name='notification_preferences')
    email_pre_deliverable_reminders = models.BooleanField(default=True)
    reminder_days_before = models.PositiveIntegerField(default=1)
    daily_digest = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:  # pragma: no cover
        return f"NotifPrefs({self.user_id})"


class NotificationLog(models.Model):
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE)
    pre_deliverable_item = models.ForeignKey('deliverables.PreDeliverableItem', null=True, on_delete=models.SET_NULL)
    notification_type = models.CharField(max_length=20)
    sent_at = models.DateTimeField()
    email_subject = models.CharField(max_length=200)
    success = models.BooleanField(default=True)

    class Meta:
        ordering = ['-sent_at']
