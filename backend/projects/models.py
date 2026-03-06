"""
Project model - Complete schema from Day 1, migrate to in Chunk 5.
"""

from django.db import models
from django.conf import settings
from django.utils import timezone
from django.utils.text import slugify
from django.core.validators import MinValueValidator, MaxValueValidator
import os

from .storage import RiskAttachmentStorage


class ProjectStatusDefinition(models.Model):
    key = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=80)
    color_hex = models.CharField(max_length=7, default='#64748b')
    include_in_analytics = models.BooleanField(default=False)
    treat_as_ca_when_no_deliverable = models.BooleanField(default=False)
    is_system = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'label', 'key']
        indexes = [
            models.Index(fields=['is_active', 'sort_order'], name='proj_status_active_sort_idx'),
            models.Index(fields=['include_in_analytics'], name='proj_status_include_ana_idx'),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.label} ({self.key})"

    def save(self, *args, **kwargs):  # pragma: no cover
        self.key = (self.key or '').strip().lower()
        self.label = (self.label or '').strip() or self.key.replace('_', ' ').title()
        super().save(*args, **kwargs)
        try:
            from .status_definitions import clear_status_definitions_cache
            clear_status_definitions_cache()
        except Exception:
            pass

    def delete(self, *args, **kwargs):  # pragma: no cover
        super().delete(*args, **kwargs)
        try:
            from .status_definitions import clear_status_definitions_cache
            clear_status_definitions_cache()
        except Exception:
            pass


class Project(models.Model):
    """Project model - create Day 1, migrate to in Chunk 5"""
    
    name = models.CharField(max_length=200)
    
    # Basic project info (use from Chunk 5)
    status = models.CharField(max_length=64, default='active')
    client = models.CharField(max_length=100, blank=True, default='Internal')
    description = models.TextField(blank=True)
    # Denormalized searchable text of assigned people names (for fast project search)
    assigned_names_text = models.TextField(blank=True, default='')
    # Rich text scratch pad / notes (HTML stored as text)
    notes = models.TextField(blank=True)
    # Canonical TipTap ProseMirror JSON representation
    notes_json = models.JSONField(blank=True, null=True)
    
    # Dates (optional, add when needed)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    estimated_hours = models.IntegerField(blank=True, null=True)
    
    # Metadata for future expansion
    project_number = models.CharField(max_length=50, blank=True, unique=True, null=True)

    # Integrations metadata
    bqe_client_name = models.CharField(max_length=255, blank=True, null=True)
    bqe_client_id = models.CharField(max_length=128, blank=True, null=True)
    client_sync_policy_state = models.CharField(max_length=32, blank=True, default='preserve_local')
    vertical = models.ForeignKey(
        'verticals.Vertical',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='projects',
    )

    # System fields
    is_active = models.BooleanField(default=True)
    auto_hours_template = models.ForeignKey(
        'core.AutoHoursTemplate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='projects',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', 'name']
        indexes = [
            models.Index(fields=['is_active', 'status'], name='project_active_status_idx'),
            models.Index(fields=['updated_at'], name='project_updated_idx'),
            models.Index(fields=['is_active', 'updated_at'], name='project_active_updated_idx'),
            models.Index(fields=['client', 'name'], name='projects_client_name_idx'),
            models.Index(fields=['bqe_client_id'], name='idx_project_bqe_client_id'),
            models.Index(fields=['bqe_client_name'], name='idx_project_bqe_client_name'),
            models.Index(fields=['vertical'], name='idx_project_vertical'),
        ]
    
    def __str__(self):
        return self.name


class ProjectChangeLog(models.Model):
    """Project-level change log entries for key events (deliverables, assignments, etc.)."""

    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='change_logs')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='project_change_logs',
    )
    action = models.CharField(max_length=100)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project', 'created_at'], name='idx_pcl_proj_created'),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.created_at:%Y-%m-%d %H:%M:%S} {self.action} (project {self.project_id})"


class ProjectPreDeliverableSettings(models.Model):
    """Per-project customization of pre-deliverable generation rules."""

    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='pre_deliverable_settings')
    pre_deliverable_type = models.ForeignKey('deliverables.PreDeliverableType', on_delete=models.CASCADE)
    days_before = models.PositiveIntegerField()
    is_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [['project', 'pre_deliverable_type']]
        ordering = ['project__name', 'pre_deliverable_type__sort_order']
        verbose_name = 'Project Pre-Deliverable Setting'

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.project.name} - {self.pre_deliverable_type.name}"

    @classmethod
    def get_project_settings(cls, project_instance: 'Project'):
        """Return dict mapping pre_deliverable_type_id -> settings for the project.

        Shape: { type_id: { 'days_before': int, 'is_enabled': bool, 'type_name': str } }
        """
        settings = {}
        qs = (
            cls.objects.filter(project=project_instance)
            .select_related('pre_deliverable_type')
        )
        for setting in qs:
            settings[setting.pre_deliverable_type.id] = {
                'days_before': setting.days_before,
                'is_enabled': setting.is_enabled,
                'type_name': setting.pre_deliverable_type.name,
            }
        return settings


class ProjectTaskScope(models.TextChoices):
    PROJECT = 'project', 'Project'
    DELIVERABLE = 'deliverable', 'Deliverable'


class TaskCompletionMode(models.TextChoices):
    PERCENT = 'percent', '0-100 Percent'
    BINARY = 'binary', 'Complete/Incomplete'


