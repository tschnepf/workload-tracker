"""
Person model - Complete schema from Day 1, use progressively.
All fields defined but only some used initially.
"""

from django.db import models

class Person(models.Model):
    """Complete person model - all fields from Day 1, use progressively"""
    
    # === CORE FIELDS (Required, used from Chunk 2) ===
    name = models.CharField(max_length=200)  # ONLY required field for users
    weekly_capacity = models.IntegerField(default=36)
    role = models.CharField(max_length=100, default='Engineer')
    
    # === CONTACT FIELDS (Optional, used from Chunk 4) ===
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    location = models.CharField(max_length=100, blank=True, null=True)
    
    # === EMPLOYMENT FIELDS (Optional, used from Chunk 6) ===
    hire_date = models.DateField(blank=True, null=True)
    department = models.ForeignKey(
        'departments.Department', 
        on_delete=models.SET_NULL, 
        blank=True, 
        null=True,
        related_name='people'
    )
    
    # === METADATA (Optional, future expansion) ===
    notes = models.TextField(blank=True)
    
    # === SYSTEM FIELDS (Automatic) ===
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
        verbose_name_plural = 'People'
    
    def __str__(self):
        return self.name
    
    def get_current_utilization(self):
        """Calculate current utilization - implement in Chunk 3"""
        active_assignments = self.assignments.filter(is_active=True)
        total_allocation = sum(a.allocation_percentage for a in active_assignments)
        return {
            'total_percentage': total_allocation,
            'allocated_hours': (self.weekly_capacity * total_allocation) / 100,
            'available_hours': self.weekly_capacity - ((self.weekly_capacity * total_allocation) / 100),
            'is_overallocated': total_allocation > 100
        }
    
    @property
    def is_available(self):
        """Check availability - implement in Chunk 4"""
        return self.get_current_utilization()['total_percentage'] < 100