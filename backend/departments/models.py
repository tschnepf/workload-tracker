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
    manager = models.ForeignKey('people.Person', on_delete=models.SET_NULL, blank=True, null=True, related_name='managed_departments')
    description = models.TextField(blank=True)
    
    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def clean(self):
        """Validate department hierarchy to prevent circular references"""
        super().clean()
        
        if self.parent_department:
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
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name
