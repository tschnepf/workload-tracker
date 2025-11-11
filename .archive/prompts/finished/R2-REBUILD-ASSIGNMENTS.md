# R2-REBUILD-ASSIGNMENTS: Resource Assignment System

## AI Agent Instructions
**This document defines how people are assigned to projects and departments.**

## 🎯 Core Principle: Flexible Assignments
- People can work on multiple projects
- Projects can have multiple people
- People belong to departments (optional)
- Cross-department collaboration is normal

---

## 🔗 ASSIGNMENT MODEL (The Bridge)

### Required Fields (Only 2!)
```python
class Assignment(models.Model):
    """Links people to projects with allocation details"""
    # REQUIRED - The core relationship
    person = models.ForeignKey('Person', on_delete=models.CASCADE, related_name='assignments')
    project = models.ForeignKey('Project', on_delete=models.CASCADE, related_name='assignments')
```

### Complete Assignment Model
```python
class Assignment(models.Model):
    """Links people to projects - the heart of workload tracking"""
    
    # REQUIRED - Core relationship
    person = models.ForeignKey('Person', on_delete=models.CASCADE, related_name='assignments')
    project = models.ForeignKey('Project', on_delete=models.CASCADE, related_name='assignments')
    
    # OPTIONAL - With Defaults
    allocation_percentage = models.IntegerField(
        default=100,
        help_text="Percentage of time allocated to this project"
    )  # Can work part-time on projects
    
    # OPTIONAL - No Defaults (completely optional project role)
    role_on_project = models.CharField(
        max_length=100, 
        blank=True,
        null=True,  # Fully optional - no default
        help_text="Optional: Person's role on this specific project (different from their org role)"
    )
    start_date = models.DateField(blank=True, null=True)  # When they start
    end_date = models.DateField(blank=True, null=True)    # When they finish
    notes = models.TextField(blank=True)                   # Assignment-specific notes
    
    # CALCULATED FIELD
    @property
    def weekly_hours(self):
        """Calculate weekly hours based on person's capacity and allocation"""
        return (self.person.weekly_capacity * self.allocation_percentage) / 100
    
    # AUTOMATIC - System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        # Prevent duplicate assignments
        unique_together = [['person', 'project', 'is_active']]
        ordering = ['-created_at']
    
    def __str__(self):
        role_text = f" as {self.role_on_project}" if self.role_on_project else ""
        return f"{self.person.name} on {self.project.name} ({self.allocation_percentage}%){role_text}"
```

---

## 🏢 DEPARTMENT RELATIONSHIP

### Person-Department Relationship
```python
# In Person model - already defined as optional
class Person(models.Model):
    name = models.CharField(max_length=200)  # Required
    department = models.ForeignKey(
        'Department', 
        blank=True, 
        null=True, 
        on_delete=models.SET_NULL,
        related_name='people'  # Access all people in a department
    )
    # ... other fields
```

### Department Access Patterns
```python
# Get all people in a department
engineering_dept = Department.objects.get(name='Engineering')
engineering_people = engineering_dept.people.all()

# Get all projects a department is working on (through assignments)
engineering_projects = Project.objects.filter(
    assignments__person__department=engineering_dept
).distinct()

# Get department workload
total_hours = Assignment.objects.filter(
    person__department=engineering_dept,
    is_active=True
).aggregate(
    total=Sum('person__weekly_capacity')
)
```

---

## 📊 PROJECT TEAM COMPOSITION

### Project Access Patterns
```python
# Get all people on a project
project = Project.objects.get(name='Website Redesign')
team_members = Person.objects.filter(
    assignments__project=project,
    assignments__is_active=True
).distinct()

# Get project team by department
project_team_by_dept = Assignment.objects.filter(
    project=project,
    is_active=True
).values(
    'person__department__name'
).annotate(
    count=Count('person'),
    total_allocation=Sum('allocation_percentage')
)

# Result:
# [
#     {'person__department__name': 'Engineering', 'count': 3, 'total_allocation': 250},
#     {'person__department__name': 'Design', 'count': 2, 'total_allocation': 150},
# ]
```

