# R2-REBUILD-STANDARDS: Coding Standards & Governance

## AI Agent Instructions
**THIS DOCUMENT GOVERNS ALL CODE GENERATION. Reference this before writing ANY code in ANY phase.**

## 🎯 Core Principles

### 1. Naming Consistency is Law
- **Backend (Python/Django)**: `snake_case` everywhere
- **Frontend (TypeScript/React)**: `camelCase` everywhere
- **API Layer**: Transform at the boundary (snake_case → camelCase)
- **NO EXCEPTIONS**

### 2. Lean Code Only
- **YAGNI**: Don't write it until needed
- **DRY**: Don't repeat yourself
- **KISS**: Keep it stupidly simple
- **No abstractions** until pattern repeats 3+ times

### 3. Zero Debt Tolerance
- **No TODO comments** - Do it now or don't do it
- **No commented code** - Delete it
- **No "temporary" fixes** - They become permanent
- **No workarounds** - Fix the root cause

---

## 📐 NAMING STANDARDS

### Backend (Python/Django)

```python
# ✅ CORRECT - All snake_case

# Models
class Person(models.Model):
    first_name = models.CharField()      # ✅ snake_case field
    weekly_capacity = models.IntegerField()  # ✅ snake_case field
    is_active = models.BooleanField()    # ✅ snake_case field
    
    def calculate_utilization(self):     # ✅ snake_case method
        return self.get_current_hours()  # ✅ snake_case

# Variables
person_list = Person.objects.all()       # ✅ snake_case
total_hours = 40                         # ✅ snake_case
is_available = True                      # ✅ snake_case

# URLs
path('api/people/', views.people_list)   # ✅ snake_case
path('api/weekly_capacity/', ...)        # ✅ snake_case

# ❌ WRONG - NEVER DO THIS
firstName = "John"          # ❌ camelCase in Python
PersonList = []            # ❌ PascalCase for variable
calculateUtilization()     # ❌ camelCase method
'api/weeklyCapacity/'      # ❌ camelCase in URLs
```

### API Serializers (Transform Layer)

```python
# Django REST Framework Serializer
# Transform snake_case (database) → camelCase (API response)

from rest_framework import serializers

class PersonSerializer(serializers.ModelSerializer):
    # Map snake_case fields to camelCase for API
    firstName = serializers.CharField(source='first_name')
    lastName = serializers.CharField(source='last_name')
    weeklyCapacity = serializers.IntegerField(source='weekly_capacity')
    isActive = serializers.BooleanField(source='is_active')
    hireDate = serializers.DateField(source='hire_date', format='%Y-%m-%d')
    
    class Meta:
        model = Person
        fields = ['id', 'firstName', 'lastName', 'weeklyCapacity', 'isActive', 'hireDate']
    
    def to_internal_value(self, data):
        """Transform camelCase input to snake_case for database"""
        # This happens automatically with 'source' mapping
        return super().to_internal_value(data)
```

### Frontend (TypeScript/React)

```typescript
// ✅ CORRECT - All camelCase

// Interfaces (PascalCase for types, camelCase for properties)
interface Person {
    id: number;
    firstName: string;          // ✅ camelCase property
    lastName: string;           // ✅ camelCase property
    weeklyCapacity: number;     // ✅ camelCase property
    isActive: boolean;          // ✅ camelCase property
    hireDate: string;          // ✅ camelCase property
}

// Variables and functions
const personList: Person[] = [];            // ✅ camelCase variable
const totalHours = 40;                      // ✅ camelCase variable
const isAvailable = true;                   // ✅ camelCase variable

function calculateUtilization(): number {    // ✅ camelCase function
    return getCurrentHours();                // ✅ camelCase
}

// React components (PascalCase)
const PersonCard: React.FC = () => {};      // ✅ PascalCase component

// Hooks (camelCase starting with 'use')
const usePerson = () => {};                 // ✅ camelCase hook
const useAuth = () => {};                   // ✅ camelCase hook

// ❌ WRONG - NEVER DO THIS
const first_name = "John";      // ❌ snake_case in TypeScript
const PersonList = [];          // ❌ PascalCase for variable
function CalculateUtilization() {} // ❌ PascalCase for function
interface person {}             // ❌ lowercase interface
const UsePerson = () => {};     // ❌ PascalCase for hook
```

### Database Tables

