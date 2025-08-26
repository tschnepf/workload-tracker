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
        ('on_hold', 'On Hold'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ], default='active')
    client = models.CharField(max_length=100, blank=True, default='Internal')
    description = models.TextField(blank=True)
    
    # Dates (optional, add when needed)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    estimated_hours = models.IntegerField(blank=True, null=True)
    
    # Metadata for future expansion
    project_number = models.CharField(max_length=50, blank=True, unique=True, null=True)
    
    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at', 'name']
    
    def __str__(self):
        return self.name