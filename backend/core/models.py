import base64
import hashlib
import secrets
import re
from datetime import timedelta

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone

from core.notification_matrix import (
    default_notification_channel_matrix,
    default_user_notification_channel_matrix,
    legacy_global_matrix_from_settings,
    normalize_notification_channel_matrix,
)


def default_auto_hours_phase_keys():
    return ['sd', 'dd', 'ifp', 'ifc']


_TASK_PROGRESS_COLOR_HEX_RE = re.compile(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')


def _storage_cipher() -> Fernet:
    seed = (settings.SECRET_KEY or 'workload-tracker').encode('utf-8')
    digest = hashlib.sha256(seed).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def _normalize_task_progress_ranges(raw_ranges):
    if not isinstance(raw_ranges, list) or len(raw_ranges) == 0:
        raise ValidationError({'ranges': 'At least one color range is required'})

    normalized = []
    for idx, item in enumerate(raw_ranges):
        if not isinstance(item, dict):
            raise ValidationError({'ranges': f'Range #{idx + 1} must be an object'})

        raw_min = item.get('minPercent', item.get('min_percent'))
        raw_max = item.get('maxPercent', item.get('max_percent'))
        raw_color = item.get('colorHex', item.get('color_hex'))
        raw_label = item.get('label', None)

        try:
            min_percent = int(raw_min)
            max_percent = int(raw_max)
        except Exception:
            raise ValidationError({'ranges': f'Range #{idx + 1} min/max must be integers'})

        if min_percent < 0 or max_percent > 100:
            raise ValidationError({'ranges': f'Range #{idx + 1} must be between 0 and 100'})
        if min_percent > max_percent:
            raise ValidationError({'ranges': f'Range #{idx + 1} minPercent must be <= maxPercent'})

        color_hex = str(raw_color or '').strip()
        if not _TASK_PROGRESS_COLOR_HEX_RE.match(color_hex):
            raise ValidationError({'ranges': f'Range #{idx + 1} colorHex must be a valid hex color'})
        if len(color_hex) == 4:
            color_hex = '#' + ''.join(ch * 2 for ch in color_hex[1:])
        color_hex = color_hex.upper()

        label = str(raw_label or '').strip()
        if not label:
            label = f'{min_percent}-{max_percent}%'

        normalized.append({
            'minPercent': min_percent,
            'maxPercent': max_percent,
            'colorHex': color_hex,
            'label': label,
        })

    normalized.sort(key=lambda r: (r['minPercent'], r['maxPercent']))

    expected_min = 0
    for idx, row in enumerate(normalized):
        if row['minPercent'] != expected_min:
            if row['minPercent'] < expected_min:
                raise ValidationError({'ranges': f'Ranges overlap around {row["minPercent"]}% (range #{idx + 1})'})
            raise ValidationError({'ranges': f'Ranges must cover 0-100 with no gaps (expected {expected_min}% at range #{idx + 1})'})
        expected_min = row['maxPercent'] + 1
    if expected_min != 101:
        raise ValidationError({'ranges': 'Ranges must cover 0-100 with no gaps'})

    return normalized


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


class DeliverablePhaseDefinition(models.Model):
    """User-defined deliverable phase definitions for mapping and tasks."""

    key = models.CharField(max_length=20, unique=True)
    label = models.CharField(max_length=50)
    description_tokens = models.JSONField(default=list, blank=True)
    range_min = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)])
    range_max = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(100)])
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = 'Deliverable Phase Definition'

    def __str__(self) -> str:  # pragma: no cover
        return f"DeliverablePhase({self.key})"


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


class TaskProgressColorSettings(models.Model):
    """Singleton settings for task progress bar color ranges."""

    key = models.CharField(max_length=20, default='default', unique=True)
    ranges = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']
        verbose_name = 'Task Progress Color Settings'

    def __str__(self) -> str:  # pragma: no cover
        return f"TaskProgressColorSettings({self.key})"

    def clean(self):
        self.ranges = _normalize_task_progress_ranges(self.ranges or [])

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @classmethod
    def get_active(cls):
        defaults = {
            'ranges': [
                {'minPercent': 0, 'maxPercent': 25, 'colorHex': '#F59E0B', 'label': '0-25%'},
                {'minPercent': 26, 'maxPercent': 75, 'colorHex': '#3B82F6', 'label': '26-75%'},
                {'minPercent': 76, 'maxPercent': 100, 'colorHex': '#EF4444', 'label': '76-100%'},
            ]
        }
        obj, _ = cls.objects.get_or_create(key='default', defaults=defaults)
        return obj


