"""
Vertical model - parent classification for departments and projects.
"""

from django.db import models


class Vertical(models.Model):
    """Vertical model"""

    name = models.CharField(max_length=100, unique=True)
    short_name = models.CharField(max_length=32, blank=True, default='')
    description = models.TextField(blank=True)
    task_tracking_enabled = models.BooleanField(default=True)

    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