---

## 🔄 ASSIGNMENT API ENDPOINTS

### Create Assignment (Minimal)
```typescript
// Minimal assignment - just person and project
const assignPersonToProject = async (personId: string, projectId: string) => {
    return await api.post('/api/assignments/', {
        person: personId,
        project: projectId
        // Defaults: 100% allocation, no project role specified
    });
};
```

### Create Assignment (Full)
```typescript
interface CreateAssignmentRequest {
    person: string;                // ✅ Required - Person ID
    project: string;               // ✅ Required - Project ID
    allocationPercentage?: number; // Optional (default: 100)
    roleOnProject?: string;        // Optional (no default - completely optional)
    startDate?: string;            // Optional
    endDate?: string;              // Optional
    notes?: string;                // Optional
}

// Example 1: Simple assignment (no role specified)
const simpleAssignment = await api.post('/api/assignments/', {
    person: "person-123",
    project: "project-456"
    // Just tracks that John (an Engineer) is on the project
});

// Example 2: With project-specific role
const withRole = await api.post('/api/assignments/', {
    person: "person-123",
    project: "project-789",
    allocationPercentage: 50,
    roleOnProject: "Technical Lead"  // Different from their org role of "Engineer"
});

// Example 3: Designer working as QA on a project
const crossFunctional = await api.post('/api/assignments/', {
    person: "designer-456",  // Person's org role is "Designer"
    project: "project-abc",
    roleOnProject: "QA Tester"  // Working in different capacity on this project
});
```

### Query Assignments
```typescript
// Get all assignments for a person
const getPersonAssignments = async (personId: string) => {
    return await api.get(`/api/assignments/?person=${personId}`);
};

// Get all assignments for a project
const getProjectAssignments = async (projectId: string) => {
    return await api.get(`/api/assignments/?project=${projectId}`);
};

// Get active assignments only
const getActiveAssignments = async () => {
    return await api.get('/api/assignments/?is_active=true');
};
```

---

## 📈 UTILIZATION CALCULATIONS

### Person Utilization
```python
class Person(models.Model):
    # ... existing fields ...
    
    def get_current_utilization(self):
        """Calculate how much of their capacity is allocated"""
        active_assignments = self.assignments.filter(is_active=True)
        total_allocation = active_assignments.aggregate(
            total=Sum('allocation_percentage')
        )['total'] or 0
        
        return {
            'total_allocation_percentage': total_allocation,
            'allocated_hours': (self.weekly_capacity * total_allocation) / 100,
            'available_hours': self.weekly_capacity - ((self.weekly_capacity * total_allocation) / 100),
            'is_overallocated': total_allocation > 100,
            'assignments_count': active_assignments.count()
        }
    
    @property
    def is_available(self):
        """Check if person has any availability"""
        utilization = self.get_current_utilization()
        return utilization['total_allocation_percentage'] < 100
```

### Project Staffing
```python
class Project(models.Model):
    # ... existing fields ...
    
    def get_team_summary(self):
        """Get summary of project team"""
        assignments = self.assignments.filter(is_active=True)
        
        return {
            'team_size': assignments.values('person').distinct().count(),
            'total_allocation_percentage': assignments.aggregate(Sum('allocation_percentage'))['allocation_percentage__sum'] or 0,
            'departments_involved': assignments.values('person__department__name').distinct().count(),
            'total_weekly_hours': sum([a.weekly_hours for a in assignments]),
            'by_role': assignments.values('role_on_project').annotate(
                count=Count('id'),
                hours=Sum('allocation_percentage')
            )
        }
```

---

## 🎨 UI COMPONENTS