class NetworkGraphSettings(models.Model):
    """Singleton defaults for network graph analytics and snapshot scheduling."""

    key = models.CharField(max_length=20, default='default', unique=True)

    # Graph defaults
    default_window_months = models.PositiveIntegerField(default=24, validators=[MinValueValidator(1), MaxValueValidator(120)])
    coworker_project_weight = models.DecimalField(max_digits=8, decimal_places=2, default=3.0)
    coworker_week_weight = models.DecimalField(max_digits=8, decimal_places=2, default=1.0)
    coworker_min_score = models.DecimalField(max_digits=8, decimal_places=2, default=6.0)
    client_project_weight = models.DecimalField(max_digits=8, decimal_places=2, default=4.0)
    client_week_weight = models.DecimalField(max_digits=8, decimal_places=2, default=1.0)
    client_min_score = models.DecimalField(max_digits=8, decimal_places=2, default=8.0)
    include_inactive_default = models.BooleanField(default=False)
    max_edges_default = models.PositiveIntegerField(default=4000, validators=[MinValueValidator(100), MaxValueValidator(10000)])

    # Weekly snapshot scheduler
    snapshot_scheduler_enabled = models.BooleanField(default=True)
    # Python weekday index: Monday=0 ... Sunday=6 (default Sunday)
    snapshot_scheduler_day = models.IntegerField(default=6, validators=[MinValueValidator(0), MaxValueValidator(6)])
    snapshot_scheduler_hour = models.IntegerField(default=23, validators=[MinValueValidator(0), MaxValueValidator(23)])
    snapshot_scheduler_minute = models.IntegerField(default=55, validators=[MinValueValidator(0), MaxValueValidator(59)])
    snapshot_scheduler_timezone = models.CharField(max_length=64, default='America/Phoenix')
    last_snapshot_week_start = models.DateField(null=True, blank=True)
    omitted_project_ids = models.JSONField(default=list, blank=True)
    initial_backfill_completed_at = models.DateTimeField(null=True, blank=True)
    initial_backfill_weeks = models.PositiveIntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']
        verbose_name = 'Network Graph Settings'

    def __str__(self) -> str:  # pragma: no cover
        return f"NetworkGraphSettings({self.key})"

    @classmethod
    def get_active(cls):
        obj, _ = cls.objects.get_or_create(key='default')
        return obj


