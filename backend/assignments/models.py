"""
Assignment model - The heart of workload tracking.
"""

from django.db import models
from django.utils import timezone
from datetime import datetime, timedelta
import json

class Assignment(models.Model):
    """Assignment model - the heart of workload tracking"""
    
    person = models.ForeignKey('people.Person', on_delete=models.CASCADE, related_name='assignments')
    
    # === FLEXIBLE PROJECT REFERENCE (Migration-safe) ===
    # Chunk 1-2: Use project_name only
    # Chunk 5: Migrate to project FK, keep project_name as backup
    project_name = models.CharField(max_length=200, blank=True, null=True)
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, blank=True, null=True)
    
    # === WEEKLY HOURS ALLOCATION (Retrofit from percentage) ===
    # Store hours per week as JSON: {"2024-08-25": 10, "2024-09-01": 8, ...}
    # Key format: "YYYY-MM-DD" for the Sunday of each week
    weekly_hours = models.JSONField(default=dict, help_text="Hours per week for 12-week period")
    
    # Legacy field - keep for migration compatibility
    allocation_percentage = models.IntegerField(default=0, help_text="Legacy percentage field")
    
    # === OPTIONAL DETAILS (Add usage per chunk) ===
    # New: department denormalization for constraints and scoping
    department = models.ForeignKey('departments.Department', on_delete=models.SET_NULL, blank=True, null=True, related_name='assignments')
    # New FK to departmental ProjectRole; keep legacy string for migration window only
    role_on_project_ref = models.ForeignKey('projects.ProjectRole', on_delete=models.PROTECT, blank=True, null=True, related_name='assignments')
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
        project_display = self.project_display
        total_hours = sum(self.weekly_hours.values()) if self.weekly_hours else 0
        return f"{self.person.name} on {project_display} ({total_hours}h total)"
    
    # === BUSINESS LOGIC ===
    @staticmethod
    def get_week_starting_sunday(date):
        """Get the Sunday date for the week containing the given date"""
        days_since_sunday = date.weekday() + 1  # Monday=0 -> 1, Sunday=6 -> 0
        if days_since_sunday == 7:  # Sunday
            days_since_sunday = 0
        sunday = date - timedelta(days=days_since_sunday)
        return sunday.strftime('%Y-%m-%d')
    
    @classmethod
    def get_next_12_weeks(cls, start_date=None):
        """Get list of Sunday dates for the next 12 weeks"""
        if start_date is None:
            start_date = timezone.now().date()
        
        week_sundays = []
        current_sunday = start_date - timedelta(days=(start_date.weekday() + 1) % 7)
        
        for i in range(12):
            week_sundays.append(current_sunday.strftime('%Y-%m-%d'))
            current_sunday += timedelta(days=7)
        
        return week_sundays
    
    def get_hours_for_week(self, week_sunday):
        """Get hours allocated for a specific week (Sunday date string)"""
        return self.weekly_hours.get(week_sunday, 0)
    
    def set_hours_for_week(self, week_sunday, hours):
        """Set hours for a specific week (integer, rounded up)."""
        if self.weekly_hours is None:
            self.weekly_hours = {}
        try:
            from math import ceil
            n = int(ceil(float(hours)))
        except Exception:
            n = 0
        self.weekly_hours[week_sunday] = max(0, n)
    
    @property
    def total_hours(self):
        """Total hours across all weeks"""
        return sum(self.weekly_hours.values()) if self.weekly_hours else 0
    
    @property
    def average_weekly_hours(self):
        """Average hours per week (non-zero weeks only)"""
        if not self.weekly_hours:
            return 0
        non_zero_weeks = [h for h in self.weekly_hours.values() if h > 0]
        return sum(non_zero_weeks) / len(non_zero_weeks) if non_zero_weeks else 0
    
    @property
    def project_display(self):
        """Handle both string and FK projects gracefully"""
        if self.project:
            return self.project.name
        return self.project_name or "Unknown Project"
