"""
Deliverable model - Flexible milestone/deliverable tracking for projects
STANDARDS COMPLIANT: Follows R2-REBUILD-STANDARDS.md naming conventions
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError


class Deliverable(models.Model):
    """Flexible milestone/deliverable tracking for projects"""
    
    # REQUIRED - Link to project
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='deliverables')
    
    # ALL OPTIONAL FIELDS - Use any combination (per proj_deliverables_description.txt)
    percentage = models.IntegerField(
        blank=True, 
        null=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Completion percentage (0-100)"
    )
    
    description = models.CharField(
        max_length=200, 
        blank=True,
        help_text="Brief description (e.g., SD, DD, IFP, IFC)"
    )
    
    date = models.DateField(
        blank=True, 
        null=True,
        help_text="Target or actual date - can be removed if project on hold"
    )
    
    notes = models.TextField(
        blank=True,
        help_text="Additional details, owner info, requirements, etc."
    )
    
    # MANUAL ORDERING - For custom sort control
    sort_order = models.IntegerField(
        default=0,
        help_text="Lower numbers appear first"
    )
    
    # STATUS - Track completion
    is_completed = models.BooleanField(
        default=False,
        help_text="Mark when deliverable is done"
    )
    
    completed_date = models.DateField(
        blank=True,
        null=True,
        help_text="When it was actually completed"
    )
    
    # SYSTEM FIELDS - Automatic
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['sort_order', 'percentage', 'date', 'created_at']
        
    def clean(self):
        """Optional validation - all fields truly optional per requirements"""
        # NOTE: Per proj_deliverables_description.txt, all fields should be optional
        # Validation removed to allow maximum flexibility
        pass
    
    def __str__(self):
        parts = []
        if self.percentage is not None:
            parts.append(f"{self.percentage}%")
        if self.description:
            parts.append(self.description)
        if self.date:
            parts.append(str(self.date))
        return " - ".join(parts) if parts else f"Deliverable #{self.id}"


class DeliverableAssignment(models.Model):
    """Link a deliverable (milestone) to a person with weekly hours."""

    deliverable = models.ForeignKey(
        'deliverables.Deliverable',
        on_delete=models.CASCADE,
        related_name='assignments',
    )
    person = models.ForeignKey(
        'people.Person',
        on_delete=models.CASCADE,
        related_name='deliverable_assignments',
    )
    role_on_milestone = models.CharField(max_length=100, blank=True, null=True)

    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"DeliverableAssignment(d={self.deliverable_id}, p={self.person_id})"


class ReallocationAudit(models.Model):
    """Persist a compact snapshot of an auto-reallocation operation.

    Stores minimal before/after diffs for touched assignments and metadata
    to enable observability and optional undo.
    """

    deliverable = models.ForeignKey('deliverables.Deliverable', on_delete=models.CASCADE, related_name='reallocation_audits')
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='reallocation_audits')
    user_id = models.IntegerField(blank=True, null=True)
    old_date = models.DateField()
    new_date = models.DateField()
    delta_weeks = models.IntegerField(default=0)
    assignments_changed = models.IntegerField(default=0)
    touched_week_keys = models.JSONField(default=list)
    # Map[assignment_id] -> { prev: {weekKey: int}, next: {weekKey: int} }
    snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f"ReallocAudit(d={self.deliverable_id}, dw={self.delta_weeks}, changed={self.assignments_changed})"


class PreDeliverableType(models.Model):
    """Types of pre-deliverable items automatically generated ahead of milestones.

    Examples: Specification TOC, Specifications, Model Delivery, Sheet List
    """

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    default_days_before = models.IntegerField(validators=[MinValueValidator(1)])
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Pre-Deliverable Type'
        verbose_name_plural = 'Pre-Deliverable Types'

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.name


class PreDeliverableItem(models.Model):
    """Automatically generated pre-deliverable item linked to a parent deliverable."""

    deliverable = models.ForeignKey(
        'deliverables.Deliverable', on_delete=models.CASCADE, related_name='pre_items'
    )
    pre_deliverable_type = models.ForeignKey(
        'deliverables.PreDeliverableType', on_delete=models.CASCADE, related_name='items'
    )
    generated_date = models.DateField()
    days_before = models.PositiveIntegerField()
    is_completed = models.BooleanField(default=False)
    completed_date = models.DateField(blank=True, null=True)
    completed_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, blank=True, null=True, related_name='completed_pre_items'
    )
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['generated_date', 'deliverable__date']
        unique_together = [['deliverable', 'pre_deliverable_type']]
        verbose_name = 'Pre-Deliverable Item'
        verbose_name_plural = 'Pre-Deliverable Items'

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.display_name} ({self.generated_date})"

    @property
    def display_name(self) -> str:
        d = self.deliverable.description or 'Milestone'
        return f"{self.pre_deliverable_type.name} - {d}"

    @property
    def is_overdue(self) -> bool:
        from datetime import date as _date
        return (not self.is_completed) and (self.generated_date < _date.today())

    def get_assigned_people(self):
        """Return queryset of People assigned to the parent deliverable."""
        from people.models import Person
        link_qs = self.deliverable.assignments.select_related('person').filter(is_active=True)
        person_ids = list(link_qs.values_list('person_id', flat=True))
        return Person.objects.filter(id__in=person_ids)

    def mark_completed(self, user) -> None:
        from datetime import date as _date
        self.is_completed = True
        self.completed_date = _date.today()
        self.completed_by = user
        self.save(update_fields=['is_completed', 'completed_date', 'completed_by', 'updated_at'])
