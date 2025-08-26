"""
Department model - Create Day 1, populate Chunk 6.
"""

from django.db import models

class Department(models.Model):
    """Department model - create Day 1, populate Chunk 6"""
    
    name = models.CharField(max_length=100, unique=True)
    parent_department = models.ForeignKey('self', on_delete=models.SET_NULL, blank=True, null=True)
    manager = models.ForeignKey('people.Person', on_delete=models.SET_NULL, blank=True, null=True, related_name='managed_departments')
    description = models.TextField(blank=True)
    
    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name