# R2-REBUILD-002: BUSINESS LOGIC - Days 3-4

## Objective
Add core workload tracking features to our working CRUD application. Focus on practical business value, not architectural perfection.

## Day 3: Core Business Logic

### Step 1: Add Utilization Calculations (2 hours)

#### Backend: Add methods to Person model
```python
# people/models.py
from django.db import models
from django.db.models import Sum, Q
from datetime import date, timedelta

class Person(models.Model):
    # ... existing fields ...
    
    def get_current_utilization(self):
        """Calculate current week utilization"""
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        
        current_hours = self.assignments.filter(
            is_active=True,
            start_date__lte=week_end,
            end_date__gte=week_start
        ).aggregate(
            total=Sum('weekly_hours')
        )['total'] or 0
        
        return {
            'weekly_hours': current_hours,
            'capacity': self.weekly_capacity,
            'utilization_percent': round((current_hours / self.weekly_capacity * 100), 1) if self.weekly_capacity > 0 else 0
        }
    
    def get_utilization_for_period(self, start_date, end_date):
        """Calculate utilization for a specific period"""
        overlapping_assignments = self.assignments.filter(
            is_active=True,
            start_date__lte=end_date,
            end_date__gte=start_date
        )
        
        total_hours = 0
        for assignment in overlapping_assignments:
            # Calculate overlap days
            overlap_start = max(assignment.start_date, start_date)
            overlap_end = min(assignment.end_date, end_date)
            weeks = ((overlap_end - overlap_start).days + 1) / 7
            total_hours += assignment.weekly_hours * weeks
        
        total_capacity = self.weekly_capacity * ((end_date - start_date).days + 1) / 7
        
        return {
            'total_hours': round(total_hours, 1),
            'total_capacity': round(total_capacity, 1),
            'utilization_percent': round((total_hours / total_capacity * 100), 1) if total_capacity > 0 else 0
        }
    
    def is_available(self, start_date, end_date, required_hours):
        """Check if person has capacity for new assignment"""
        utilization = self.get_utilization_for_period(start_date, end_date)
        available_hours = utilization['total_capacity'] - utilization['total_hours']
        return available_hours >= required_hours

# Add to PersonSerializer
# people/serializers.py
from rest_framework import serializers
from .models import Person

class PersonSerializer(serializers.ModelSerializer):
    current_utilization = serializers.SerializerMethodField()
    
    class Meta:
        model = Person
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
    
    def get_current_utilization(self, obj):
        return obj.get_current_utilization()

# Add custom endpoint
# people/views.py
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import viewsets, filters, status
from datetime import datetime

class PersonViewSet(viewsets.ModelViewSet):
    # ... existing code ...
    
    @action(detail=False, methods=['get'])
    def availability(self, request):
        """Find available people for a period"""
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        required_hours = request.query_params.get('required_hours', 0)
        
        if not start_date or not end_date:
            return Response(
                {'error': 'start_date and end_date are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        required_hours = float(required_hours)
        
        available_people = []
        for person in self.get_queryset():
            if person.is_available(start_date, end_date, required_hours):
                utilization = person.get_utilization_for_period(start_date, end_date)
                available_people.append({
                    'id': person.id,
                    'name': person.name,
                    'department': person.department,
                    'available_hours': utilization['total_capacity'] - utilization['total_hours'],
                    'current_utilization': utilization['utilization_percent']
                })
        
        return Response(available_people)
    
    @action(detail=True, methods=['get'])
    def utilization_timeline(self, request, pk=None):
        """Get utilization timeline for a person"""
        person = self.get_object()
        weeks = int(request.query_params.get('weeks', 12))
        
        timeline = []
        start_date = date.today() - timedelta(days=date.today().weekday())
        
        for week in range(weeks):
            week_start = start_date + timedelta(weeks=week)
            week_end = week_start + timedelta(days=6)
            utilization = person.get_utilization_for_period(week_start, week_end)
            
            timeline.append({
                'week_start': week_start.isoformat(),
                'week_end': week_end.isoformat(),
                'utilization_percent': utilization['utilization_percent'],
                'hours': utilization['total_hours']
            })
        
        return Response(timeline)
```

### Step 2: Assignment Overlap Detection (2 hours)

