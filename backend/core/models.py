from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.conf import settings
import secrets


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
        except Exception:  # nosec B110
            pass

        # Global
        try:
            global_setting = cls.objects.get(pre_deliverable_type_id=pre_deliverable_type_id)
            return {
                'days_before': global_setting.default_days_before,
                'is_enabled': global_setting.is_enabled_by_default,
                'source': 'global',
            }
        except cls.DoesNotExist:  # nosec B110
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


class DeliverablePhaseMappingSettings(models.Model):
    """Singleton settings for deliverable phase classification.

    Controls description token matching and percentage ranges used by analytics
    and deliverable task generation.
    """

    key = models.CharField(max_length=20, default='default', unique=True)
    use_description_match = models.BooleanField(default=True)

    # Description token lists (lowercased)
    desc_sd_tokens = models.JSONField(default=list)
    desc_dd_tokens = models.JSONField(default=list)
    desc_ifp_tokens = models.JSONField(default=list)
    desc_ifc_tokens = models.JSONField(default=list)

    # Percentage ranges (inclusive)
    range_sd_min = models.IntegerField(default=1, validators=[MinValueValidator(0), MaxValueValidator(100)])
    range_sd_max = models.IntegerField(default=40, validators=[MinValueValidator(0), MaxValueValidator(100)])
    range_dd_min = models.IntegerField(default=41, validators=[MinValueValidator(0), MaxValueValidator(100)])
    range_dd_max = models.IntegerField(default=89, validators=[MinValueValidator(0), MaxValueValidator(100)])
    range_ifp_min = models.IntegerField(default=90, validators=[MinValueValidator(0), MaxValueValidator(100)])
    range_ifp_max = models.IntegerField(default=99, validators=[MinValueValidator(0), MaxValueValidator(100)])
    range_ifc_exact = models.IntegerField(default=100, validators=[MinValueValidator(0), MaxValueValidator(100)])

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']
        verbose_name = 'Deliverable Phase Mapping Settings'

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"DeliverablePhaseMappingSettings({self.key})"

    def clean(self):
        # Normalize token lists
        for field in ('desc_sd_tokens', 'desc_dd_tokens', 'desc_ifp_tokens', 'desc_ifc_tokens'):
            raw = getattr(self, field, []) or []
            if not isinstance(raw, list):
                raise ValidationError({field: 'must be a list'})
            normalized = []
            for token in raw:
                if token is None:
                    continue
                t = str(token).strip().lower()
                if not t:
                    continue
                normalized.append(t)
            # De-duplicate, preserve order
            seen = set()
            deduped = []
            for t in normalized:
                if t in seen:
                    continue
                seen.add(t)
                deduped.append(t)
            setattr(self, field, deduped)

        # Range integrity
        sd_min, sd_max = self.range_sd_min, self.range_sd_max
        dd_min, dd_max = self.range_dd_min, self.range_dd_max
        ifp_min, ifp_max = self.range_ifp_min, self.range_ifp_max
        ifc_exact = self.range_ifc_exact

        if not (sd_min <= sd_max <= 100):
            raise ValidationError({'range_sd_max': 'SD range invalid'})
        if not (dd_min <= dd_max <= 100):
            raise ValidationError({'range_dd_max': 'DD range invalid'})
        if not (ifp_min <= ifp_max <= 100):
            raise ValidationError({'range_ifp_max': 'IFP range invalid'})
        if not (0 <= ifc_exact <= 100):
            raise ValidationError({'range_ifc_exact': 'IFC exact must be 0-100'})

        # Contiguous, non-overlapping ranges
        if dd_min != sd_max + 1:
            raise ValidationError({'range_dd_min': 'DD min must equal SD max + 1'})
        if ifp_min != dd_max + 1:
            raise ValidationError({'range_ifp_min': 'IFP min must equal DD max + 1'})
        if ifc_exact != ifp_max + 1:
            raise ValidationError({'range_ifc_exact': 'IFC exact must equal IFP max + 1'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @classmethod
    def get_active(cls):
        obj, _ = cls.objects.get_or_create(
            key='default',
            defaults=dict(
                use_description_match=True,
                desc_sd_tokens=['sd', 'schematic'],
                desc_dd_tokens=['dd', 'design development'],
                desc_ifp_tokens=['ifp'],
                desc_ifc_tokens=['ifc'],
                range_sd_min=1, range_sd_max=40,
                range_dd_min=41, range_dd_max=89,
                range_ifp_min=90, range_ifp_max=99,
                range_ifc_exact=100,
            ),
        )
        return obj


class QATaskSettings(models.Model):
    """Singleton settings for QA task defaults."""

    key = models.CharField(max_length=20, default='default', unique=True)
    default_days_before = models.PositiveIntegerField(default=7, validators=[MinValueValidator(0), MaxValueValidator(365)])
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']
        verbose_name = 'QA Task Settings'

    def __str__(self) -> str:  # pragma: no cover
        return f"QATaskSettings({self.key})"

    @classmethod
    def get_active(cls):
        obj, _ = cls.objects.get_or_create(key='default', defaults={'default_days_before': 7})
        return obj


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


class CalendarFeedSettings(models.Model):
    """Singleton storing tokens for public read-only calendar feeds.

    Initial scope: a single token securing the deliverables ICS feed.
    """

    key = models.CharField(max_length=20, default='default', unique=True)
    deliverables_token = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self) -> str:  # pragma: no cover
        return f"CalendarFeedSettings({self.key})"

    @classmethod
    def _random_token(cls) -> str:
        # URL-safe, high-entropy token (~43 chars for 32 bytes)
        return secrets.token_urlsafe(32)

    @classmethod
    def get_active(cls):
        obj, created = cls.objects.get_or_create(
            key='default',
            defaults={'deliverables_token': cls._random_token()},
        )
        return obj

    def rotate_deliverables_token(self) -> None:
        self.deliverables_token = self._random_token()
        self.save(update_fields=['deliverables_token', 'updated_at'])


class RiskAttachmentSettings(models.Model):
    """Singleton storing the base path for protected risk attachments."""

    key = models.CharField(max_length=20, default='default', unique=True)
    base_path = models.CharField(max_length=512, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self) -> str:  # pragma: no cover
        return f"RiskAttachmentSettings({self.key})"

    @classmethod
    def get_active(cls):
        default_path = str(getattr(settings, 'RISK_ATTACHMENTS_DIR', '') or '')
        obj, _ = cls.objects.get_or_create(
            key='default',
            defaults={'base_path': default_path},
        )
        return obj
