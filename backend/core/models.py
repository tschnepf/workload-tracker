from django.db import models
from django.core.exceptions import ValidationError


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


class UtilizationScheme(models.Model):
    """Singleton model to hold utilization color mapping ranges.

    Ranges are inclusive and contiguous starting from 1. Red is open-ended.
    Zero handling is controlled via `zero_is_blank`.
    """

    MODE_ABSOLUTE = 'absolute_hours'
    MODE_PERCENT = 'percent'
    MODE_CHOICES = (
        (MODE_ABSOLUTE, 'Absolute Hours'),
        (MODE_PERCENT, 'Percent'),
    )

    # Singleton enforcement via unique key
    key = models.CharField(max_length=20, default='default', unique=True)

    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default=MODE_ABSOLUTE, db_column='scheme_mode')

    blue_min = models.PositiveIntegerField(default=1)
    blue_max = models.PositiveIntegerField(default=29)
    green_min = models.PositiveIntegerField(default=30)
    green_max = models.PositiveIntegerField(default=36)
    orange_min = models.PositiveIntegerField(default=37)
    orange_max = models.PositiveIntegerField(default=40)
    red_min = models.PositiveIntegerField(default=41)

    zero_is_blank = models.BooleanField(default=True)

    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self) -> str:  # pragma: no cover
        return f"UtilizationScheme({self.key}) v{self.version}"

    def clean(self):  # pragma: no cover - validation covered by tests
        # Monotonic bounds
        if not (self.blue_min <= self.blue_max):
            raise ValidationError('blue_min must be <= blue_max')
        if not (self.green_min <= self.green_max):
            raise ValidationError('green_min must be <= green_max')
        if not (self.orange_min <= self.orange_max):
            raise ValidationError('orange_min must be <= orange_max')

        # Lower bounds must be >= 1
        if self.blue_min < 1 or self.red_min < 1:
            raise ValidationError('Lower bounds must be >= 1')

        # Contiguity (no gaps/overlaps)
        if self.green_min != self.blue_max + 1:
            raise ValidationError('green_min must be blue_max + 1')
        if self.orange_min != self.green_max + 1:
            raise ValidationError('orange_min must be green_max + 1')
        if self.red_min != self.orange_max + 1:
            raise ValidationError('red_min must be orange_max + 1')

    @classmethod
    def get_active(cls):
        """Return the singleton scheme, creating defaults if missing."""
        obj, _ = cls.objects.get_or_create(
            key='default',
            defaults=dict(
                mode=cls.MODE_ABSOLUTE,
                blue_min=1,
                blue_max=29,
                green_min=30,
                green_max=36,
                orange_min=37,
                orange_max=40,
                red_min=41,
                zero_is_blank=True,
                version=1,
            ),
        )
        return obj


class ProjectRole(models.Model):
    """Catalog of project roles for suggestions/settings.

    Names are unique case-insensitively (enforced via normalized key).
    """

    name = models.CharField(max_length=100, unique=False)
    name_key = models.CharField(max_length=120, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name_key']

    def save(self, *args, **kwargs):  # pragma: no cover
        self.name_key = (self.name or '').strip().lower()
        super().save(*args, **kwargs)

    def __str__(self) -> str:  # pragma: no cover
        return f"ProjectRole({self.name})"


class DepartmentProjectRole(models.Model):
    """Mapping between a Department and a ProjectRole.

    Enforces uniqueness per (department, project_role) pair and keeps a minimal
    activation flag with timestamps. Query patterns rely on DB indexes on
    department and the (department, project_role) pair for efficient lookups.
    """

    department = models.ForeignKey(
        'departments.Department', on_delete=models.CASCADE, related_name='project_roles'
    )
    project_role = models.ForeignKey(
        'core.ProjectRole', on_delete=models.CASCADE, related_name='departments'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['department', 'project_role'], name='uniq_department_projectrole')
        ]
        indexes = [
            models.Index(fields=['department'], name='idx_dpr_department'),
            models.Index(fields=['department', 'project_role'], name='idx_dpr_dept_role'),
        ]
        ordering = ['department_id', 'project_role_id']

    def __str__(self) -> str:  # pragma: no cover
        return f"DPR(dept={self.department_id}, role={self.project_role_id})"