class AutoHoursRoleSetting(models.Model):
    """Global auto-hours defaults per project role."""

    role = models.OneToOneField(
        'projects.ProjectRole',
        on_delete=models.CASCADE,
        related_name='auto_hours_setting',
    )
    standard_percent_of_capacity = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
    )
    # Map of weeks-before -> percent of weekly capacity (keys stored as strings: "0".."8")
    ramp_percent_by_week = models.JSONField(default=dict, blank=True)
    # Map of phase -> weeks-before -> percent (phase keys: "sd","dd","ifp","ifc")
    ramp_percent_by_phase = models.JSONField(default=dict, blank=True)
    # Map of phase -> role count (int)
    role_count_by_phase = models.JSONField(default=dict, blank=True)
    people_roles = models.ManyToManyField(
        'roles.Role',
        blank=True,
        related_name='auto_hours_global_role_mappings',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['role_id']
        verbose_name = 'Auto Hours Role Setting'

    def __str__(self) -> str:  # pragma: no cover
        return f"AutoHours({self.role_id})"


class AutoHoursGlobalSettings(models.Model):
    """Singleton settings for global auto-hours configuration."""

    key = models.CharField(max_length=20, default='default', unique=True)
    weeks_by_phase = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']
        verbose_name = 'Auto Hours Global Settings'

    def __str__(self) -> str:  # pragma: no cover
        return f"AutoHoursGlobalSettings({self.key})"

    @classmethod
    def get_active(cls):
        obj, _ = cls.objects.get_or_create(key='default', defaults={'weeks_by_phase': {}})
        return obj


class AutoHoursTemplate(models.Model):
    """Project auto-hours template."""

    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True, default='')
    weeks_by_phase = models.JSONField(default=dict, blank=True)
    excluded_roles = models.ManyToManyField(
        'projects.ProjectRole',
        blank=True,
        related_name='auto_hours_template_exclusions',
    )
    excluded_departments = models.ManyToManyField(
        'departments.Department',
        blank=True,
        related_name='auto_hours_template_exclusions',
    )
    is_active = models.BooleanField(default=True)
    phase_keys = models.JSONField(default=default_auto_hours_phase_keys, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Auto Hours Template'

    def __str__(self) -> str:  # pragma: no cover
        return f"AutoHoursTemplate({self.name})"


class AutoHoursTemplateRoleSetting(models.Model):
    """Template-scoped auto-hours defaults per project role."""

    template = models.ForeignKey('core.AutoHoursTemplate', on_delete=models.CASCADE, related_name='role_settings')
    role = models.ForeignKey('projects.ProjectRole', on_delete=models.CASCADE, related_name='auto_hours_template_settings')
    people_roles = models.ManyToManyField(
        'roles.Role',
        blank=True,
        related_name='auto_hours_template_role_mappings',
    )
    # Map of phase -> weeks-before -> percent (keys: "sd","dd","ifp","ifc")
    ramp_percent_by_phase = models.JSONField(default=dict, blank=True)
    # Map of phase -> role count (int)
    role_count_by_phase = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['template_id', 'role_id']
        unique_together = [['template', 'role']]
        verbose_name = 'Auto Hours Template Role Setting'

    def __str__(self) -> str:  # pragma: no cover
        return f"AutoHoursTemplateRole({self.template_id}, {self.role_id})"


class NotificationPreference(models.Model):
    PUSH_DIGEST_WINDOW_INSTANT = 'instant'
    PUSH_DIGEST_WINDOW_MORNING = 'morning'
    PUSH_DIGEST_WINDOW_EVENING = 'evening'
    PUSH_DIGEST_WINDOW_CHOICES = (
        (PUSH_DIGEST_WINDOW_INSTANT, 'Instant'),
        (PUSH_DIGEST_WINDOW_MORNING, 'Morning digest'),
        (PUSH_DIGEST_WINDOW_EVENING, 'Evening digest'),
    )

    user = models.OneToOneField('auth.User', on_delete=models.CASCADE, related_name='notification_preferences')
    email_pre_deliverable_reminders = models.BooleanField(default=False)
    reminder_days_before = models.PositiveIntegerField(default=1)
    daily_digest = models.BooleanField(default=False)
    web_push_enabled = models.BooleanField(default=False)
    push_pre_deliverable_reminders = models.BooleanField(default=False)
    push_daily_digest = models.BooleanField(default=False)
    push_assignment_changes = models.BooleanField(default=False)
    push_deliverable_date_changes = models.BooleanField(default=False)
    push_rate_limit_enabled = models.BooleanField(default=True)
    push_weekend_mute = models.BooleanField(default=False)
    push_quiet_hours_enabled = models.BooleanField(default=False)
    push_quiet_hours_start = models.PositiveSmallIntegerField(
        default=22,
        validators=[MinValueValidator(0), MaxValueValidator(23)],
    )
    push_quiet_hours_end = models.PositiveSmallIntegerField(
        default=7,
        validators=[MinValueValidator(0), MaxValueValidator(23)],
    )
    push_digest_window = models.CharField(
        max_length=20,
        choices=PUSH_DIGEST_WINDOW_CHOICES,
        default=PUSH_DIGEST_WINDOW_INSTANT,
    )
    push_digest_window_enabled = models.BooleanField(default=True)
    push_timezone = models.CharField(max_length=64, blank=True, default='')
    push_snooze_enabled = models.BooleanField(default=True)
    push_snooze_until = models.DateTimeField(null=True, blank=True)
    push_actions_enabled = models.BooleanField(default=True)
    push_deep_links_enabled = models.BooleanField(default=True)
    push_subscription_cleanup_enabled = models.BooleanField(default=True)
    notification_channel_matrix = models.JSONField(default=default_user_notification_channel_matrix, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:  # pragma: no cover
        return f"NotifPrefs({self.user_id})"


class WebPushGlobalSettings(models.Model):
    """Singleton runtime controls for web push delivery."""

    DELIVERABLE_SCOPE_NEXT_UPCOMING = 'next_upcoming'
    DELIVERABLE_SCOPE_ALL_UPCOMING = 'all_upcoming'
    DELIVERABLE_SCOPE_CHOICES = (
        (DELIVERABLE_SCOPE_NEXT_UPCOMING, 'Next upcoming deliverable only'),
        (DELIVERABLE_SCOPE_ALL_UPCOMING, 'All upcoming deliverables'),
    )

    key = models.CharField(max_length=20, default='default', unique=True)
    enabled = models.BooleanField(default=True)
    push_rate_limit_enabled = models.BooleanField(default=True)
    push_rate_limit_per_hour = models.PositiveSmallIntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(50)],
    )
    push_weekend_mute_enabled = models.BooleanField(default=True)
    push_quiet_hours_enabled = models.BooleanField(default=True)
    push_snooze_enabled = models.BooleanField(default=True)
    push_digest_window_enabled = models.BooleanField(default=True)
    push_actions_enabled = models.BooleanField(default=True)
    push_deep_links_enabled = models.BooleanField(default=True)
    push_subscription_healthcheck_enabled = models.BooleanField(default=True)
    push_pre_deliverable_reminders_enabled = models.BooleanField(default=True)
    push_daily_digest_enabled = models.BooleanField(default=True)
    push_assignment_changes_enabled = models.BooleanField(default=True)
    push_deliverable_date_changes_enabled = models.BooleanField(default=True)
    push_deliverable_date_change_scope = models.CharField(
        max_length=20,
        choices=DELIVERABLE_SCOPE_CHOICES,
        default=DELIVERABLE_SCOPE_NEXT_UPCOMING,
    )
    push_deliverable_date_change_within_two_weeks_only = models.BooleanField(default=False)
    notification_channel_matrix = models.JSONField(default=default_notification_channel_matrix, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']
        verbose_name = 'Web Push Global Settings'

    def __str__(self) -> str:  # pragma: no cover
        return f"WebPushGlobalSettings({self.key})"

    @classmethod
    def get_active(cls):
        class _LegacyDefaults:
            push_pre_deliverable_reminders_enabled = bool(getattr(settings, 'WEB_PUSH_REMINDER_EVENTS_ENABLED', True))
            push_daily_digest_enabled = bool(getattr(settings, 'WEB_PUSH_REMINDER_EVENTS_ENABLED', True))
            push_assignment_changes_enabled = bool(getattr(settings, 'WEB_PUSH_ASSIGNMENT_EVENTS_ENABLED', True))
            push_deliverable_date_changes_enabled = bool(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_EVENTS_ENABLED', True))

        legacy_default_matrix = legacy_global_matrix_from_settings(_LegacyDefaults())
        obj, _ = cls.objects.get_or_create(
            key='default',
            defaults={
                'enabled': bool(getattr(settings, 'WEB_PUSH_ENABLED', True)),
                'push_rate_limit_enabled': bool(getattr(settings, 'WEB_PUSH_RATE_LIMIT_ENABLED', True)),
                'push_rate_limit_per_hour': int(getattr(settings, 'WEB_PUSH_RATE_LIMIT_PER_HOUR', 3) or 3),
                'push_weekend_mute_enabled': bool(getattr(settings, 'WEB_PUSH_WEEKEND_MUTE_ENABLED', True)),
                'push_quiet_hours_enabled': bool(getattr(settings, 'WEB_PUSH_QUIET_HOURS_ENABLED', True)),
                'push_snooze_enabled': bool(getattr(settings, 'WEB_PUSH_SNOOZE_ENABLED', True)),
                'push_digest_window_enabled': bool(getattr(settings, 'WEB_PUSH_DIGEST_WINDOW_ENABLED', True)),
                'push_actions_enabled': bool(getattr(settings, 'WEB_PUSH_ACTIONS_ENABLED', True)),
                'push_deep_links_enabled': bool(getattr(settings, 'WEB_PUSH_DEEP_LINKS_ENABLED', True)),
                'push_subscription_healthcheck_enabled': bool(getattr(settings, 'WEB_PUSH_SUBSCRIPTION_HEALTHCHECK_ENABLED', True)),
                'push_pre_deliverable_reminders_enabled': bool(getattr(settings, 'WEB_PUSH_REMINDER_EVENTS_ENABLED', True)),
                'push_daily_digest_enabled': bool(getattr(settings, 'WEB_PUSH_REMINDER_EVENTS_ENABLED', True)),
                'push_assignment_changes_enabled': bool(getattr(settings, 'WEB_PUSH_ASSIGNMENT_EVENTS_ENABLED', True)),
                'push_deliverable_date_changes_enabled': bool(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_EVENTS_ENABLED', True)),
                'push_deliverable_date_change_scope': str(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_SCOPE', cls.DELIVERABLE_SCOPE_NEXT_UPCOMING) or cls.DELIVERABLE_SCOPE_NEXT_UPCOMING),
                'push_deliverable_date_change_within_two_weeks_only': bool(getattr(settings, 'WEB_PUSH_DELIVERABLE_DATE_CHANGE_WITHIN_TWO_WEEKS_ONLY', False)),
                'notification_channel_matrix': legacy_default_matrix,
            },
        )
        if obj.push_deliverable_date_change_scope not in {
            cls.DELIVERABLE_SCOPE_NEXT_UPCOMING,
            cls.DELIVERABLE_SCOPE_ALL_UPCOMING,
        }:
            obj.push_deliverable_date_change_scope = cls.DELIVERABLE_SCOPE_NEXT_UPCOMING
            obj.save(update_fields=['push_deliverable_date_change_scope', 'updated_at'])
        normalized_rate = max(1, min(50, int(getattr(obj, 'push_rate_limit_per_hour', 3) or 3)))
        if int(getattr(obj, 'push_rate_limit_per_hour', 3) or 3) != normalized_rate:
            obj.push_rate_limit_per_hour = normalized_rate
            obj.save(update_fields=['push_rate_limit_per_hour', 'updated_at'])
        normalized_matrix = normalize_notification_channel_matrix(
            getattr(obj, 'notification_channel_matrix', None),
            fallback=legacy_global_matrix_from_settings(obj),
        )
        if normalized_matrix != (getattr(obj, 'notification_channel_matrix', None) or {}):
            obj.notification_channel_matrix = normalized_matrix
            obj.save(update_fields=['notification_channel_matrix', 'updated_at'])
        return obj


class WebPushVapidKeys(models.Model):
    """Singleton encrypted storage for web push VAPID keys."""

    key = models.CharField(max_length=20, default='default', unique=True)
    encrypted_public_key = models.BinaryField(default=b'', blank=True)
    encrypted_private_key = models.BinaryField(default=b'', blank=True)
    subject = models.CharField(max_length=255, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']
        verbose_name = 'Web Push VAPID Keys'

    def __str__(self) -> str:  # pragma: no cover
        return f"WebPushVapidKeys({self.key})"

    @staticmethod
    def _cipher() -> Fernet:
        return _storage_cipher()

    @classmethod
    def get_active(cls):
        obj, _ = cls.objects.get_or_create(
            key='default',
            defaults={'subject': str(getattr(settings, 'WEB_PUSH_SUBJECT', '') or '').strip()},
        )
        return obj

    def set_values(self, *, public_key: str, private_key: str, subject: str) -> None:
        self.encrypted_public_key = self._cipher().encrypt(str(public_key).strip().encode('utf-8'))
        self.encrypted_private_key = self._cipher().encrypt(str(private_key).strip().encode('utf-8'))
        self.subject = str(subject).strip()
        self.save(update_fields=['encrypted_public_key', 'encrypted_private_key', 'subject', 'updated_at'])

    def _decrypt_value(self, value: bytes | memoryview | bytearray | None) -> str:
        if not value:
            return ''
        raw = self._cipher().decrypt(bytes(value))
        return raw.decode('utf-8')

    def get_public_key(self) -> str:
        try:
            return self._decrypt_value(self.encrypted_public_key)
        except Exception:
            return ''

    def get_private_key(self) -> str:
        try:
            return self._decrypt_value(self.encrypted_private_key)
        except Exception:
            return ''

    @property
    def configured(self) -> bool:
        return bool(self.get_public_key() and self.get_private_key() and str(self.subject or '').strip())


def default_in_app_notification_expiry():
    return timezone.now() + timedelta(days=7)


class InAppNotification(models.Model):
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='in_app_notifications')
    event_key = models.CharField(max_length=120)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default='')
    url = models.CharField(max_length=500, blank=True, default='/')
    payload = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    cleared_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(default=default_in_app_notification_expiry)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['user', 'cleared_at', 'created_at'], name='idx_inapp_user_clear'),
            models.Index(fields=['user', 'read_at', 'created_at'], name='idx_inapp_user_read'),
            models.Index(fields=['expires_at'], name='idx_inapp_expires'),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"InAppNotification(user={self.user_id}, event={self.event_key})"


class EmailNotificationDigestItem(models.Model):
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='email_notification_digest_items')
    event_key = models.CharField(max_length=120)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True, default='')
    url = models.CharField(max_length=500, blank=True, default='/')
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(fields=['user', 'sent_at', 'created_at'], name='idx_emaildig_user_sent'),
            models.Index(fields=['sent_at', 'created_at'], name='idx_emaildig_sent'),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"EmailNotificationDigestItem(user={self.user_id}, event={self.event_key})"