```python
# assignments/models.py
from django.db import models
from django.core.exceptions import ValidationError
from django.db.models import Q

class Assignment(models.Model):
    # ... existing fields ...
    
    def clean(self):
        """Validate assignment doesn't exceed capacity"""
        super().clean()
        
        # Check for date validity
        if self.end_date < self.start_date:
            raise ValidationError("End date must be after start date")
        
        # Check for capacity conflicts
        if self.person_id:  # Only check if person is set
            overlapping_hours = Assignment.objects.filter(
                person=self.person_id,
                is_active=True,
                start_date__lte=self.end_date,
                end_date__gte=self.start_date
            ).exclude(
                pk=self.pk  # Exclude current assignment when updating
            ).aggregate(
                total=models.Sum('weekly_hours')
            )['total'] or 0
            
            total_hours = overlapping_hours + self.weekly_hours
            
            if total_hours > self.person.weekly_capacity:
                raise ValidationError(
                    f"Assignment would exceed {self.person.name}'s capacity. "
                    f"Current: {overlapping_hours}h, Adding: {self.weekly_hours}h, "
                    f"Capacity: {self.person.weekly_capacity}h"
                )
    
    def get_overlap_warnings(self):
        """Get warnings about potential conflicts"""
        warnings = []
        
        # Check utilization levels
        utilization = self.person.get_utilization_for_period(self.start_date, self.end_date)
        if utilization['utilization_percent'] > 100:
            warnings.append({
                'type': 'overallocation',
                'message': f"{self.person.name} is overallocated ({utilization['utilization_percent']}%)"
            })
        elif utilization['utilization_percent'] > 85:
            warnings.append({
                'type': 'high_utilization',
                'message': f"{self.person.name} has high utilization ({utilization['utilization_percent']}%)"
            })
        
        # Check for multiple projects in same period
        concurrent_assignments = Assignment.objects.filter(
            person=self.person,
            is_active=True,
            start_date__lte=self.end_date,
            end_date__gte=self.start_date
        ).exclude(pk=self.pk).count()
        
        if concurrent_assignments > 2:
            warnings.append({
                'type': 'fragmentation',
                'message': f"{self.person.name} is spread across {concurrent_assignments + 1} projects"
            })
        
        return warnings

# Add validation to serializer
# assignments/serializers.py
class AssignmentSerializer(serializers.ModelSerializer):
    warnings = serializers.SerializerMethodField()
    
    class Meta:
        model = Assignment
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
    
    def get_warnings(self, obj):
        return obj.get_overlap_warnings() if obj.pk else []
    
    def validate(self, data):
        """Run model validation"""
        assignment = Assignment(**data)
        try:
            assignment.clean()
        except ValidationError as e:
            raise serializers.ValidationError(str(e))
        return data
```

### Step 3: Project Resource Summary (1 hour)

```python
# projects/models.py
from django.db import models
from django.db.models import Sum, Count

class Project(models.Model):
    # ... existing fields ...
    
    def get_resource_summary(self):
        """Get summary of resources assigned to project"""
        assignments = self.assignments.filter(is_active=True)
        
        total_weekly_hours = assignments.aggregate(
            total=Sum('weekly_hours')
        )['total'] or 0
        
        people_count = assignments.values('person').distinct().count()
        
        # Calculate actual vs estimated progress
        today = date.today()
        if self.start_date <= today <= self.end_date:
            project_duration_weeks = ((self.end_date - self.start_date).days + 1) / 7
            elapsed_weeks = ((today - self.start_date).days + 1) / 7
            progress_percent = (elapsed_weeks / project_duration_weeks * 100) if project_duration_weeks > 0 else 0
        else:
            progress_percent = 0 if today < self.start_date else 100
        
        return {
            'total_weekly_hours': total_weekly_hours,
            'people_count': people_count,
            'estimated_total_hours': self.estimated_hours,
            'progress_percent': round(progress_percent, 1),
            'assignments': list(assignments.select_related('person').values(
                'person__name', 'role', 'weekly_hours', 'start_date', 'end_date'
            ))
        }
    
    def is_adequately_staffed(self):
        """Check if project has enough resources"""
        summary = self.get_resource_summary()
        weeks_remaining = max(((self.end_date - date.today()).days + 1) / 7, 0)
        hours_available = summary['total_weekly_hours'] * weeks_remaining
        hours_needed = self.estimated_hours * (1 - summary['progress_percent'] / 100)
        
        return hours_available >= hours_needed

# Add to serializer
# projects/serializers.py
class ProjectSerializer(serializers.ModelSerializer):
    resource_summary = serializers.SerializerMethodField()
    is_adequately_staffed = serializers.SerializerMethodField()
    
    class Meta:
        model = Project
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
    
    def get_resource_summary(self, obj):
        return obj.get_resource_summary()
    
    def get_is_adequately_staffed(self, obj):
        return obj.is_adequately_staffed()
```

## Day 4: Dashboard & UI Improvements

### Step 1: Dashboard API Endpoint (1 hour)

