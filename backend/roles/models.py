"""
Role model for managing job roles in the organization.
"""

from django.db import models
from django.core.exceptions import ValidationError


class Role(models.Model):
    """Role model for organizing job roles with validation"""
    
    name = models.CharField(
        max_length=100, 
        unique=True,
        help_text="Role name (e.g., Senior Engineer, Product Manager)"
    )
    description = models.TextField(
        blank=True,
        help_text="Optional description of the role responsibilities"
    )
    # User-controlled ordering for display
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this role is currently available for assignment"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['sort_order', 'name', 'id']
        verbose_name = 'Role'
        verbose_name_plural = 'Roles'
    
    def __str__(self):
        return self.name
    
    def clean(self):
        """Custom validation for role names"""
        if self.name:
            # Strip whitespace and ensure proper capitalization
            self.name = self.name.strip()
            
            # Validate name is not empty after stripping
            if not self.name:
                raise ValidationError({'name': 'Role name cannot be empty or only whitespace.'})
            
            # Check for reasonable length
            if len(self.name) > 100:
                raise ValidationError({'name': 'Role name cannot exceed 100 characters.'})
    
    def save(self, *args, **kwargs):
        """Override save to run validation"""
        self.clean()
        super().save(*args, **kwargs)
    
    @property
    def people_count(self):
        """Return count of people assigned to this role"""
        return self.people.filter(is_active=True).count()
