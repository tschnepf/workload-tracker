# R2-REBUILD-ROLE-CLARITY: Understanding Roles in the System

## AI Agent Instructions
**This document clarifies the difference between organizational roles and project roles.**

## 🎯 Two Types of Roles

### 1. **Organizational Role** (Person.role)
- The person's job title/position in the company
- Stored on the Person model
- Examples: "Engineer", "Designer", "Manager", "Analyst"
- Default: "Engineer"
- Stays the same across all projects

### 2. **Project Role** (Assignment.role_on_project) 
- The person's specific role on a particular project
- Stored on the Assignment model
- Examples: "Technical Lead", "Code Reviewer", "Subject Matter Expert"
- Default: None (completely optional)
- Can be different for each project

---

## 📊 Role Usage Examples

### Scenario 1: Simple Assignment (No Project Role)
```python
# Jane is an Engineer (org role)
jane = Person.objects.create(
    name="Jane Smith",
    role="Engineer"  # Her organizational role
)

# Assign Jane to Project Alpha - no special project role needed
Assignment.objects.create(
    person=jane,
    project=project_alpha
    # role_on_project is NULL - we just need to track she's on it
)
```

### Scenario 2: Project-Specific Role
```python
# Bob is a Junior Developer (org role)
bob = Person.objects.create(
    name="Bob Jones", 
    role="Junior Developer"
)

# But on Project Beta, Bob is the Technical Lead
Assignment.objects.create(
    person=bob,
    project=project_beta,
    role_on_project="Technical Lead"  # His role on THIS project
)

# On Project Gamma, Bob is just a contributor (no special role)
Assignment.objects.create(
    person=bob,
    project=project_gamma
    # role_on_project is NULL
)
```

### Scenario 3: Cross-Functional Assignment
```python
# Sarah is a Designer (org role)
sarah = Person.objects.create(
    name="Sarah Lee",
    role="Designer"
)

# But she's helping with QA on an urgent project
Assignment.objects.create(
    person=sarah,
    project=urgent_project,
    role_on_project="QA Support",  # Helping outside her normal role
    allocation_percentage=25  # Part-time help
)
```

---

## 🔍 Querying and Display

### Display Logic
```typescript
// When showing assignments
const displayAssignment = (assignment: Assignment) => {
    const person = assignment.person;
    const project = assignment.project;
    
    // Option 1: Simple display (most common)
    if (!assignment.roleOnProject) {
        return `${person.name} (${person.role}) on ${project.name}`;
        // Output: "Jane Smith (Engineer) on Project Alpha"
    }
    
    // Option 2: With project role
    return `${person.name} (${person.role}) on ${project.name} as ${assignment.roleOnProject}`;
    // Output: "Bob Jones (Junior Developer) on Project Beta as Technical Lead"
};
```

### Manager Views
```python
# Get all Technical Leads across projects
tech_leads = Assignment.objects.filter(
    role_on_project="Technical Lead",
    is_active=True
).select_related('person', 'project')

# Get people working outside their normal role
cross_functional = Assignment.objects.exclude(
    role_on_project__isnull=True
).select_related('person', 'project')

# Simple team list (ignoring project roles)
team = Assignment.objects.filter(
    project=my_project,
    is_active=True
).values('person__name', 'person__role', 'allocation_percentage')
```

---

## 💡 Best Practices

### When to Use Project Roles
✅ **Do use** when:
- Someone has special responsibility (Lead, Coordinator, Owner)
- Someone is working outside their normal function
- Project needs role clarity for communication
- Regulatory/compliance requires role documentation

❌ **Don't use** when:
- Person is doing their normal job
- Role matches their organizational role
- You're just tracking who's on what
- It adds complexity without value

### Implementation Flexibility
```python
# Migration friendly - can add project roles later
class Assignment(models.Model):
    # Start without project roles
    person = models.ForeignKey('Person', ...)
    project = models.ForeignKey('Project', ...)
    
    # Add this field later if needed
    role_on_project = models.CharField(
        max_length=100,
        blank=True,
        null=True,  # Nullable means it's truly optional
        help_text="Only fill if different from organizational role"
    )
```

---

## 🎨 UI Recommendations

### Assignment Form
```typescript
const AssignmentForm: React.FC = () => {
    const [showProjectRole, setShowProjectRole] = useState(false);
    
    return (
        <form>
            {/* Required fields */}
            <select name="person" required>
                <option>Select Person...</option>
                {people.map(p => (
                    <option key={p.id} value={p.id}>
                        {p.name} ({p.role})
                    </option>
                ))}
            </select>
            
            <select name="project" required>
                <option>Select Project...</option>
                {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
            
            {/* Optional project role - hidden by default */}
            {!showProjectRole && (
                <button type="button" onClick={() => setShowProjectRole(true)}>
                    + Add project-specific role (optional)
                </button>
            )}
            
            {showProjectRole && (
                <input 
                    type="text" 
                    name="roleOnProject"
                    placeholder="Role on this project (e.g., Technical Lead)"
                />
            )}
            
            <button type="submit">Create Assignment</button>
        </form>
    );
};
```

### Team Display
```typescript
const TeamList: React.FC<{assignments: Assignment[]}> = ({assignments}) => {
    return (
        <div className="team-list">
            {assignments.map(a => (
                <div key={a.id} className="team-member">
                    <span className="name">{a.person.name}</span>
                    <span className="org-role">{a.person.role}</span>
                    {a.roleOnProject && (
                        <span className="project-role">
                            Project Role: {a.roleOnProject}
                        </span>
                    )}
                    <span className="allocation">{a.allocationPercentage}%</span>
                </div>
            ))}
        </div>
    );
};
```

---

## 📋 Summary

| Aspect | Organizational Role | Project Role |
|--------|-------------------|--------------|
| **Model** | Person.role | Assignment.role_on_project |
| **Required** | Has default ("Engineer") | Completely optional (NULL) |
| **Scope** | Same across all projects | Can vary per project |
| **Purpose** | Job title/position | Project-specific responsibility |
| **Examples** | "Engineer", "Designer", "Manager" | "Tech Lead", "SME", "Coordinator" |
| **When to use** | Always (has default) | Only when adds value |

The key insight: **Most assignments won't need a project role.** It's there for flexibility when you need it, but the system works perfectly fine without it. This keeps data entry simple while allowing complexity when actually needed.