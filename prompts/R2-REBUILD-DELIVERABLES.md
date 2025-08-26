# R2-REBUILD-DELIVERABLES: Project Deliverables System

## AI Agent Instructions
**This document defines the flexible deliverable tracking system for projects.**

## 🎯 Core Principle: Maximum Flexibility
- Any combination of percentage, description, date, and notes
- Unlimited deliverables per project
- Manual ordering control
- All fields optional except the deliverable must have at least one field

---

## 📋 DELIVERABLE MODEL

### Core Deliverable Fields (All Optional!)
```python
class Deliverable(models.Model):
    """Flexible milestone/deliverable tracking for projects"""
    
    # REQUIRED - Link to project
    project = models.ForeignKey('Project', on_delete=models.CASCADE, related_name='deliverables')
    
    # ALL OPTIONAL - Use any combination
    percentage = models.IntegerField(
        blank=True, 
        null=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Completion percentage (0-100)"
    )
    
    description = models.CharField(
        max_length=200, 
        blank=True,
        help_text="Brief description (e.g., SD, DD, IFP, IFC)"
    )
    
    date = models.DateField(
        blank=True, 
        null=True,
        help_text="Target or actual date - can be removed if project on hold"
    )
    
    notes = models.TextField(
        blank=True,
        help_text="Additional details, owner info, requirements, etc."
    )
    
    # ORDERING - For manual sort control
    sort_order = models.IntegerField(
        default=0,
        help_text="Lower numbers appear first"
    )
    
    # STATUS - Track completion
    is_completed = models.BooleanField(
        default=False,
        help_text="Mark when deliverable is done"
    )
    
    completed_date = models.DateField(
        blank=True,
        null=True,
        help_text="When it was actually completed"
    )
    
    # AUTOMATIC - System fields
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['sort_order', 'percentage', 'date', 'created_at']
        
    def clean(self):
        """Ensure at least one field has data"""
        if not any([self.percentage is not None, self.description, self.date, self.notes]):
            raise ValidationError("Deliverable must have at least one field filled")
    
    def __str__(self):
        parts = []
        if self.percentage is not None:
            parts.append(f"{self.percentage}%")
        if self.description:
            parts.append(self.description)
        if self.date:
            parts.append(str(self.date))
        return " - ".join(parts) if parts else f"Deliverable #{self.id}"
```

---

## 🏗️ DEFAULT DELIVERABLES

### Project Creation with Defaults
```python
def create_project_with_default_deliverables(name, **kwargs):
    """Create a project with standard deliverables"""
    
    # Create the project
    project = Project.objects.create(name=name, **kwargs)
    
    # Default deliverables (35% SD, 75% DD, 95% IFP, 100% IFC)
    default_deliverables = [
        {'percentage': 35, 'description': 'SD', 'sort_order': 10},
        {'percentage': 75, 'description': 'DD', 'sort_order': 20},
        {'percentage': 95, 'description': 'IFP', 'sort_order': 30},
        {'percentage': 100, 'description': 'IFC', 'sort_order': 40},
    ]
    
    for deliverable_data in default_deliverables:
        Deliverable.objects.create(
            project=project,
            **deliverable_data
        )
    
    return project

# Or as a model method
class Project(models.Model):
    # ... existing fields ...
    
    def initialize_default_deliverables(self):
        """Add default deliverables if none exist"""
        if not self.deliverables.exists():
            defaults = [
                {'percentage': 35, 'description': 'SD', 'sort_order': 10},
                {'percentage': 75, 'description': 'DD', 'sort_order': 20},
                {'percentage': 95, 'description': 'IFP', 'sort_order': 30},
                {'percentage': 100, 'description': 'IFC', 'sort_order': 40},
            ]
            for d in defaults:
                Deliverable.objects.create(project=self, **d)
```

---

## 🔄 API ENDPOINTS

### Create Project with Default Deliverables
```typescript
// Frontend - Create project with defaults
const createProjectWithDefaults = async (name: string) => {
    // Create project
    const project = await api.post('/api/projects/', { name });
    
    // Initialize default deliverables
    await api.post(`/api/projects/${project.id}/initialize-deliverables/`);
    
    return project;
};
```

