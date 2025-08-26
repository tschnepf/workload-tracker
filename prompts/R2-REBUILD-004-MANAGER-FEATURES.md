# R2-REBUILD-004: MANAGER-FOCUSED FEATURES

## Purpose
Add the critical features managers need to effectively assign resources and track deliverables. This builds on top of the foundation from phases 1-3.

## Priority 1: Project Milestones (Day 7)

### Backend: Add Milestone Model
```python
# projects/models.py - Add to existing file

class Milestone(models.Model):
    """Key deliverable dates that drive resource planning"""
    project = models.ForeignKey('Project', on_delete=models.CASCADE, related_name='milestones')
    name = models.CharField(max_length=200)
    deliverable_date = models.DateField()
    description = models.TextField(blank=True)
    hours_required = models.IntegerField(default=0, help_text="Estimated hours to complete")
    is_critical = models.BooleanField(default=False, help_text="Critical path milestone")
    status = models.CharField(max_length=20, choices=[
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('at_risk', 'At Risk'),
    ], default='pending')
    completed_date = models.DateField(null=True, blank=True)
    assigned_people = models.ManyToManyField('people.Person', through='MilestoneAssignment')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['deliverable_date', 'name']
    
    def days_remaining(self):
        """Days until deliverable date"""
        if self.status == 'completed':
            return 0
        delta = self.deliverable_date - date.today()
        return delta.days
    
    def is_at_risk(self):
        """Check if milestone is at risk based on capacity"""
        if self.status == 'completed':
            return False
            
        days_remaining = self.days_remaining()
        if days_remaining <= 0:
            return True
            
        # Calculate if we have enough capacity
        weekly_capacity = self.get_allocated_capacity()
        weeks_remaining = days_remaining / 7
        capacity_available = weekly_capacity * weeks_remaining
        
        return capacity_available < self.hours_required
    
    def get_allocated_capacity(self):
        """Get total weekly hours allocated to this milestone"""
        return self.milestone_assignments.aggregate(
            total=models.Sum('weekly_hours')
        )['total'] or 0

class MilestoneAssignment(models.Model):
    """Link people to specific milestones"""
    milestone = models.ForeignKey('Milestone', on_delete=models.CASCADE, related_name='milestone_assignments')
    person = models.ForeignKey('people.Person', on_delete=models.CASCADE)
    weekly_hours = models.IntegerField()
    role = models.CharField(max_length=50)
    
    class Meta:
        unique_together = ['milestone', 'person']
```

### Frontend: Manager Assignment Interface
```typescript
// frontend/src/pages/ManagerDashboard.tsx
import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

interface ManagerDashboardProps {
  projectId: number;
}

export function ManagerDashboard({ projectId }: ManagerDashboardProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [availablePeople, setAvailablePeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Resource Planning Dashboard</h1>
      
      {/* Project Timeline with Milestones */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Project Timeline</h2>
        <MilestoneTimeline 
          milestones={milestones}
          startDate={project?.startDate}
          endDate={project?.endDate}
        />
      </div>

      {/* Drag & Drop Assignment Interface */}
      <div className="grid grid-cols-3 gap-6">
        {/* Available People */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Available Team Members</h3>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="available">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {availablePeople.map((person, index) => (
                    <Draggable 
                      key={person.id} 
                      draggableId={`person-${person.id}`} 
                      index={index}
                    >
                      {(provided) => (
                        <PersonCard
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          person={person}
                          showCapacity={true}
                        />
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        {/* Milestones */}
        <div className="bg-white rounded-lg p-4 col-span-2">
          <h3 className="font-semibold mb-3">Milestones & Deliverables</h3>
          {milestones.map(milestone => (
            <MilestoneCard
              key={milestone.id}
              milestone={milestone}
              onAssignPerson={(personId) => assignToMilestone(milestone.id, personId)}
              isAtRisk={milestone.isAtRisk}
            />
          ))}
        </div>
      </div>

      {/* Team Capacity Overview */}
      <TeamCapacityChart 
        team={availablePeople}
        dateRange={{ start: project?.startDate, end: project?.endDate }}
      />
    </div>
  );
}
```

