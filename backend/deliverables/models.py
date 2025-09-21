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