### Deliverable CRUD Operations
```typescript
interface DeliverableRequest {
    project?: string;           // Required for creation only
    percentage?: number | null; // Optional (0-100)
    description?: string;       // Optional
    date?: string | null;       // Optional (YYYY-MM-DD format or null)
    notes?: string;            // Optional
    sortOrder?: number;        // Optional (for ordering)
    isCompleted?: boolean;     // Optional
}

// Create deliverable
const createDeliverable = async (projectId: string, data: DeliverableRequest) => {
    return await api.post('/api/deliverables/', {
        project: projectId,
        ...data
    });
};

// Update deliverable (including removing date)
const updateDeliverable = async (id: string, data: DeliverableRequest) => {
    return await api.put(`/api/deliverables/${id}/`, data);
};

// Example: Remove date when project goes on hold
const putProjectOnHold = async (deliverableId: string) => {
    return await api.patch(`/api/deliverables/${deliverableId}/`, {
        date: null  // Remove the date
    });
};

// Delete deliverable
const deleteDeliverable = async (id: string) => {
    return await api.delete(`/api/deliverables/${id}/`);
};

// Reorder deliverables
const reorderDeliverables = async (projectId: string, orderedIds: string[]) => {
    return await api.post(`/api/projects/${projectId}/reorder-deliverables/`, {
        deliverable_ids: orderedIds
    });
};
```

---

## 🎨 UI COMPONENTS

### Deliverable Management Interface
```typescript
const ProjectDeliverablesManager: React.FC<{projectId: string}> = ({projectId}) => {
    const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    
    return (
        <div className="deliverables-manager">
            <h3>Project Deliverables</h3>
            
            {/* Deliverables Table */}
            <table className="deliverables-table">
                <thead>
                    <tr>
                        <th>%</th>
                        <th>Description</th>
                        <th>Date</th>
                        <th>Notes</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {deliverables.map((d, index) => (
                        <DeliverableRow 
                            key={d.id} 
                            deliverable={d}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                            onMoveUp={() => moveDeliverable(index, index - 1)}
                            onMoveDown={() => moveDeliverable(index, index + 1)}
                        />
                    ))}
                </tbody>
            </table>
            
            {/* Add Deliverable Button */}
            <button onClick={() => setShowAddForm(true)}>
                + Add Deliverable
            </button>
            
            {/* Quick Add Form */}
            {showAddForm && (
                <QuickDeliverableForm 
                    onSave={handleAddDeliverable}
                    onCancel={() => setShowAddForm(false)}
                />
            )}
        </div>
    );
};

const DeliverableRow: React.FC<{deliverable: Deliverable}> = ({deliverable, onUpdate}) => {
    const [editing, setEditing] = useState(false);
    const [data, setData] = useState(deliverable);
    
    if (editing) {
        return (
            <tr>
                <td>
                    <input 
                        type="number" 
                        value={data.percentage || ''} 
                        onChange={(e) => setData({...data, percentage: e.target.value ? Number(e.target.value) : null})}
                        placeholder="-"
                        className="small-input"
                        min="0"
                        max="100"
                    />
                </td>
                <td>
                    <input 
                        type="text" 
                        value={data.description || ''} 
                        onChange={(e) => setData({...data, description: e.target.value})}
                        placeholder="Description"
                    />
                </td>
                <td>
                    <input 
                        type="date" 
                        value={data.date || ''} 
                        onChange={(e) => setData({...data, date: e.target.value || null})}
                    />
                    {data.date && (
                        <button onClick={() => setData({...data, date: null})}>×</button>
                    )}
                </td>
                <td>
                    <input 
                        type="text" 
                        value={data.notes || ''} 
                        onChange={(e) => setData({...data, notes: e.target.value})}
                        placeholder="Notes"
                    />
                </td>
                <td>
                    <input 
                        type="checkbox" 
                        checked={data.isCompleted}
                        onChange={(e) => setData({...data, isCompleted: e.target.checked})}
                    />
                </td>
                <td>
                    <button onClick={() => {onUpdate(data); setEditing(false);}}>Save</button>
                    <button onClick={() => setEditing(false)}>Cancel</button>
                </td>
            </tr>
        );
    }
    
    return (
        <tr className={deliverable.isCompleted ? 'completed' : ''}>
            <td>{deliverable.percentage !== null ? `${deliverable.percentage}%` : '-'}</td>
            <td>{deliverable.description || '-'}</td>
            <td>{deliverable.date || '-'}</td>
            <td>{deliverable.notes || '-'}</td>
            <td>{deliverable.isCompleted ? '✓' : ''}</td>
            <td>
                <button onClick={() => setEditing(true)}>Edit</button>
                <button onClick={() => onDelete(deliverable.id)}>Delete</button>
                <button onClick={onMoveUp}>↑</button>
                <button onClick={onMoveDown}>↓</button>
            </td>
        </tr>
    );
};

const QuickDeliverableForm: React.FC = ({onSave, onCancel}) => {
    const [data, setData] = useState<DeliverableRequest>({});
    
    return (
        <div className="quick-form">
            <input 
                type="number" 
                placeholder="% (optional)"
                value={data.percentage || ''}
                onChange={(e) => setData({...data, percentage: e.target.value ? Number(e.target.value) : undefined})}
                min="0"
                max="100"
            />
            <input 
                type="text" 
                placeholder="Description (optional)"
                value={data.description || ''}
                onChange={(e) => setData({...data, description: e.target.value})}
            />
            <input 
                type="date" 
                placeholder="Date (optional)"
                value={data.date || ''}
                onChange={(e) => setData({...data, date: e.target.value})}
            />
            <input 
                type="text" 
                placeholder="Notes (optional)"
                value={data.notes || ''}
                onChange={(e) => setData({...data, notes: e.target.value})}
            />
            <button onClick={() => onSave(data)}>Add</button>
            <button onClick={onCancel}>Cancel</button>
        </div>
    );
};
```