```sql
-- ✅ CORRECT - All snake_case
CREATE TABLE people (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100),    -- ✅ snake_case column
    last_name VARCHAR(100),     -- ✅ snake_case column
    weekly_capacity INTEGER,    -- ✅ snake_case column
    is_active BOOLEAN,         -- ✅ snake_case column
    hire_date DATE,           -- ✅ snake_case column
    created_at TIMESTAMP      -- ✅ snake_case column
);

-- Table names: plural snake_case
people                       -- ✅ Correct
projects                    -- ✅ Correct
project_assignments         -- ✅ Correct (join table)

-- ❌ WRONG
People                      -- ❌ PascalCase table
firstName                   -- ❌ camelCase column
ProjectAssignments          -- ❌ PascalCase table
```

### File Naming

```bash
# Backend (Python/Django)
people_service.py           # ✅ snake_case
project_views.py           # ✅ snake_case
test_assignments.py        # ✅ snake_case

# Frontend (TypeScript/React)
PersonCard.tsx             # ✅ PascalCase for components
usePerson.ts              # ✅ camelCase for hooks
personService.ts          # ✅ camelCase for services
types.ts                  # ✅ lowercase for utilities

# ❌ WRONG
person-card.tsx           # ❌ kebab-case
PersonService.ts          # ❌ PascalCase for service
use_person.ts            # ❌ snake_case in frontend
```

---

## 🔄 API TRANSFORMATION RULES

### The Golden Rule: Transform at the Boundary

```python
# Backend sends (Django → API)
{
    "first_name": "John",      # Database field (snake_case)
    "weekly_capacity": 40      # Database field (snake_case)
}
    ↓ Serializer transforms ↓
{
    "firstName": "John",        # API response (camelCase)
    "weeklyCapacity": 40        # API response (camelCase)
}
```

```typescript
// Frontend receives (API → React)
const response = {
    firstName: "John",          // Already camelCase from API
    weeklyCapacity: 40          // Already camelCase from API
};

// Frontend sends (React → API)
const payload = {
    firstName: "Jane",          // camelCase in request
    weeklyCapacity: 35          // camelCase in request
};
    ↓ Backend serializer transforms ↓
// Saved to database as:
{
    first_name: "Jane",         // snake_case in database
    weekly_capacity: 35         // snake_case in database
}
```

---

## 💎 LEAN CODE STANDARDS

### 1. No Premature Abstractions

```python
# ❌ WRONG - Over-abstracted from start
class AbstractBaseRepository(ABC):
    @abstractmethod
    def get_by_id(self, id): pass
    
class PersonRepository(AbstractBaseRepository):
    def get_by_id(self, id):
        return Person.objects.get(id=id)

# ✅ CORRECT - Simple and direct
def get_person(person_id):
    return Person.objects.get(id=person_id)
```

### 2. No Unnecessary Layers

```typescript
// ❌ WRONG - Too many layers
class PersonMapper {
    static toDomain(dto: PersonDTO): PersonDomain { }
    static toDTO(domain: PersonDomain): PersonDTO { }
}

// ✅ CORRECT - Direct usage
interface Person {
    id: number;
    firstName: string;
}
// Use directly, no mapping needed
```

### 3. Start Simple, Refactor When Needed

```python
# Phase 1: Simple function
def calculate_utilization(person_id):
    person = Person.objects.get(id=person_id)
    assignments = Assignment.objects.filter(person=person)
    return sum(a.weekly_hours for a in assignments)

# Phase 2: Add to model when pattern emerges (after 3+ uses)
class Person(models.Model):
    def calculate_utilization(self):
        return sum(a.weekly_hours for a in self.assignments.all())
```

### 4. No Dead Code

```typescript
// ❌ WRONG
function oldCalculation() { /* ... */ }  // Not used anywhere
// function newCalculation() { /* TODO: implement */ }  // Commented code
const LEGACY_CONSTANT = 42;  // Not referenced

// ✅ CORRECT - Only living code
function calculateUtilization() { /* ... */ }  // Actually used
```

---

## 📏 CODE QUALITY RULES

### 1. Function Length
- **Maximum**: 20 lines
- **Ideal**: 5-10 lines
- If longer, extract to smaller functions

### 2. File Length
- **Maximum**: 200 lines
- **Ideal**: 50-150 lines
- If longer, split into modules

### 3. Dependencies
- **Maximum**: 5 imports per file
- Use only what's needed
- No circular dependencies

### 4. Comments
```python
# ❌ WRONG - Obvious comment
# Increment counter by 1
counter += 1

# ✅ CORRECT - Only when adds value
# Utilization >100% is valid for overtime scenarios
if utilization > 100:
    send_overtime_alert()
```

---

## 🎨 UI LAYOUT & DESIGN STANDARDS

### Split-Panel Layout Standards