## Priority 2: Visual Capacity Planning (Day 8)

### Resource Heatmap View
```typescript
// frontend/src/components/CapacityHeatmap.tsx
interface CapacityHeatmapProps {
  people: Person[];
  weeks: number;
}

export function CapacityHeatmap({ people, weeks }: CapacityHeatmapProps) {
  const getUtilizationColor = (percent: number) => {
    if (percent < 70) return 'bg-blue-200'; // Underutilized
    if (percent <= 85) return 'bg-green-200'; // Optimal
    if (percent <= 100) return 'bg-yellow-200'; // High
    return 'bg-red-200'; // Overallocated
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white">Team Member</th>
            {Array.from({ length: weeks }, (_, i) => (
              <th key={i} className="text-xs px-2">
                Week {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map(person => (
            <tr key={person.id}>
              <td className="sticky left-0 bg-white font-medium">
                {person.name}
                <div className="text-xs text-gray-500">
                  {person.role} • {person.weeklyCapacity}h/week
                </div>
              </td>
              {person.utilization.map((week, i) => (
                <td 
                  key={i}
                  className={`text-center p-2 ${getUtilizationColor(week.percent)}`}
                  title={`${week.hours}h / ${person.weeklyCapacity}h`}
                >
                  {week.percent}%
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Workload Forecast
```python
# people/views.py - Add to PersonViewSet
@action(detail=False, methods=['get'])
def workload_forecast(self, request):
    """Forecast team workload for upcoming weeks"""
    weeks_ahead = int(request.query_params.get('weeks', 8))
    department = request.query_params.get('department')
    
    people = self.get_queryset()
    if department:
        people = people.filter(department=department)
    
    forecast = []
    start_date = date.today() - timedelta(days=date.today().weekday())
    
    for week_num in range(weeks_ahead):
        week_start = start_date + timedelta(weeks=week_num)
        week_end = week_start + timedelta(days=6)
        
        week_data = {
            'week_start': week_start,
            'week_end': week_end,
            'total_capacity': 0,
            'total_allocated': 0,
            'people_overallocated': [],
            'people_underutilized': [],
            'critical_milestones': []
        }
        
        for person in people:
            util = person.get_utilization_for_period(week_start, week_end)
            week_data['total_capacity'] += util['total_capacity']
            week_data['total_allocated'] += util['total_hours']
            
            if util['utilization_percent'] > 100:
                week_data['people_overallocated'].append({
                    'id': person.id,
                    'name': person.name,
                    'utilization': util['utilization_percent']
                })
            elif util['utilization_percent'] < 70:
                week_data['people_underutilized'].append({
                    'id': person.id,
                    'name': person.name,
                    'utilization': util['utilization_percent']
                })
        
        # Check for critical milestones in this week
        milestones = Milestone.objects.filter(
            deliverable_date__gte=week_start,
            deliverable_date__lte=week_end,
            is_critical=True,
            status__in=['pending', 'in_progress', 'at_risk']
        )
        
        for milestone in milestones:
            if milestone.is_at_risk():
                week_data['critical_milestones'].append({
                    'id': milestone.id,
                    'name': milestone.name,
                    'project': milestone.project.name,
                    'date': milestone.deliverable_date
                })
        
        week_data['team_utilization'] = round(
            (week_data['total_allocated'] / week_data['total_capacity'] * 100), 1
        ) if week_data['total_capacity'] > 0 else 0
        
        forecast.append(week_data)
    
    return Response(forecast)