---

## 📊 USAGE EXAMPLES

### Example 1: Standard Engineering Project
```python
project = Project.objects.create(name="Building Renovation")
project.initialize_default_deliverables()

# After creation, deliverables are:
# 35% - SD
# 75% - DD  
# 95% - IFP
# 100% - IFC

# Add dates and notes later
sd = project.deliverables.get(description='SD')
sd.date = date(2025, 3, 15)
sd.notes = "Owner review required"
sd.save()
```

### Example 2: Simple Project (Few Deliverables)
```python
simple_project = Project.objects.create(name="Quick Fix")

Deliverable.objects.create(
    project=simple_project,
    description="Complete",
    percentage=100,
    sort_order=10
)
```

### Example 3: Complex Project (Many Deliverables)
```python
complex_project = Project.objects.create(name="Multi-Phase Development")

# Can have 30+ deliverables
deliverables = [
    {'percentage': 5, 'description': 'Kickoff', 'date': date(2025, 1, 15)},
    {'percentage': 10, 'description': 'Requirements', 'date': date(2025, 2, 1)},
    {'percentage': 15, 'description': 'Initial Design'},
    {'percentage': 20, 'description': 'Design Review', 'notes': 'Client approval needed'},
    # ... many more ...
    {'percentage': 100, 'description': 'Project Close', 'date': date(2025, 12, 31)},
]

for i, d in enumerate(deliverables):
    Deliverable.objects.create(
        project=complex_project,
        sort_order=(i + 1) * 10,
        **d
    )
```

### Example 4: Project Goes On Hold
```python
# Remove dates when project goes on hold
project = Project.objects.get(name="Paused Project")
project.deliverables.update(date=None)

# Re-add dates when project resumes
project.deliverables.filter(description='SD').update(date=date(2025, 6, 1))
```

---

## 🔍 MANAGER QUERIES

### Track Project Progress
```python
def get_project_progress(project):
    """Get overall project progress based on completed deliverables"""
    deliverables = project.deliverables.filter(percentage__isnull=False)
    
    if not deliverables.exists():
        return None
    
    # Find highest completed percentage
    completed = deliverables.filter(is_completed=True).order_by('-percentage').first()
    
    if completed:
        return completed.percentage
    else:
        return 0

# Get upcoming deliverables across all projects
upcoming = Deliverable.objects.filter(
    date__isnull=False,
    date__gte=date.today(),
    date__lte=date.today() + timedelta(days=30),
    is_completed=False
).select_related('project').order_by('date')

# Find at-risk deliverables (due soon but not completed)
at_risk = Deliverable.objects.filter(
    date__isnull=False,
    date__lte=date.today() + timedelta(days=7),
    is_completed=False
).select_related('project')
```

---

## 📋 SUMMARY

The Deliverable system provides:

1. **Complete flexibility** - Any combination of percentage, description, date, notes
2. **Unlimited quantity** - No cap on deliverables per project
3. **Manual ordering** - Full control over display order
4. **Default templates** - Standard deliverables (SD, DD, IFP, IFC) auto-created
5. **Date flexibility** - Dates can be added/removed as needed
6. **Progress tracking** - Mark deliverables as completed
7. **Simple data entry** - All fields optional (except need at least one)

This system handles everything from simple 1-deliverable projects to complex 30+ milestone projects, while keeping data entry fast and flexible.