class NotificationLog(models.Model):
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE)
    pre_deliverable_item = models.ForeignKey('deliverables.PreDeliverableItem', null=True, on_delete=models.SET_NULL)
    notification_type = models.CharField(max_length=20)
    sent_at = models.DateTimeField()
    email_subject = models.CharField(max_length=200)
    success = models.BooleanField(default=True)

    class Meta:
        ordering = ['-sent_at']


class WebPushSubscription(models.Model):
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='web_push_subscriptions')
    endpoint = models.TextField(unique=True)
    p256dh = models.TextField()
    auth = models.TextField()
    expiration_time = models.BigIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-id']
        indexes = [
            models.Index(fields=['user', 'is_active'], name='idx_push_sub_user_active'),
            models.Index(fields=['is_active', 'updated_at'], name='idx_push_sub_active_updated'),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"WebPushSubscription({self.user_id}, active={self.is_active})"


class WebPushProjectMute(models.Model):
    """User-scoped temporary mute settings for project-specific push events."""

    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='web_push_project_mutes')
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='web_push_user_mutes')
    muted_until = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-muted_until', '-id']
        unique_together = [['user', 'project']]
        indexes = [
            models.Index(fields=['user', 'muted_until'], name='idx_push_mute_user_until'),
            models.Index(fields=['project', 'muted_until'], name='idx_push_mute_proj_until'),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"WebPushProjectMute(user={self.user_id}, project={self.project_id})"


class WebPushDeferredNotification(models.Model):
    """Deferred non-urgent push events used for digest windows and bundling."""

    REASON_QUIET_HOURS = 'quiet_hours'
    REASON_WEEKEND = 'weekend'
    REASON_SNOOZE = 'snooze'
    REASON_RATE_LIMIT = 'rate_limit'
    REASON_DIGEST_WINDOW = 'digest_window'
    REASON_CHOICES = (
        (REASON_QUIET_HOURS, 'Quiet hours'),
        (REASON_WEEKEND, 'Weekend mute'),
        (REASON_SNOOZE, 'Snoozed'),
        (REASON_RATE_LIMIT, 'Rate limited'),
        (REASON_DIGEST_WINDOW, 'Digest window'),
    )

    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='deferred_web_push_notifications')
    event_type = models.CharField(max_length=120, blank=True, default='')
    project_id = models.IntegerField(null=True, blank=True)
    reason = models.CharField(max_length=40, choices=REASON_CHOICES)
    payload = models.JSONField(default=dict)
    deliver_after = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['deliver_after', 'id']
        indexes = [
            models.Index(fields=['deliver_after'], name='idx_push_def_deliver_after'),
            models.Index(fields=['user', 'deliver_after'], name='idx_push_def_user_deliver'),
            models.Index(fields=['project_id', 'deliver_after'], name='idx_push_def_project_deliver'),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"WebPushDeferredNotification(user={self.user_id}, reason={self.reason})"


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

    full_capacity_hours = models.PositiveIntegerField(default=36)

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
        if self.full_capacity_hours < 1:
            raise ValidationError('Full capacity hours must be >= 1')

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
                full_capacity_hours=36,
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


class JobAccessRecord(models.Model):
    """Ownership/access metadata for user-facing async jobs."""

    job_id = models.CharField(max_length=255, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='owned_job_access_records',
    )
    is_admin_only = models.BooleanField(default=False)
    purpose = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['created_by']),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError('JobAccessRecord is immutable once created')
        super().save(*args, **kwargs)
