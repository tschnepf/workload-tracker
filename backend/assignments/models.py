"""
Assignment model - The heart of workload tracking.
"""

from django.db import models

class Assignment(models.Model):
    """Assignment model - the heart of workload tracking"""
    
    person = models.ForeignKey('people.Person', on_delete=models.CASCADE, related_name='assignments')
    
    # === FLEXIBLE PROJECT REFERENCE (Migration-safe) ===
    # Chunk 1-2: Use project_name only
    # Chunk 5: Migrate to project FK, keep project_name as backup
    project_name = models.CharField(max_length=200, blank=True, null=True)
    
    # === ALLOCATION (Core feature) ===
    allocation_percentage = models.IntegerField(default=100)
    
    # === OPTIONAL DETAILS (Add usage per chunk) ===
    role_on_project = models.CharField(max_length=100, blank=True, null=True)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    notes = models.TextField(blank=True)
    
    # === SYSTEM FIELDS ===
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        project_display = self.project_name or "Unknown Project"
        return f"{self.person.name} on {project_display} ({self.allocation_percentage}%)"
    
    # === BUSINESS LOGIC ===
    @property
    def weekly_hours(self):
        """Calculate weekly hours based on person's capacity"""
        return (self.person.weekly_capacity * self.allocation_percentage) / 100
    
    @property
    def project_display(self):
        """Handle both string and FK projects gracefully"""
        return self.project_name or "Unknown Project"