### Quick Assignment Component
```typescript
const QuickAssign: React.FC = () => {
    const [selectedPerson, setSelectedPerson] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [allocation, setAllocation] = useState(100);
    
    const handleQuickAssign = async () => {
        if (selectedPerson && selectedProject) {
            await api.post('/api/assignments/', {
                person: selectedPerson,
                project: selectedProject,
                allocationPercentage: allocation
            });
            // Reset form
            setSelectedPerson('');
            setSelectedProject('');
            setAllocation(100);
        }
    };
    
    return (
        <div className="quick-assign">
            <select 
                value={selectedPerson} 
                onChange={(e) => setSelectedPerson(e.target.value)}
            >
                <option value="">Select Person...</option>
                {people.map(p => (
                    <option key={p.id} value={p.id}>
                        {p.name} ({p.department || 'No Dept'}) - {100 - p.currentAllocation}% available
                    </option>
                ))}
            </select>
            
            <select 
                value={selectedProject} 
                onChange={(e) => setSelectedProject(e.target.value)}
            >
                <option value="">Select Project...</option>
                {projects.map(p => (
                    <option key={p.id} value={p.id}>
                        {p.name} ({p.status})
                    </option>
                ))}
            </select>
            
            <input 
                type="number" 
                value={allocation} 
                onChange={(e) => setAllocation(Number(e.target.value))}
                min="10" 
                max="100" 
                step="10"
            />%
            
            <button onClick={handleQuickAssign}>
                Assign
            </button>
        </div>
    );
};
```

### Team View Component
```typescript
const ProjectTeamView: React.FC<{projectId: string}> = ({projectId}) => {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    
    useEffect(() => {
        loadProjectTeam();
    }, [projectId]);
    
    const loadProjectTeam = async () => {
        const response = await api.get(`/api/assignments/?project=${projectId}&is_active=true`);
        setAssignments(response.data);
    };
    
    const groupedByDepartment = assignments.reduce((acc, assignment) => {
        const dept = assignment.person.department || 'No Department';
        if (!acc[dept]) acc[dept] = [];
        acc[dept].push(assignment);
        return acc;
    }, {} as Record<string, Assignment[]>);
    
    return (
        <div className="project-team">
            <h3>Project Team</h3>
            {Object.entries(groupedByDepartment).map(([dept, people]) => (
                <div key={dept} className="department-group">
                    <h4>{dept} ({people.length} people)</h4>
                    {people.map(assignment => (
                        <div key={assignment.id} className="team-member">
                            <span>{assignment.person.name}</span>
                            <span>{assignment.roleOnProject}</span>
                            <span>{assignment.allocationPercentage}%</span>
                            <span>{assignment.weeklyHours}h/week</span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};
```

---

## 🔍 COMMON QUERIES

### Manager Queries
```python
# Find available people for a new project
available_people = Person.objects.annotate(
    current_allocation=Sum('assignments__allocation_percentage', 
                          filter=Q(assignments__is_active=True))
).filter(
    Q(current_allocation__lt=100) | Q(current_allocation__isnull=True),
    is_active=True
)

# Find overallocated people
overallocated = Person.objects.annotate(
    total_allocation=Sum('assignments__allocation_percentage',
                        filter=Q(assignments__is_active=True))
).filter(
    total_allocation__gt=100
)

# Get cross-department projects
cross_dept_projects = Project.objects.annotate(
    dept_count=Count('assignments__person__department', distinct=True)
).filter(
    dept_count__gt=1
)
```

---

## 📋 SUMMARY

With this Assignment model, you get:

1. **Many-to-many relationships**: People ↔ Projects
2. **Flexible allocation**: Part-time assignments (50%, 25%, etc.)
3. **Department tracking**: Through Person.department
4. **Cross-department projects**: Automatic through assignments
5. **Utilization tracking**: Calculate availability and overallocation
6. **Historical tracking**: Start/end dates for assignments
7. **Role flexibility**: Different roles on different projects

The Assignment model is the heart of the workload tracking system - it connects everything together while maintaining maximum flexibility.