#### When to Use Split-Panel Layouts:
- **Master-detail relationships** (projects → project details)
- **Lists with rich detail views** (assignments → assignment details) 
- **Data that benefits from side-by-side comparison**
- **Complex forms with live preview**

#### Implementation Requirements:
```typescript
// ✅ CORRECT - Full-width split panel
return (
  <div className="min-h-screen bg-[#1e1e1e] flex">
    <Sidebar />
    <div className="flex-1 flex h-screen">
      {/* Left Panel - 50% width */}
      <div className="w-1/2 border-r border-[#3e3e42] flex flex-col">
        {/* Filterable/sortable list */}
      </div>
      {/* Right Panel - 50% width */}
      <div className="w-1/2 flex flex-col bg-[#2d2d30]">
        {/* Detailed view with inline editing */}
      </div>
    </div>
  </div>
);

// ❌ WRONG - Centered container limits data density
return (
  <Layout>
    <div className="max-w-7xl mx-auto">
      {/* Not enough space for dense data */}
    </div>
  </Layout>
);
```

#### Split-Panel Rules:
- **Full browser width** (remove Layout wrapper for data-heavy pages)
- **Left panel: 50% width** - filterable/sortable list
- **Right panel: 50% width** - detailed view with inline editing
- **Keyboard navigation** must respect current sort/filter order
- **Auto-select first item** AFTER applying sort/filter, not before

### Input Field Standards

#### Number Input Spinner Removal:
```typescript
// ✅ CORRECT - Clean number input for manual entry
<input
  type="number"
  className="... [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
/>

// ❌ WRONG - Distracting spinners for manual-only fields
<input type="number" />  // Shows up/down arrows
```

#### Inline Editing Patterns:
```typescript
// ✅ CORRECT - Preserve existing values during edit
const handleEditStart = (item) => {
  setEditData({
    field: item.existingValue || '',  // Show existing value
    searchTerm: item.existingValue || ''  // Don't clear on focus
  });
};

// ❌ WRONG - Clear fields on edit start
const handleEditStart = (item) => {
  setEditData({
    field: '',  // User thinks they need to retype everything
  });
};
```

### Autocomplete Standards

#### Data Source Management:
```typescript
// ✅ CORRECT - Collect from all relevant sources
const collectAutocompleteOptions = () => {
  const options = new Set<string>();
  
  // Add from existing records
  existingRecords.forEach(record => {
    if (record.field) options.add(record.field);
  });
  
  // Add from related entities
  relatedEntities.forEach(entity => {
    if (entity.field) options.add(entity.field);
  });
  
  return Array.from(options).sort();
};

// ❌ WRONG - Limited data source
const options = ['Option 1', 'Option 2'];  // Hardcoded list
```

---

## 🔄 BACKEND-FRONTEND INTEGRATION STANDARDS

### Serializer Field Completeness Rule

**CRITICAL**: Every model field that the frontend needs MUST be explicitly included in the serializer.

#### Required Serializer Pattern:
```python
# ✅ CORRECT - Complete serializer
class AssignmentSerializer(serializers.ModelSerializer):
    # Map ALL frontend-needed fields
    personName = serializers.CharField(source='person.name', read_only=True)
    roleOnProject = serializers.CharField(source='role_on_project', required=False)
    weeklyHours = serializers.JSONField(source='weekly_hours')
    
    class Meta:
        model = Assignment
        fields = [
            'id',
            'person', 
            'personName',       # ✅ Explicitly included
            'roleOnProject',    # ✅ Explicitly included
            'weeklyHours',      # ✅ Explicitly included
            # ... all other fields frontend needs
        ]

# ❌ WRONG - Missing fields
class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = ['id', 'person']  # ❌ Missing roleOnProject, etc.
```

#### Field Mapping Verification Checklist:
1. ✅ Model field exists (`role_on_project` in database)
2. ✅ Serializer field defined (`roleOnProject = serializers.CharField(source='role_on_project')`)
3. ✅ Field included in Meta.fields list (`'roleOnProject'`)
4. ✅ Container restarted after serializer changes
5. ✅ Full cycle tested: frontend save → backend store → frontend retrieve → display

### Data Flow Debugging Protocol

#### Standard Debugging Pattern:
```typescript
// Frontend - Log what's being sent
const updateData = { roleOnProject: 'New Role' };
console.log('Sending to backend:', updateData);

const response = await api.update(id, updateData);
console.log('Backend returned:', response);

// After refresh
const refreshedData = await api.list();
console.log('Refreshed data:', refreshedData.map(item => ({
  id: item.id,
  roleOnProject: item.roleOnProject  // Verify field is present
})));
```

