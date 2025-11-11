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
    role = models.ForeignKey(
        'roles.Role',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='people',
        help_text="Person's role in the organization"
    )
    
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
    
    def get_current_utilization_sunday(self):
        """Sunday-only current utilization based on weekly hours."""
        from datetime import datetime
        from core.week_utils import sunday_of_week

        active_assignments = self.assignments.filter(is_active=True)

        today = datetime.now().date()
        current_week_key = sunday_of_week(today).strftime('%Y-%m-%d')

        total_allocated_hours = 0.0
        assignment_details = []
        for assignment in active_assignments:
            wh = assignment.weekly_hours or {}
            try:
                v = float(wh.get(current_week_key) or 0)
            except Exception:
                v = 0.0
            total_allocated_hours += v
            if v > 0:
                assignment_details.append({
                    'project_name': assignment.project_name,
                    'weekly_hours': v,
                    'date_key_used': current_week_key,
                    'allocation_percentage': min(100, (v / self.weekly_capacity * 100)) if self.weekly_capacity > 0 else 0,
                })

        total_percentage = (total_allocated_hours / self.weekly_capacity * 100) if self.weekly_capacity > 0 else 0
        available_hours = max(0, (self.weekly_capacity or 0) - total_allocated_hours)

        return {
            'total_percentage': round(total_percentage, 1),
            'allocated_hours': round(total_allocated_hours, 1),
            'available_hours': round(available_hours, 1),
            'is_overallocated': total_allocated_hours > (self.weekly_capacity or 0),
            'current_week': current_week_key,
            'assignments': assignment_details,
        }

    def get_utilization_over_weeks_sunday(self, weeks=1):
        """Sunday-only utilization aggregated over multiple weeks (average)."""
        from datetime import datetime, timedelta
        from core.week_utils import sunday_of_week

        active_assignments = self.assignments.filter(is_active=True)

        today = datetime.now().date()
        start_sunday = sunday_of_week(today)
        week_keys = [(start_sunday + timedelta(weeks=w)).strftime('%Y-%m-%d') for w in range(int(weeks or 1))]

        total_allocated_hours = 0.0
        assignment_details = []
        week_totals = {wk: 0.0 for wk in week_keys}

        for assignment in active_assignments:
            wh = assignment.weekly_hours or {}
            assignment_total_hours = 0.0
            assignment_weeks_with_data = 0
            for wk in week_keys:
                try:
                    v = float(wh.get(wk) or 0)
                except Exception:
                    v = 0.0
                if v > 0:
                    assignment_total_hours += v
                    assignment_weeks_with_data += 1
                    week_totals[wk] += v
            total_allocated_hours += assignment_total_hours
            if assignment_total_hours > 0:
                assignment_details.append({
                    'project_name': assignment.project_name,
                    'total_hours': assignment_total_hours,
                    'average_weekly_hours': assignment_total_hours / weeks if weeks else assignment_total_hours,
                    'weeks_with_data': assignment_weeks_with_data,
                    'allocation_percentage': min(100, ((assignment_total_hours / (weeks or 1)) / (self.weekly_capacity or 1) * 100)) if self.weekly_capacity > 0 else 0,
                })

        average_weekly_hours = total_allocated_hours / weeks if weeks else total_allocated_hours
        average_percentage = (average_weekly_hours / self.weekly_capacity * 100) if self.weekly_capacity > 0 else 0
        average_available_hours = max(0, (self.weekly_capacity or 0) - average_weekly_hours)

        peak_weekly_hours = max(week_totals.values()) if week_totals else 0.0
        peak_percentage = (peak_weekly_hours / self.weekly_capacity * 100) if self.weekly_capacity > 0 else 0
        peak_week_key = None
        if peak_weekly_hours > 0:
            for wk, val in week_totals.items():
                if val == peak_weekly_hours:
                    peak_week_key = wk
                    break

        return {
            'total_percentage': round(average_percentage, 1),
            'allocated_hours': round(average_weekly_hours, 1),
            'available_hours': round(average_available_hours, 1),
            'is_overallocated': average_weekly_hours > (self.weekly_capacity or 0),
            'peak_percentage': round(round(peak_percentage, 2), 1),
            'peak_weekly_hours': round(peak_weekly_hours, 1),
            'peak_week_key': peak_week_key,
            'is_peak_overallocated': peak_weekly_hours > (self.weekly_capacity or 0),
            'weeks_analyzed': weeks,
            'week_keys': week_keys,
            'week_totals': {k: round(v, 1) for k, v in week_totals.items()},
            'total_hours_all_weeks': round(total_allocated_hours, 1),
            'assignments': assignment_details,
        }
    def get_current_utilization(self):
        """Calculate current utilization based on weekly hours (RETROFIT)"""
        from datetime import datetime, timedelta
        
        active_assignments = self.assignments.filter(is_active=True)
        
        # Get current week (Monday) to match frontend calculation
        today = datetime.now().date()
        days_since_monday = today.weekday()
        current_monday = today - timedelta(days=days_since_monday)
        current_week_key = current_monday.strftime('%Y-%m-%d')
        
        # Calculate total hours for current week across all assignments
        total_allocated_hours = 0
        assignment_details = []
        
        for assignment in active_assignments:
            if not assignment.weekly_hours:
                continue
                
            # Try current week key first, then check nearby dates (±3 days) for flexibility
            week_hours = 0
            used_date_key = None
            
            # Check exact match first
            if current_week_key in assignment.weekly_hours:
                try:
                    week_hours = float(assignment.weekly_hours[current_week_key] or 0)
                except (TypeError, ValueError):
                    week_hours = 0
                used_date_key = current_week_key
            else:
                # Check nearby dates (common with Monday/Tuesday/Sunday variations)
                current_date = datetime.strptime(current_week_key, '%Y-%m-%d').date()
                for offset in range(-3, 4):  # Check ±3 days
                    check_date = current_date + timedelta(days=offset)
                    check_key = check_date.strftime('%Y-%m-%d')
                    if check_key in assignment.weekly_hours:
                        try:
                            week_hours = float(assignment.weekly_hours[check_key] or 0)
                        except (TypeError, ValueError):
                            week_hours = 0
                        used_date_key = check_key
                        break
            
            total_allocated_hours += week_hours
            
            if week_hours > 0:
                assignment_details.append({
                    'project_name': assignment.project_name,
                    'weekly_hours': week_hours,
                    'date_key_used': used_date_key,
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

    def get_utilization_over_weeks(self, weeks=1):
        """Calculate utilization over multiple weeks (average) based on weekly hours.

        Uses a Monday-based week key and tolerates nearby date keys (+/- 3 days)
        to accommodate historical data keyed slightly off the week start.
        """
        from datetime import datetime, timedelta

        active_assignments = self.assignments.filter(is_active=True)

        # Current week (Monday) to align with frontend calculation
        today = datetime.now().date()
        days_since_monday = today.weekday()
        current_monday = today - timedelta(days=days_since_monday)

        # Build week keys for the horizon
        try:
            horizon = int(weeks or 1)
        except Exception:
            horizon = 1
        week_keys = [(current_monday + timedelta(weeks=w)).strftime('%Y-%m-%d') for w in range(horizon)]

        total_allocated_hours = 0.0
        assignment_details = []
        week_totals = {wk: 0.0 for wk in week_keys}

        for assignment in active_assignments:
            if not assignment.weekly_hours:
                continue
            assignment_total_hours = 0.0
            assignment_weeks_with_data = 0

            for wk in week_keys:
                week_hours = 0.0
                used_key = None
                if wk in assignment.weekly_hours:
                    try:
                        week_hours = float(assignment.weekly_hours[wk] or 0)
                    except (TypeError, ValueError):
                        week_hours = 0.0
                    used_key = wk
                else:
                    # Check nearby dates (+/- 3 days)
                    try:
                        base_date = datetime.strptime(wk, '%Y-%m-%d').date()
                        for offset in range(-3, 4):
                            check = (base_date + timedelta(days=offset)).strftime('%Y-%m-%d')
                            if check in assignment.weekly_hours:
                                try:
                                    week_hours = float(assignment.weekly_hours[check] or 0)
                                except (TypeError, ValueError):
                                    week_hours = 0.0
                                used_key = check
                                break
                    except Exception:
                        pass

                if week_hours > 0:
                    assignment_total_hours += week_hours
                    assignment_weeks_with_data += 1
                    week_totals[wk] += week_hours

            total_allocated_hours += assignment_total_hours
            if assignment_total_hours > 0:
                assignment_details.append({
                    'project_name': assignment.project_name,
                    'total_hours': assignment_total_hours,
                    'average_weekly_hours': assignment_total_hours / horizon if horizon else assignment_total_hours,
                    'weeks_with_data': assignment_weeks_with_data,
                    'allocation_percentage': min(100, (assignment_total_hours / (horizon or 1) / self.weekly_capacity * 100)) if (self.weekly_capacity or 0) > 0 else 0,
                })

        # Aggregate stats
        average_weekly_hours = total_allocated_hours / horizon if horizon > 0 else 0.0
        average_percentage = (average_weekly_hours / self.weekly_capacity * 100) if (self.weekly_capacity or 0) > 0 else 0.0
        average_available_hours = max(0.0, (self.weekly_capacity or 0) - average_weekly_hours)

        peak_weekly_hours = max(week_totals.values()) if week_totals else 0.0
        peak_percentage = (peak_weekly_hours / self.weekly_capacity * 100) if (self.weekly_capacity or 0) > 0 else 0.0
        peak_week_key = None
        if peak_weekly_hours > 0:
            for wk, hours in week_totals.items():
                if hours == peak_weekly_hours:
                    peak_week_key = wk
                    break

        return {
            'total_percentage': round(average_percentage, 1),
            'allocated_hours': round(average_weekly_hours, 1),
            'available_hours': round(average_available_hours, 1),
            'is_overallocated': average_weekly_hours > (self.weekly_capacity or 0),
            'peak_percentage': round(peak_percentage, 1),
            'peak_weekly_hours': round(peak_weekly_hours, 1),
            'peak_week_key': peak_week_key,
            'is_peak_overallocated': peak_weekly_hours > (self.weekly_capacity or 0),
            'weeks_analyzed': horizon,
            'week_keys': week_keys,
            'week_totals': {k: round(v, 1) for k, v in week_totals.items()},
            'total_hours_all_weeks': round(total_allocated_hours, 1),
            'assignments': assignment_details,
        }

    @property
    def is_available(self):
        """Check availability based on current week hours."""
        try:
            util = self.get_current_utilization()
            return util.get('allocated_hours', 0) < (self.weekly_capacity or 0)
        except Exception:
            return False


class DeactivationAudit(models.Model):
    """Audit record for cleanup actions performed when a person is deactivated.

    Stores compact metrics to assist support and observability while
    preserving assignment rows for historical reporting.
    """

    person = models.ForeignKey('people.Person', on_delete=models.CASCADE, related_name='deactivation_audits')
    user_id = models.IntegerField(blank=True, null=True)
    mode = models.CharField(max_length=20, default='all')  # 'all' or 'future'
    assignments_touched = models.IntegerField(default=0)
    assignments_deactivated = models.IntegerField(default=0)
    hours_zeroed = models.FloatField(default=0.0)
    week_keys_touched = models.JSONField(default=list)
    deliverable_links_deactivated = models.IntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"DeactivationAudit(p={self.person_id}, a={self.assignments_touched}, h={self.hours_zeroed:.1f})"
    
    def get_utilization_over_weeks(self, weeks=1):
        """Calculate utilization over multiple weeks (average)"""
        from datetime import datetime, timedelta
        
        active_assignments = self.assignments.filter(is_active=True)
        
        # Get current week (Monday) to match frontend calculation
        today = datetime.now().date()
        days_since_monday = today.weekday()
        current_monday = today - timedelta(days=days_since_monday)
        
        # Generate list of week keys for the specified number of weeks
        week_keys = []
        for week_offset in range(weeks):
            week_date = current_monday + timedelta(weeks=week_offset)
            week_keys.append(week_date.strftime('%Y-%m-%d'))
        
        # Calculate total hours across all weeks and assignments
        total_allocated_hours = 0
        assignment_details = []
        week_totals = {week_key: 0 for week_key in week_keys}
        
        for assignment in active_assignments:
            if not assignment.weekly_hours:
                continue
                
            assignment_total_hours = 0
            assignment_weeks_with_data = 0
            
            for week_key in week_keys:
                # Try exact match first, then check nearby dates (±3 days) for flexibility
                week_hours = 0
                used_date_key = None
                
                if week_key in assignment.weekly_hours:
                    try:
                        week_hours = float(assignment.weekly_hours[week_key] or 0)
                    except (TypeError, ValueError):
                        week_hours = 0
                    used_date_key = week_key
                else:
                    # Check nearby dates (common with Monday/Tuesday/Sunday variations)
                    current_date = datetime.strptime(week_key, '%Y-%m-%d').date()
                    for offset in range(-3, 4):  # Check ±3 days
                        check_date = current_date + timedelta(days=offset)
                        check_key = check_date.strftime('%Y-%m-%d')
                        if check_key in assignment.weekly_hours:
                            try:
                                week_hours = float(assignment.weekly_hours[check_key] or 0)
                            except (TypeError, ValueError):
                                week_hours = 0
                            used_date_key = check_key
                            break
                
                if week_hours > 0:
                    assignment_total_hours += float(week_hours)
                    assignment_weeks_with_data += 1
                    week_totals[week_key] += float(week_hours)
            
            total_allocated_hours += assignment_total_hours
            
            if assignment_total_hours > 0:
                assignment_details.append({
                    'project_name': assignment.project_name,
                    'total_hours': assignment_total_hours,
                    'average_weekly_hours': assignment_total_hours / weeks,
                    'weeks_with_data': assignment_weeks_with_data,
                    'allocation_percentage': min(100, (assignment_total_hours / weeks / self.weekly_capacity * 100)) if self.weekly_capacity > 0 else 0
                })
        
        # Calculate average weekly utilization across the period
        average_weekly_hours = total_allocated_hours / weeks if weeks > 0 else 0
        average_percentage = (average_weekly_hours / self.weekly_capacity * 100) if self.weekly_capacity > 0 else 0
        average_available_hours = max(0, self.weekly_capacity - average_weekly_hours)
        
        # Calculate peak utilization (highest single week)
        peak_weekly_hours = max(week_totals.values()) if week_totals else 0
        peak_percentage = (peak_weekly_hours / self.weekly_capacity * 100) if self.weekly_capacity > 0 else 0
        peak_week_key = None
        if peak_weekly_hours > 0:
            for week_key, hours in week_totals.items():
                if hours == peak_weekly_hours:
                    peak_week_key = week_key
                    break
        
        return {
            'total_percentage': round(average_percentage, 1),
            'allocated_hours': round(average_weekly_hours, 1),
            'available_hours': round(average_available_hours, 1),
            'is_overallocated': average_weekly_hours > self.weekly_capacity,
            'peak_percentage': round(peak_percentage, 1),
            'peak_weekly_hours': peak_weekly_hours,
            'peak_week_key': peak_week_key,
            'is_peak_overallocated': peak_weekly_hours > self.weekly_capacity,
            'weeks_analyzed': weeks,
            'week_keys': week_keys,
            'week_totals': week_totals,
            'total_hours_all_weeks': total_allocated_hours,
            'assignments': assignment_details
        }

    @property
    def is_available(self):
        """Check availability based on current week hours"""
        return self.get_current_utilization()['allocated_hours'] < self.weekly_capacity