class ProjectTaskTemplate(models.Model):
    vertical = models.ForeignKey(
        'verticals.Vertical',
        on_delete=models.CASCADE,
        related_name='project_task_templates',
    )
    scope = models.CharField(max_length=20, choices=ProjectTaskScope.choices)
    department = models.ForeignKey(
        'departments.Department',
        on_delete=models.PROTECT,
        related_name='project_task_templates',
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    completion_mode = models.CharField(
        max_length=20,
        choices=TaskCompletionMode.choices,
        default=TaskCompletionMode.PERCENT,
    )
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['vertical_id', 'scope', 'sort_order', 'id']
        indexes = [
            models.Index(fields=['vertical', 'scope', 'is_active'], name='proj_task_tpl_vsi_idx'),
            models.Index(fields=['department', 'scope'], name='proj_task_tpl_dept_scope_idx'),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.vertical.name} · {self.scope} · {self.name}"


class ProjectTask(models.Model):
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='project_tasks',
    )
    deliverable = models.ForeignKey(
        'deliverables.Deliverable',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='project_tasks',
    )
    template = models.ForeignKey(
        'projects.ProjectTaskTemplate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='project_tasks',
    )
    scope = models.CharField(max_length=20, choices=ProjectTaskScope.choices)
    department = models.ForeignKey(
        'departments.Department',
        on_delete=models.PROTECT,
        related_name='project_tasks',
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    completion_mode = models.CharField(
        max_length=20,
        choices=TaskCompletionMode.choices,
        default=TaskCompletionMode.PERCENT,
    )
    completion_percent = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    assignees = models.ManyToManyField(
        'people.Person',
        blank=True,
        related_name='project_tasks',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['project_id', 'scope', 'deliverable_id', 'department_id', 'id']
        indexes = [
            models.Index(fields=['project', 'scope'], name='proj_task_project_scope_idx'),
            models.Index(fields=['project', 'deliverable'], name='proj_task_project_deliv_idx'),
            models.Index(fields=['department', 'scope'], name='proj_task_dept_scope_idx'),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(completion_percent__gte=0, completion_percent__lte=100),
                name='proj_task_percent_range',
            ),
            models.CheckConstraint(
                check=models.Q(completion_percent__in=tuple(range(0, 101, 5))),
                name='proj_task_percent_step_5',
            ),
            models.CheckConstraint(
                check=(
                    (models.Q(scope=ProjectTaskScope.PROJECT) & models.Q(deliverable__isnull=True))
                    | (models.Q(scope=ProjectTaskScope.DELIVERABLE) & models.Q(deliverable__isnull=False))
                ),
                name='proj_task_scope_deliverable_consistency',
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.project.name} · {self.name}"


class ProjectRole(models.Model):
    """Department-scoped project role catalog.

    Roles are unique per department by a normalized name key. Use
    `is_active` to soft-hide roles while preserving historical references.
    `sort_order` controls display ordering in UIs.
    """

    name = models.CharField(max_length=100)
    normalized_name = models.CharField(max_length=120)
    department = models.ForeignKey('departments.Department', on_delete=models.CASCADE, related_name='department_project_roles')
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            # Enforce uniqueness per department on normalized name
            models.UniqueConstraint(fields=['department', 'normalized_name'], name='uniq_projectrole_dept_normname'),
            # Allow composite FK from Assignment (role_on_project_id, department_id)
            models.UniqueConstraint(fields=['id', 'department'], name='uniq_projectrole_id_department'),
        ]
        indexes = [
            models.Index(fields=['department', 'is_active', 'sort_order'], name='idx_pr_dept_act_sort'),
            models.Index(fields=['normalized_name'], name='idx_projectrole_normname'),
        ]
        ordering = ['department_id', 'sort_order', 'name']

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.name} (dept {self.department_id})"

    def save(self, *args, **kwargs):  # pragma: no cover
        # Normalize: trim, collapse whitespace, lowercase
        norm = ' '.join((self.name or '').strip().split()).lower()
        self.normalized_name = norm
        super().save(*args, **kwargs)


def risk_attachment_upload_to(instance: 'ProjectRisk', filename: str) -> str:
    base = os.path.basename(filename or '')
    name, ext = os.path.splitext(base)
    safe_base = slugify(name) or 'attachment'
    safe_ext = (ext or '')[:10].lower()
    ts = timezone.now().strftime('%Y%m%d_%H%M%S')
    return f"project_risks/{instance.project_id}/{ts}_{safe_base}{safe_ext}"


class ProjectRisk(models.Model):
    PRIORITY_CHOICES = [
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
    ]
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('closed', 'Closed'),
    ]
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='risks')
    description = models.TextField()
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open')
    departments = models.ManyToManyField('departments.Department', related_name='risk_entries', blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_project_risks',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='updated_project_risks',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    attachment = models.FileField(
        upload_to=risk_attachment_upload_to,
        storage=RiskAttachmentStorage(),
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project', 'created_at'], name='idx_prisk_proj_created'),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"Risk({self.project_id}) {self.description[:50]}"


class ProjectRiskEdit(models.Model):
    ACTION_CHOICES = [
        ('created', 'Created'),
        ('updated', 'Updated'),
    ]
    risk = models.ForeignKey('projects.ProjectRisk', on_delete=models.CASCADE, related_name='edits')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='project_risk_edits',
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['risk', 'created_at'], name='idx_priskedit_risk_created'),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"RiskEdit({self.risk_id}, {self.action})"