#### Error Investigation Sequence:
1. **Frontend logs**: Verify data being sent
2. **Backend logs**: Verify data received and processed
3. **Database check**: Verify data stored correctly
4. **Serializer check**: Verify fields included in response
5. **Container restart**: Always required after serializer changes

### State Management Rules

#### Auto-Selection Logic:
```typescript
// ✅ CORRECT - Select after sorting/filtering
const sortedItems = useMemo(() => {
  return items.sort(/* sorting logic */);
}, [items, sortBy, sortDirection]);

useEffect(() => {
  // Auto-select first item from sorted list
  if (sortedItems.length > 0 && !selectedItem) {
    setSelectedItem(sortedItems[0]);
    setSelectedIndex(0);
  }
}, [sortedItems, selectedItem]);

// ❌ WRONG - Select before sorting
useEffect(() => {
  if (items.length > 0) {
    setSelectedItem(items[0]);  // Wrong - uses unsorted list
  }
}, [items]);
```

#### Local vs Server State Rules:
```typescript
// ✅ CORRECT - Update local state after successful save
const handleSave = async (data) => {
  const updated = await api.update(id, data);
  
  // Option 1: Optimistic local update (faster UX)
  setItems(prev => prev.map(item => 
    item.id === id ? { ...item, ...data } : item
  ));
  
  // Option 2: Server refresh (data consistency)
  // Use when server may modify data during save
  await loadItems();
};

// ❌ WRONG - Always refetch or never update local state
```

---

## 🚫 ERROR PREVENTION PROTOCOLS

### Component Initialization Order

#### Computed Values Before useEffects:
```typescript
// ✅ CORRECT - Dependencies defined before usage
const filteredItems = items.filter(/* filtering logic */);
const sortedItems = [...filteredItems].sort(/* sorting logic */);

useEffect(() => {
  // Now sortedItems is defined
  if (sortedItems.length > 0) {
    setSelectedItem(sortedItems[0]);
  }
}, [sortedItems]);

// ❌ WRONG - useEffect before computed value
useEffect(() => {
  if (sortedItems.length > 0) {  // ❌ sortedItems not defined yet
    setSelectedItem(sortedItems[0]);
  }
}, [sortedItems]);

const sortedItems = [...items].sort(/* sorting logic */);  // Too late
```

### Container Restart Requirements

#### When Container Restart is MANDATORY:
- ✅ After serializer field changes
- ✅ After model field additions
- ✅ After settings.py modifications
- ✅ After requirements.txt changes

```bash
# ✅ CORRECT - Always restart after backend changes
docker-compose restart backend
# Wait for restart to complete before testing

# ❌ WRONG - Assume hot reload works for everything
```

### Schema-API Alignment Checklist

#### Before Marking Feature Complete:
1. ✅ Database field exists in model
2. ✅ Serializer includes field with proper mapping
3. ✅ TypeScript interface includes field
4. ✅ Frontend sends field in requests
5. ✅ Backend saves field to database
6. ✅ Backend returns field in responses
7. ✅ Frontend displays field in UI
8. ✅ Full CRUD cycle tested
9. ✅ Page refresh preserves data

---

## 🎯 USER EXPERIENCE PATTERNS

### Progressive Disclosure Rules

#### Preserve Context During Editing:
```typescript
// ✅ CORRECT - Show existing data during edit
const handleEditMode = (item) => {
  setEditData({
    field: item.existingValue || '',
    searchTerm: item.existingValue || ''  // Keep existing value visible
  });
  setEditMode(true);
};

// ❌ WRONG - Clear context on edit
const handleEditMode = (item) => {
  setEditData({
    field: '',  // User loses context
    searchTerm: ''
  });
};
```

### Visual Feedback Standards

#### Loading, Error, and Success States:
```typescript
// ✅ REQUIRED - Always show operation state
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleSave = async (data) => {
  try {
    setLoading(true);
    setError(null);
    await api.save(data);
    // Show success feedback
  } catch (err) {
    setError('Failed to save: ' + err.message);
  } finally {
    setLoading(false);
  }
};
```

---

## 🚦 VALIDATION CHECKLIST

### Before Committing Any Code

#### Backend Checklist
- [ ] All Python variables use `snake_case`
- [ ] All model fields use `snake_case`
- [ ] All methods use `snake_case`
- [ ] Serializers map to `camelCase` for API
- [ ] All frontend-needed fields included in serializer
- [ ] Field mappings tested end-to-end
- [ ] Container restarted after serializer changes
- [ ] No unused imports
- [ ] No TODO comments
- [ ] Functions under 20 lines

