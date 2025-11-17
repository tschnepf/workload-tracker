"""
Project model - Complete schema from Day 1, migrate to in Chunk 5.
"""

from django.db import models

class Project(models.Model):
    """Project model - create Day 1, migrate to in Chunk 5"""
    
    name = models.CharField(max_length=200)
    
    # Basic project info (use from Chunk 5)
    status = models.CharField(max_length=20, choices=[
        ('planning', 'Planning'),
        ('active', 'Active'),
        ('active_ca', 'Active CA'),
        ('on_hold', 'On Hold'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('inactive', 'Inactive'),
    ], default='active')
    client = models.CharField(max_length=100, blank=True, default='Internal')
    description = models.TextField(blank=True)
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

    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', 'name']
        indexes = [
            models.Index(fields=['bqe_client_id'], name='idx_project_bqe_client_id'),
            models.Index(fields=['bqe_client_name'], name='idx_project_bqe_client_name'),
        ]
    
    def __str__(self):
        return self.name


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