```python
# Create a new app for dashboard
# python manage.py startapp dashboard

# dashboard/views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Count, Sum, Q
from datetime import date, timedelta
from people.models import Person
from projects.models import Project
from assignments.models import Assignment

class DashboardView(APIView):
    """Simple dashboard metrics"""
    
    def get(self, request):
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        
        # People metrics
        total_people = Person.objects.filter(is_active=True).count()
        
        # Calculate utilization distribution
        utilization_ranges = {
            'underutilized': 0,  # < 70%
            'optimal': 0,         # 70-85%
            'high': 0,            # 85-100%
            'overallocated': 0    # > 100%
        }
        
        for person in Person.objects.filter(is_active=True):
            util = person.get_current_utilization()
            percent = util['utilization_percent']
            if percent < 70:
                utilization_ranges['underutilized'] += 1
            elif percent <= 85:
                utilization_ranges['optimal'] += 1
            elif percent <= 100:
                utilization_ranges['high'] += 1
            else:
                utilization_ranges['overallocated'] += 1
        
        # Project metrics
        projects = Project.objects.filter(is_active=True)
        project_status_counts = projects.values('status').annotate(count=Count('id'))
        
        # Projects at risk (inadequately staffed)
        projects_at_risk = []
        for project in projects.filter(status='active'):
            if not project.is_adequately_staffed():
                projects_at_risk.append({
                    'id': project.id,
                    'name': project.name,
                    'client': project.client,
                    'end_date': project.end_date.isoformat()
                })
        
        # Recent assignments
        recent_assignments = Assignment.objects.filter(
            created_at__gte=today - timedelta(days=7)
        ).select_related('person', 'project').order_by('-created_at')[:5]
        
        return Response({
            'summary': {
                'total_people': total_people,
                'total_projects': projects.count(),
                'active_projects': projects.filter(status='active').count(),
                'total_assignments': Assignment.objects.filter(is_active=True).count()
            },
            'utilization_distribution': utilization_ranges,
            'project_status': list(project_status_counts),
            'projects_at_risk': projects_at_risk[:5],
            'recent_assignments': [
                {
                    'person': a.person.name,
                    'project': a.project.name,
                    'hours': a.weekly_hours,
                    'created': a.created_at.isoformat()
                }
                for a in recent_assignments
            ]
        })

# config/urls.py - add to urlpatterns
from dashboard.views import DashboardView

urlpatterns = [
    # ... existing patterns ...
    path('api/dashboard/', DashboardView.as_view(), name='dashboard'),
]
```

### Step 2: Frontend Dashboard (2 hours)

```typescript
// frontend/src/pages/Dashboard.tsx
import { useState, useEffect } from 'react';
import { api } from '../services/api';

interface DashboardData {
  summary: {
    total_people: number;
    total_projects: number;
    active_projects: number;
    total_assignments: number;
  };
  utilization_distribution: {
    underutilized: number;
    optimal: number;
    high: number;
    overallocated: number;
  };
  projects_at_risk: Array<{
    id: number;
    name: string;
    client: string;
    end_date: string;
  }>;
  recent_assignments: Array<{
    person: string;
    project: string;
    hours: number;
    created: string;
  }>;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await api.get('/dashboard/');
      setData(response.data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-4">Loading dashboard...</div>;
  if (!data) return <div className="p-4">Failed to load dashboard</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Workload Tracker Dashboard</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total People</div>
          <div className="text-2xl font-bold">{data.summary.total_people}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Projects</div>
          <div className="text-2xl font-bold">{data.summary.total_projects}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Active Projects</div>
          <div className="text-2xl font-bold">{data.summary.active_projects}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Active Assignments</div>
          <div className="text-2xl font-bold">{data.summary.total_assignments}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Utilization Distribution */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-xl font-semibold mb-4">Team Utilization</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Underutilized (&lt;70%)</span>
              <span className="font-bold text-blue-600">
                {data.utilization_distribution.underutilized}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Optimal (70-85%)</span>
              <span className="font-bold text-green-600">
                {data.utilization_distribution.optimal}
              </span>
            </div>
            <div className="flex justify-between">
              <span>High (85-100%)</span>
              <span className="font-bold text-yellow-600">
                {data.utilization_distribution.high}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Overallocated (&gt;100%)</span>
              <span className="font-bold text-red-600">
                {data.utilization_distribution.overallocated}
              </span>
            </div>
          </div>
        </div>

        {/* Projects at Risk */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-xl font-semibold mb-4">Projects at Risk</h2>
          {data.projects_at_risk.length === 0 ? (
            <p className="text-gray-600">No projects at risk</p>
          ) : (
            <div className="space-y-2">
              {data.projects_at_risk.map(project => (
                <div key={project.id} className="border-l-4 border-red-500 pl-3">
                  <div className="font-semibold">{project.name}</div>
                  <div className="text-sm text-gray-600">
                    {project.client} - Due: {new Date(project.end_date).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Assignments */}
      <div className="bg-white rounded-lg shadow p-4 mt-6">
        <h2 className="text-xl font-semibold mb-4">Recent Assignments</h2>
        <table className="w-full">
          <thead>
            <tr className="text-left border-b">
              <th className="pb-2">Person</th>
              <th className="pb-2">Project</th>
              <th className="pb-2">Hours/Week</th>
              <th className="pb-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.recent_assignments.map((assignment, i) => (
              <tr key={i} className="border-b">
                <td className="py-2">{assignment.person}</td>
                <td className="py-2">{assignment.project}</td>
                <td className="py-2">{assignment.hours}h</td>
                <td className="py-2">
                  {new Date(assignment.created).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 3: Add Forms for Creating Records (2 hours)

```typescript
// frontend/src/components/PersonForm.tsx
import { useState } from 'react';
import { peopleAPI } from '../services/api';

