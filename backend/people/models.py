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
        """Calculate current utilization based on weekly hours (RETROFIT)"""
        from datetime import datetime, timedelta
        
        active_assignments = self.assignments.filter(is_active=True)
        
        # Get current week (Sunday)
        today = datetime.now().date()
        current_sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        current_week_key = current_sunday.strftime('%Y-%m-%d')
        
        # Calculate total hours for current week across all assignments
        total_allocated_hours = 0
        assignment_details = []
        
        for assignment in active_assignments:
            week_hours = assignment.weekly_hours.get(current_week_key, 0) if assignment.weekly_hours else 0
            total_allocated_hours += week_hours
            
            if week_hours > 0:
                assignment_details.append({
                    'project_name': assignment.project_name,
                    'weekly_hours': week_hours,
                    'allocation_percentage': min(100, (week_hours / self.weekly_capacity * 100)) if self.weekly_capacity > 0 else 0
                })
        
        # Calculate percentage and availability
        total_percentage = (total_allocated_hours / self.weekly_capacity * 100) if self.weekly_capacity > 0 else 0
        available_hours = max(0, self.weekly_capacity - total_allocated_hours)
        
        return {
            'total_percentage': round(total_percentage, 1),
            'allocated_hours': total_allocated_hours,
            'available_hours': available_hours,
            'is_overallocated': total_allocated_hours > self.weekly_capacity,
            'current_week': current_week_key,
            'assignments': assignment_details
        }
    
    @property
    def is_available(self):
        """Check availability based on current week hours"""
        return self.get_current_utilization()['allocated_hours'] < self.weekly_capacity