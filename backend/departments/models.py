"""
Department model - Create Day 1, populate Chunk 6.
"""

from django.db import models
from django.core.exceptions import ValidationError

class Department(models.Model):
    """Department model - create Day 1, populate Chunk 6"""
    
    name = models.CharField(max_length=100, unique=True)
    short_name = models.CharField(max_length=32, blank=True, default='')
    parent_department = models.ForeignKey('self', on_delete=models.SET_NULL, blank=True, null=True)
    vertical = models.ForeignKey('verticals.Vertical', on_delete=models.PROTECT, blank=True, null=True, related_name='departments')
    manager = models.ForeignKey('people.Person', on_delete=models.SET_NULL, blank=True, null=True, related_name='managed_departments')
    description = models.TextField(blank=True)
    
    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['vertical'], name='idx_department_vertical'),
        ]
    
    def clean(self):
        """Validate department hierarchy to prevent circular references"""
        super().clean()

        if self.parent_department:
            # Enforce vertical inheritance from parent
            parent_vertical = getattr(self.parent_department, 'vertical', None)
            if parent_vertical is None:
                if self.vertical is not None:
                    raise ValidationError("Child department must inherit parent's vertical (parent has none).")
            else:
                if self.vertical is None:
                    self.vertical = parent_vertical
                elif self.vertical_id != self.parent_department.vertical_id:
                    raise ValidationError("Child department must inherit parent's vertical.")

            # Check for direct circular reference (department as its own parent)
            if self.parent_department == self:
                raise ValidationError("Department cannot be its own parent.")
            
            # Check for indirect circular references (walk up the hierarchy)
            current = self.parent_department
            visited_departments = {self.pk} if self.pk else set()
            
            while current:
                if current.pk in visited_departments:
                    raise ValidationError(
                        f"Circular reference detected: {self.name} cannot have "
                        f"{self.parent_department.name} as parent as it would create a cycle."
                    )
                
                visited_departments.add(current.pk)
                current = current.parent_department
                
                # Safety check to prevent infinite loops (max depth of 10)
                if len(visited_departments) > 10:
                    raise ValidationError("Department hierarchy is too deep (maximum 10 levels).")

    def save(self, *args, **kwargs):
        """Override save to run validation"""
        prev_vertical_id = None
        if self.pk:
            try:
                prev_vertical_id = Department.objects.filter(pk=self.pk).values_list('vertical_id', flat=True).first()
            except Exception:
                prev_vertical_id = None
        # Enforce vertical inheritance from parent if present
        if self.parent_department:
            try:
                self.vertical = self.parent_department.vertical
            except Exception:
                pass
        self.clean()
        super().save(*args, **kwargs)

        # If this department's vertical changed, propagate to descendants
        if self.pk and prev_vertical_id != self.vertical_id:
            try:
                descendants = set()
                stack = [self.pk]
                while stack:
                    current = stack.pop()
                    for child_id in Department.objects.filter(parent_department_id=current).values_list('id', flat=True):
                        if child_id in descendants:
                            continue
                        descendants.add(child_id)
                        stack.append(child_id)
                if descendants:
                    Department.objects.filter(id__in=descendants).update(vertical=self.vertical)
            except Exception:
                pass

    def __str__(self):
        return self.name