#### Frontend Checklist
- [ ] All TypeScript variables use `camelCase`
- [ ] All interface properties use `camelCase`
- [ ] Components use `PascalCase`
- [ ] Hooks start with `use` and are `camelCase`
- [ ] No `any` types
- [ ] No console.log statements (except debugging)
- [ ] No commented code
- [ ] Computed values defined before useEffects
- [ ] Auto-selection respects sort/filter order
- [ ] Inline editing preserves existing values
- [ ] Number inputs remove spinners when appropriate

#### UI/UX Checklist
- [ ] Split-panel layouts use full browser width
- [ ] Data-heavy pages avoid Layout wrapper constraints
- [ ] Autocomplete sources collect from all relevant data
- [ ] Loading/error/success states implemented
- [ ] Keyboard navigation works with current view state
- [ ] Progressive disclosure maintains user context

#### API Integration Checklist
- [ ] Request accepts `camelCase`
- [ ] Response returns `camelCase`
- [ ] Database stores `snake_case`
- [ ] Dates use `YYYY-MM-DD` format
- [ ] Full CRUD cycle tested
- [ ] Data flow debugging logs implemented
- [ ] Page refresh preserves all data

---

## 🔨 ENFORCEMENT TOOLS

### Automated Linting

```bash
# Backend (.flake8)
[flake8]
naming-convention = snake_case
max-line-length = 100
max-complexity = 10

# Frontend (.eslintrc)
{
  "rules": {
    "camelcase": ["error", {"properties": "always"}],
    "no-console": "error",
    "no-unused-vars": "error",
    "no-todo-comments": "error"
  }
}
```

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: check-naming
        name: Check naming conventions
        entry: ./scripts/check-naming.sh
        language: script
```

---

## 🎭 COMMON SCENARIOS

### Scenario 1: Creating a New Model

```python
# ✅ CORRECT WAY

# 1. Django Model (backend/apps/people/models.py)
class Person(models.Model):
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    weekly_capacity = models.IntegerField(default=40)
    
# 2. Serializer (backend/apps/people/serializers.py)
class PersonSerializer(serializers.ModelSerializer):
    firstName = serializers.CharField(source='first_name')
    lastName = serializers.CharField(source='last_name')
    weeklyCapacity = serializers.IntegerField(source='weekly_capacity')
    
# 3. TypeScript Interface (frontend/src/types/index.ts)
interface Person {
    id: number;
    firstName: string;
    lastName: string;
    weeklyCapacity: number;
}
```

### Scenario 2: API Endpoint

```python
# Backend View
@api_view(['POST'])
def create_person(request):
    serializer = PersonSerializer(data=request.data)
    # request.data has camelCase from frontend
    # serializer converts to snake_case for database
    if serializer.is_valid():
        serializer.save()  # Saves with snake_case
        return Response(serializer.data)  # Returns camelCase
```

```typescript
// Frontend Call
const createPerson = async (person: Omit<Person, 'id'>) => {
    // person has camelCase properties
    const response = await api.post('/api/people/', person);
    return response.data;  // Returns camelCase
};
```

---

## ⚠️ CRITICAL RULES - NO EXCEPTIONS

1. **NEVER** mix naming conventions in the same layer
2. **NEVER** use `any` type in TypeScript
3. **NEVER** leave TODO comments
4. **NEVER** commit commented code
5. **NEVER** create abstraction for single use
6. **ALWAYS** transform at API boundary
7. **ALWAYS** validate types at runtime boundaries
8. **ALWAYS** use the framework's conventions

---

## 📊 DEBT METRICS

Track these to ensure lean code:

```yaml
Maximum Allowed:
  - TODO comments: 0
  - Commented code blocks: 0
  - Any types: 0
  - Mixed naming: 0
  - Functions over 20 lines: 0
  - Files over 200 lines: 0
  - Circular dependencies: 0
```

---

## 🤖 AI AGENT COMPLIANCE

When generating code, the AI agent MUST:

1. **Check this document** before writing any code
2. **Use language-appropriate naming** without exception
3. **Transform at API boundaries** only
4. **Write minimal code** that solves the immediate problem
5. **Refuse to add** TODOs, comments, or "temporary" solutions

Example AI agent self-check:
```
Before generating code, verify:
- [ ] Is this Python? Use snake_case
- [ ] Is this TypeScript? Use camelCase  
- [ ] Is this an API serializer? Map snake_case to camelCase
- [ ] Is this the simplest solution?
- [ ] Am I adding any debt?
```

This document is **THE LAW** for the project. Any deviation requires explicit justification and approval.