interface PersonFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function PersonForm({ onSuccess, onCancel }: PersonFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: '',
    role: '',
    weekly_capacity: 40,
    hire_date: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await peopleAPI.create(formData);
      onSuccess();
    } catch (error) {
      console.error('Failed to create person:', error);
      alert('Failed to create person. Check the console for details.');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) : value
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Department</label>
        <input
          type="text"
          name="department"
          value={formData.department}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Role</label>
        <input
          type="text"
          name="role"
          value={formData.role}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Weekly Capacity (hours)</label>
        <input
          type="number"
          name="weekly_capacity"
          value={formData.weekly_capacity}
          onChange={handleChange}
          min="1"
          max="80"
          className="w-full border rounded px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Hire Date</label>
        <input
          type="date"
          name="hire_date"
          value={formData.hire_date}
          onChange={handleChange}
          className="w-full border rounded px-3 py-2"
          required
        />
      </div>

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Create Person
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Update PeoplePage to include the form
// frontend/src/pages/PeoplePage.tsx
import { PersonForm } from '../components/PersonForm';

export function PeoplePage() {
  const [showForm, setShowForm] = useState(false);
  // ... existing code ...

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">People</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Add Person
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="text-xl font-semibold mb-4">Add New Person</h2>
          <PersonForm
            onSuccess={() => {
              setShowForm(false);
              loadPeople(); // Refresh the list
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* ... existing table code ... */}
    </div>
  );
}
```

## Testing Checklist - End of Day 4

### Business Logic Tests
- ✅ Utilization calculations are accurate
- ✅ Assignment overlap detection works
- ✅ Capacity validation prevents overallocation
- ✅ Available people finder returns correct results
- ✅ Project staffing adequacy check works

### Dashboard Tests
- ✅ Dashboard loads and displays metrics
- ✅ Utilization distribution is correct
- ✅ Projects at risk are identified
- ✅ Recent assignments show up

### Form Tests
- ✅ Can create new person via form
- ✅ Can create new project via form
- ✅ Can create new assignment with validation
- ✅ Validation errors display properly

## What We Built in Days 3-4
- ✅ Utilization calculations at person and project level
- ✅ Assignment overlap detection with warnings
- ✅ Capacity validation to prevent overallocation
- ✅ Dashboard with key metrics
- ✅ Forms for creating records
- ✅ API endpoints for business queries

## What We Didn't Build (Yet)
- ❌ Advanced reporting (can add if needed)
- ❌ Email notifications (can add if needed)
- ❌ Bulk operations (can add if needed)
- ❌ Data export/import (can add if needed)
- ❌ User preferences (can add if needed)

## Performance Optimizations Applied
```python
# Only where measured as slow:
# 1. Use select_related for assignments
assignments = Assignment.objects.select_related('person', 'project')

# 2. Aggregate in database, not Python
total_hours = assignments.aggregate(Sum('weekly_hours'))['weekly_hours__sum']

# 3. Limit dashboard queries
recent_assignments = Assignment.objects.filter(
    created_at__gte=today - timedelta(days=7)
)[:5]  # Limit to 5 recent
```

## Next Steps
Move to **R2-REBUILD-003-PRODUCTION.md** to:
- Containerize with Docker
- Add error handling
- Setup monitoring
- Deploy to production
- Add final polish

## Key Takeaways
1. **Business logic in models** - Django models can handle business logic effectively
2. **Aggregations in database** - Let PostgreSQL do the heavy lifting
3. **Progressive enhancement** - Added features as needed, not upfront
4. **Simple validations work** - Basic checks prevent most issues

**Time Invested**: 4 days total  
**Result**: Functional workload tracking system with core business features