```

## Priority 3: Manager-Friendly Features (Day 9)

### Quick Actions for Managers
```typescript
// frontend/src/components/QuickActions.tsx
export function ManagerQuickActions() {
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <QuickActionCard
        title="Find Available Resources"
        icon="👥"
        onClick={() => openResourceFinder()}
        description="Find team members with capacity"
      />
      
      <QuickActionCard
        title="Balance Workload"
        icon="⚖️"
        onClick={() => openWorkloadBalancer()}
        description="Redistribute assignments evenly"
      />
      
      <QuickActionCard
        title="Milestone Review"
        icon="🎯"
        onClick={() => openMilestoneReview()}
        description="Check at-risk deliverables"
      />
      
      <QuickActionCard
        title="Capacity Report"
        icon="📊"
        onClick={() => generateCapacityReport()}
        description="Export team capacity report"
      />
    </div>
  );
}

// Workload Balancer Component
export function WorkloadBalancer() {
  const [suggestions, setSuggestions] = useState<RebalanceSuggestion[]>([]);

  const analyzWorkload = async () => {
    const response = await api.get('/api/assignments/rebalance-suggestions/');
    setSuggestions(response.data);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Workload Rebalancing Suggestions</h2>
      
      {suggestions.map(suggestion => (
        <div key={suggestion.id} className="border-l-4 border-yellow-400 pl-4 py-2">
          <p className="font-medium">{suggestion.title}</p>
          <p className="text-sm text-gray-600">{suggestion.description}</p>
          <div className="mt-2 space-x-2">
            <button
              onClick={() => applySuggestion(suggestion)}
              className="text-sm bg-blue-500 text-white px-3 py-1 rounded"
            >
              Apply
            </button>
            <button className="text-sm text-gray-500">Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Email Notifications for Managers
```python
# notifications/tasks.py
from django.core.mail import send_mail
from datetime import date, timedelta

def send_weekly_manager_digest():
    """Send weekly digest to managers about their team's workload"""
    managers = Person.objects.filter(role__contains='Manager', is_active=True)
    
    for manager in managers:
        team = Person.objects.filter(department=manager.department)
        
        # Gather metrics
        overallocated = []
        underutilized = []
        at_risk_milestones = []
        
        for person in team:
            util = person.get_current_utilization()
            if util['utilization_percent'] > 100:
                overallocated.append(person)
            elif util['utilization_percent'] < 70:
                underutilized.append(person)
        
        # Check milestones
        milestones = Milestone.objects.filter(
            project__assignments__person__department=manager.department,
            deliverable_date__lte=date.today() + timedelta(days=14),
            status__in=['pending', 'in_progress']
        ).distinct()
        
        for milestone in milestones:
            if milestone.is_at_risk():
                at_risk_milestones.append(milestone)
        
        # Send email
        if overallocated or at_risk_milestones:
            send_mail(
                subject=f'Weekly Workload Alert - {manager.department}',
                message=render_to_string('emails/manager_digest.html', {
                    'manager': manager,
                    'overallocated': overallocated,
                    'underutilized': underutilized,
                    'at_risk_milestones': at_risk_milestones,
                }),
                from_email='workload@company.com',
                recipient_list=[manager.email],
            )
```

## Priority 4: Smart Assignment Suggestions

### AI-Powered Assignment Recommendations
```python
# assignments/views.py
@action(detail=False, methods=['post'])
def suggest_assignments(self, request):
    """Suggest optimal person for a milestone/project"""
    milestone_id = request.data.get('milestone_id')
    required_hours = request.data.get('required_hours')
    required_skills = request.data.get('skills', [])
    
    milestone = Milestone.objects.get(id=milestone_id)
    
    # Find people with capacity
    candidates = []
    for person in Person.objects.filter(is_active=True):
        # Check availability
        if person.is_available(milestone.project.start_date, milestone.deliverable_date, required_hours):
            score = 100
            
            # Adjust score based on current utilization (prefer 70-85%)
            current_util = person.get_current_utilization()['utilization_percent']
            if 70 <= current_util <= 85:
                score += 20
            elif current_util < 70:
                score += 10
            elif current_util > 100:
                score -= 30
            
            # Check skills match
            person_skills = set(person.skills.values_list('name', flat=True))
            matched_skills = len(set(required_skills) & person_skills)
            score += matched_skills * 15
            
            # Prefer same department
            if person.department == milestone.project.department:
                score += 10
            
            # Check previous experience with client
            if Assignment.objects.filter(
                person=person,
                project__client=milestone.project.client
            ).exists():
                score += 15
            
            candidates.append({
                'person': PersonSerializer(person).data,
                'score': score,
                'available_hours': person.get_utilization_for_period(
                    milestone.project.start_date,
                    milestone.deliverable_date
                )['total_capacity'] - person.get_utilization_for_period(
                    milestone.project.start_date,
                    milestone.deliverable_date
                )['total_hours'],
                'reasons': self._get_recommendation_reasons(person, milestone, score)
            })
    
    # Sort by score
    candidates.sort(key=lambda x: x['score'], reverse=True)
    
    return Response(candidates[:5])  # Return top 5 suggestions
```

## Updated Dashboard for Managers

```typescript
// frontend/src/pages/ExecutiveDashboard.tsx
export function ExecutiveDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <KPICard
          title="Team Utilization"
          value="82%"
          trend="+3%"
          status="optimal"
        />
        <KPICard
          title="At-Risk Milestones"
          value="3"
          trend="+1"
          status="warning"
        />
        <KPICard
          title="Overallocated People"
          value="2"
          status="danger"
        />
        <KPICard
          title="Active Projects"
          value="12"
          trend="0"
          status="normal"
        />
        <KPICard
          title="Upcoming Deliverables"
          value="8"
          subtitle="Next 2 weeks"
          status="normal"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Milestone Calendar */}
        <div className="col-span-2">
          <MilestoneCalendar />
        </div>
        
        {/* Quick Actions */}
        <div>
          <ManagerQuickActions />
        </div>
      </div>

      {/* Team Capacity Forecast */}
      <div className="mt-6">
        <WorkloadForecastChart weeks={8} />
      </div>
      
      {/* Alerts and Notifications */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <AlertsPanel />
        <RecentAssignmentsPanel />
      </div>
    </div>
  );
}
```

## Implementation Priority Order

1. **First: Milestones** (Most critical missing piece)
   - Add milestone model and API
   - Create milestone assignment UI
   - Add at-risk detection

2. **Second: Visual Planning**
   - Capacity heatmap
   - Workload forecast
   - Timeline views

3. **Third: Manager Tools**
   - Quick actions
   - Bulk assignment
   - Rebalancing suggestions

4. **Fourth: Automation**
   - Email alerts
   - Smart suggestions
   - Auto-rebalancing

## Key Success Metrics for Managers

```python
# dashboard/metrics.py
def get_manager_metrics(department=None):
    """Key metrics managers care about"""
    return {
        'resource_efficiency': {
            'optimal_utilization_rate': 75,  # % of team at 70-85% utilization
            'overallocation_incidents': 2,    # People over 100%
            'underutilization_rate': 12       # % of team under 70%
        },
        'delivery_health': {
            'on_time_delivery_rate': 87,      # % milestones delivered on time
            'at_risk_milestones': 3,          # Count of at-risk deliverables
            'average_slip_days': 2.5          # Average delay when late
        },
        'planning_accuracy': {
            'estimation_accuracy': 82,        # % of projects within 10% of estimate
            'reallocation_frequency': 1.2,    # Times per week resources moved
            'capacity_forecast_accuracy': 91  # % accuracy of capacity predictions
        }
    }
```

This additional phase focuses specifically on what managers need to effectively manage workload. The key additions are:

1. **Milestones with dates** - Critical for deadline management
2. **Visual capacity planning** - See problems before they happen
3. **Manager-friendly UI** - Drag-drop assignments, quick actions
4. **Proactive alerts** - Know about issues early
5. **Smart suggestions** - AI-powered resource recommendations

Would you like me to create additional detail on any of these manager-specific features?