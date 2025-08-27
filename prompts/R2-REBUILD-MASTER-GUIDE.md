# R2-REBUILD-MASTER-GUIDE: Complete Implementation Plan

## 🎯 Project Philosophy
**Build Working Software in Testable Chunks**
- Complete database schema from Day 1 (no painful migrations later)
- Progressive feature activation (use more fields as you build)
- Testable milestones every 4-6 hours
- Working software at each checkpoint

## 📊 Complete Database Schema (Day 1)

### Core Models - Create All Fields Upfront
```python
# people/models.py
class Person(models.Model):
    """Complete person model - all fields from Day 1, use progressively"""
    
    # === CORE FIELDS (Required, used from Chunk 2) ===
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=200)  # ONLY required field for users
    weekly_capacity = models.IntegerField(default=36)
    role = models.CharField(max_length=100, default='Engineer')
    
    # === CONTACT FIELDS (Optional, used from Chunk 4) ===
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    location = models.CharField(max_length=100, blank=True, null=True)
    
    # === EMPLOYMENT FIELDS (Optional, used from Chunk 6) ===
    hire_date = models.DateField(blank=True, null=True)
    department = models.ForeignKey('Department', on_delete=models.SET_NULL, blank=True, null=True)
    
    # === METADATA (Optional, future expansion) ===
    notes = models.TextField(blank=True)
    skills = models.ManyToManyField('Skill', blank=True)
    metadata = models.JSONField(default=dict, blank=True)  # Future flexibility
    
    # === SYSTEM FIELDS (Automatic) ===
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name
    
    # === BUSINESS LOGIC (Add as needed per chunk) ===
    def get_current_utilization(self):
        """Calculate current utilization - implement in Chunk 3"""
        active_assignments = self.assignments.filter(is_active=True)
        total_allocation = sum(a.allocation_percentage for a in active_assignments)
        return {
            'total_percentage': total_allocation,
            'allocated_hours': (self.weekly_capacity * total_allocation) / 100,
            'available_hours': self.weekly_capacity - ((self.weekly_capacity * total_allocation) / 100),
            'is_overallocated': total_allocation > 100
        }
    
    @property
    def is_available(self):
        """Check availability - implement in Chunk 4"""
        return self.get_current_utilization()['total_percentage'] < 100

# departments/models.py
class Department(models.Model):
    """Department model - create Day 1, populate Chunk 6"""
    
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    parent_department = models.ForeignKey('self', on_delete=models.SET_NULL, blank=True, null=True)
    manager = models.ForeignKey('people.Person', on_delete=models.SET_NULL, blank=True, null=True)
    description = models.TextField(blank=True)
    
    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name

# projects/models.py
class Project(models.Model):
    """Project model - create Day 1, migrate to in Chunk 5"""
    
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=200)
    
    # Basic project info (use from Chunk 5)
    status = models.CharField(max_length=20, choices=[
        ('planning', 'Planning'),
        ('active', 'Active'),
        ('on_hold', 'On Hold'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ], default='active')
    client = models.CharField(max_length=100, blank=True, default='Internal')
    description = models.TextField(blank=True)
    
    # Dates (optional, add when needed)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    estimated_hours = models.IntegerField(blank=True, null=True)
    
    # Metadata for future expansion
    project_number = models.CharField(max_length=50, blank=True, unique=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    
    # System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at', 'name']
    
    def __str__(self):
        return self.name

# assignments/models.py
class Assignment(models.Model):
    """Assignment model - the heart of workload tracking"""
    
    id = models.AutoField(primary_key=True)
    person = models.ForeignKey('people.Person', on_delete=models.CASCADE, related_name='assignments')
    
    # === FLEXIBLE PROJECT REFERENCE (Migration-safe) ===
    # Chunk 3: Use project_name only
    # Chunk 5: Migrate to project FK, keep project_name as backup
    project_name = models.CharField(max_length=200, blank=True, null=True)
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, blank=True, null=True)
    
    # === ALLOCATION (Core feature) ===
    allocation_percentage = models.IntegerField(default=100)
    
    # === OPTIONAL DETAILS (Add usage per chunk) ===
    role_on_project = models.CharField(max_length=100, blank=True, null=True)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    notes = models.TextField(blank=True)
    
    # === SYSTEM FIELDS ===
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = [['person', 'project', 'is_active']]  # Prevent duplicates
        ordering = ['-created_at']
    
    def __str__(self):
        project_display = self.project.name if self.project else self.project_name
        return f"{self.person.name} on {project_display} ({self.allocation_percentage}%)"
    
    # === BUSINESS LOGIC ===
    @property
    def weekly_hours(self):
        """Calculate weekly hours based on person's capacity"""
        return (self.person.weekly_capacity * self.allocation_percentage) / 100
    
    @property
    def project_display(self):
        """Handle both string and FK projects gracefully"""
        if self.project:
            return self.project.name
        return self.project_name or "Unknown Project"

# Future models (create tables Day 1, implement later)
class Skill(models.Model):
    """Skills - for future enhancement"""
    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)

class Deliverable(models.Model):
    """Project deliverables - for future enhancement"""
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='deliverables')
    percentage = models.IntegerField(blank=True, null=True)
    description = models.CharField(max_length=200, blank=True)
    date = models.DateField(blank=True, null=True)
    notes = models.TextField(blank=True)
    sort_order = models.IntegerField(default=0)
    is_completed = models.BooleanField(default=False)
    completed_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

## 🚀 Implementation Chunks

### **Chunk 1: Foundation + Dark Mode Design System + Naming Prevention (Day 1 - 8 hours)**
**Goal**: Docker environment + Complete dark mode design system + Database schema + Bulletproof naming system
**Reference**: `R2-REBUILD-000-DOCKER-FIRST.md` + `R2-REBUILD-NAMING-PREVENTION.md`

**What to build:**
1. Complete Docker setup with PostgreSQL
2. All database models created (but only use minimal fields)
3. Django admin working
4. **Dark Mode Design System** - Complete token system and base components
5. React app with dark mode navigation shell
6. Health check endpoint
7. **🔒 CRITICAL: Naming Prevention System** - Bulletproof field mapping system

**VSCode Dark Mode Design System:**
```typescript
// frontend/src/theme/tokens.ts
export const darkTheme = {
  colors: {
    // VSCode-style background hierarchy
    background: {
      primary: '#1e1e1e',    // VSCode editor background - Main app background
      secondary: '#2d2d30',  // VSCode sidebar background - Card/panel background  
      tertiary: '#3e3e42',   // VSCode border color - Elevated elements/borders
      elevated: '#4e4e52',   // VSCode hover state - Interactive hover states
    },
    
    // VSCode text color hierarchy
    text: {
      primary: '#cccccc',    // VSCode primary text - Main content text
      secondary: '#969696',  // VSCode secondary text - Labels, descriptions
      muted: '#757575',      // VSCode muted text - Placeholders, less important
      accent: '#007acc',     // VSCode blue - Links, focused elements
    },
    
    // Brand colors optimized for VSCode dark mode
    brand: {
      primary: '#007acc',    // VSCode blue - Primary actions, focus states
      secondary: '#0e639c',  // Darker VSCode blue - Secondary actions
      accent: '#1e90ff',     // Brighter blue - Hover states for primary
    },
    
    // Semantic colors for dark mode
    semantic: {
      success: '#10b981',    // emerald-500 - Success states
      warning: '#f59e0b',    // amber-500 - Warning states  
      error: '#ef4444',      // red-500 - Error states
      info: '#06b6d4',       // cyan-500 - Info states
    },
    
    // Utilization-specific colors (keep semantic colors)
    utilization: {
      available: '#10b981',   // emerald-500 - Under 70%
      optimal: '#3b82f6',     // blue-500 - 70-85%
      high: '#f59e0b',        // amber-500 - 85-100%
      overallocated: '#ef4444' // red-500 - Over 100%
    },
    
    // VSCode-style border colors
    border: {
      primary: '#3e3e42',     // VSCode border - Default borders, form inputs
      secondary: '#2d2d30',   // VSCode panel background - Subtle dividers
      focus: '#007acc',       // VSCode blue - Focus rings
    }
  },
  
  spacing: {
    xs: '0.5rem',    // 8px
    sm: '1rem',      // 16px  
    md: '1.5rem',    // 24px
    lg: '2rem',      // 32px
    xl: '3rem',      // 48px
    xxl: '4rem',     // 64px
  },
  
  borderRadius: {
    sm: '0.25rem',   // 4px
    md: '0.5rem',    // 8px
    lg: '0.75rem',   // 12px
    xl: '1rem',      // 16px
  },
  
  typography: {
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'Consolas', 'monospace'],
    },
    fontSize: {
      xs: '0.75rem',   // 12px
      sm: '0.875rem',  // 14px
      base: '1rem',    // 16px
      lg: '1.125rem',  // 18px
      xl: '1.25rem',   // 20px
      '2xl': '1.5rem', // 24px
      '3xl': '1.875rem' // 30px
    }
  }
}
```

**Base Components (Create in Chunk 1):**
```typescript
// frontend/src/components/ui/Button.tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  size: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  // ... other props
}

// VSCode dark mode button styles
const buttonVariants = {
  primary: 'bg-[#007acc] hover:bg-[#1e90ff] text-white',
  secondary: 'bg-[#3e3e42] hover:bg-[#4e4e52] text-[#cccccc]', 
  danger: 'bg-red-500 hover:bg-red-400 text-white',
  ghost: 'bg-transparent hover:bg-[#3e3e42] text-[#969696] border border-[#3e3e42]'
}

// frontend/src/components/ui/Input.tsx
// VSCode dark mode input with proper contrast
const inputStyles = `
  bg-[#3e3e42] border-[#3e3e42] text-[#cccccc] 
  placeholder-[#969696] focus:border-[#007acc] 
  focus:ring-[#007acc]/20
`

// frontend/src/components/ui/Card.tsx  
// VSCode dark mode card with proper elevation
const cardStyles = `
  bg-[#2d2d30] border border-[#3e3e42] 
  shadow-lg shadow-black/10
`

// frontend/src/components/layout/Navigation.tsx
// VSCode dark mode navigation shell
const navStyles = `
  bg-[#2d2d30] border-b border-[#3e3e42]
  text-[#cccccc]
`
```

**Tailwind Configuration:**
```javascript
// frontend/tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        // Custom color palette for workload tracker
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          900: '#1e3a8a',
        },
        // Extend default grays with slate for better dark mode
        slate: {
          // Full slate color scale
        }
      },
      fontFamily: {
        sans: ['Inter', ...require('tailwindcss/defaultTheme').fontFamily.sans],
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
```

**🔒 Naming Prevention System (CRITICAL):**
```python
# backend/core/fields.py - MASTER FIELD REGISTRY
PERSON_FIELDS = {
    'name': FieldDefinition(
        python_name='name',
        api_name='name', 
        sql_name='name',
        display_name='Name',
        field_type='string'
    ),
    'weekly_capacity': FieldDefinition(
        python_name='weekly_capacity',
        api_name='weeklyCapacity',
        sql_name='weekly_capacity', 
        display_name='Weekly Capacity',
        field_type='integer'
    ),
    'role': FieldDefinition(
        python_name='role',
        api_name='role',
        sql_name='role',
        display_name='Role', 
        field_type='string'
    ),
    # All other fields...
}

ASSIGNMENT_FIELDS = {
    'allocation_percentage': FieldDefinition(
        python_name='allocation_percentage',
        api_name='allocationPercentage',
        sql_name='allocation_percentage',
        display_name='Allocation %',
        field_type='integer'
    ),
    'project_name': FieldDefinition(
        python_name='project_name',
        api_name='projectName', 
        sql_name='project_name',
        display_name='Project Name',
        field_type='string'
    ),
    # All other fields...
}

# Auto-generated serializers (ZERO manual field mapping)
class PersonSerializer(AutoMappedSerializer):
    class Meta:
        model = Person
        field_registry = PERSON_FIELDS
        fields = '__auto__'  # Generated from registry

# Auto-generated TypeScript (python manage.py generate_types)
interface Person {
  id: number;
  name: string;
  weeklyCapacity: number;  // AUTO-GENERATED from field registry
  role: string;
  // All other fields automatically generated...
}
```

**Naming Validation System:**
```bash
# Makefile commands (run before every commit)
make validate-naming    # Check all field mappings are consistent
make generate-types     # Auto-generate TypeScript interfaces  
make test-naming        # Run comprehensive naming tests

# Pre-commit hook automatically:
1. Validates all field mappings
2. Generates fresh TypeScript interfaces
3. Runs naming consistency tests
4. Blocks commit if any naming issues found
```

**Acceptance Criteria:**
```bash
✅ make setup works
✅ http://localhost:3000 shows dark mode React app
✅ http://localhost:8000/admin accessible (admin/admin123)
✅ http://localhost:8000/api/health/ returns 200
✅ All database tables exist (even if empty)
✅ Complete dark mode design system documented
✅ Base UI components (Button, Input, Card, Layout) created
✅ Navigation shell implemented with dark mode styling
✅ All components use design system tokens (no hardcoded colors)
✅ Typography and spacing consistent across components
✅ **🔒 Field registry system implemented with all model fields**
✅ **🔒 AutoMappedSerializer base class working**
✅ **🔒 TypeScript generation command working (generate_types)**
✅ **🔒 Naming validation system passing all tests**
✅ **🔒 Pre-commit hooks configured and working**
✅ **🔒 ZERO manual field mappings anywhere in codebase**
```

**UI Consistency Requirements:**
```bash
✅ All colors use theme tokens (no hardcoded hex values)
✅ All spacing uses theme.spacing values
✅ Dark mode optimized contrast ratios (WCAG AA compliance)
✅ Interactive elements have consistent hover/focus states
✅ Component library documented for future chunks
```

**Exit Criteria:**
❌ Docker containers won't start
❌ Database connection fails
❌ Admin panel doesn't load
❌ Design system tokens not properly implemented
❌ Components use hardcoded styles instead of tokens
❌ **🔒 Field registry system not working**
❌ **🔒 Manual field mappings exist anywhere**
❌ **🔒 Naming validation tests failing**
❌ **🔒 TypeScript generation command failing**

---

### **Chunk 2: People Management with Dark Mode Forms (Day 2 - 6 hours)**
**Goal**: Person CRUD using established dark mode design system
**Reference**: `R2-REBUILD-STANDARDS.md` + `R2-REBUILD-MINIMAL-FIELDS.md`

**Database Usage:**
- Person: `name`, `weekly_capacity` (ignore all other fields)
- Serializer transforms: `snake_case` ↔ `camelCase`

**What to build:**
1. **Person CRUD using existing dark mode components**
2. Navigation integration (add People link to existing nav)
3. Person list page using existing Card components
4. Person form using existing Input/Button components
5. Form validation and error handling with dark mode styling
6. Establish form patterns for all future chunks

**VSCode Dark Mode Form Components:**
```typescript
// Use existing components from Chunk 1
<Card className="bg-[#2d2d30] border-[#3e3e42]">
  <Form onSubmit={handleCreatePerson}>
    <Input 
      label="Name" 
      name="name" 
      required 
      className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
    />
    <Input 
      label="Weekly Capacity" 
      name="weeklyCapacity" 
      type="number" 
      defaultValue={36}
      className="bg-[#3e3e42] border-[#3e3e42] text-[#cccccc]"
    />
    <Button variant="primary" type="submit">
      Create Person
    </Button>
  </Form>
</Card>

// VSCode dark mode table styling
<div className="bg-[#2d2d30] border border-[#3e3e42] rounded-lg">
  <table className="w-full">
    <thead className="bg-[#3e3e42] border-b border-[#3e3e42]">
      <tr>
        <th className="text-[#cccccc] font-medium">Name</th>
        <th className="text-[#cccccc] font-medium">Capacity</th>
        <th className="text-[#cccccc] font-medium">Actions</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-[#3e3e42]">
      {people.map(person => (
        <tr key={person.id} className="hover:bg-[#3e3e42]/50">
          <td className="text-[#cccccc]">{person.name}</td>
          <td className="text-[#969696]">{person.weeklyCapacity}h</td>
          <td>
            <Button variant="ghost" size="sm">Edit</Button>
            <Button variant="danger" size="sm">Delete</Button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

**API Endpoints:**
```
GET  /api/people/           # List people
POST /api/people/           # Create person  
GET  /api/people/{id}/      # Get person
PUT  /api/people/{id}/      # Update person
DELETE /api/people/{id}/    # Delete person
```

**Frontend Components (Evolve existing, don't create new):**
```typescript
// Extend existing components from Chunk 1
- Layout (add People nav link)
- Card (use for person list items)  
- Button (use for all actions)
- Input (use in person form)
- NEW: PeopleListPage (using existing components)
- NEW: PersonForm (using existing components)
```

**Dark Mode Color Usage:**
```typescript
// Follow established utilization color scheme
const getCapacityColor = (capacity: number) => {
  if (capacity < 30) return 'text-amber-400' // Lower capacity warning
  if (capacity <= 40) return 'text-emerald-400' // Normal capacity  
  return 'text-blue-400' // High capacity
}

// Use semantic colors for actions
- Save: theme.colors.semantic.success (emerald-500)
- Cancel: theme.colors.text.secondary (slate-300)
- Delete: theme.colors.semantic.error (red-500)
```

**Acceptance Criteria:**
```
✅ Can create "John Doe" (name only, capacity defaults to 36)
✅ Can edit John's capacity to 40 hours
✅ Can delete John
✅ All forms use established dark mode styling
✅ Colors match design system (no hardcoded values)
✅ Form validation errors use semantic.error color
✅ Success states use semantic.success color
✅ Data persists after page refresh
✅ Navigation integration matches existing style
```

**UI Consistency Requirements:**
```bash
✅ All components use theme tokens from Chunk 1
✅ Form patterns established for future chunks
✅ Table styling consistent for future use
✅ Interactive states match existing components
✅ Error/success messaging uses semantic colors
✅ Loading states use existing spinner component
```

**Demo Script (with UI verification):**
1. Navigate to /people (verify nav link matches design system)
2. Click "Add Person" (verify button matches Chunk 1 styling)
3. Enter "Sarah Johnson", save (verify form styling is dark mode)
4. See Sarah in list with "36h capacity" (verify table styling)
5. Edit Sarah, change to 32h (verify edit form consistency)
6. See updated capacity in yellow (verify color coding)
7. Delete Sarah (verify confirmation dialog styling)
8. Verify all interactions feel consistent with Chunk 1

---

### **Chunk 3: Assignment Basics (Day 3 - 4 hours)**
**Goal**: Assign people to projects (string-based)
**Reference**: `R2-REBUILD-ASSIGNMENTS.md`

**Database Usage:**
- Assignment: `person`, `project_name`, `allocation_percentage` (ignore FK, dates, role)
- Person: Add utilization calculation method

**What to build:**
1. Assignment model populated with string projects
2. Assignment create form (person dropdown, project text input, percentage slider)
3. Person detail page showing assignments
4. Basic utilization calculation and display
5. Assignment edit/delete functionality

**API Endpoints:**
```
GET  /api/assignments/              # List assignments
POST /api/assignments/              # Create assignment
PUT  /api/assignments/{id}/         # Update assignment  
DELETE /api/assignments/{id}/       # Delete assignment
GET  /api/people/{id}/utilization/  # Person utilization
```

**Dark Mode Utilization Display:**
```typescript
// Use established utilization colors from design system
const UtilizationBadge: React.FC<{percentage: number}> = ({percentage}) => {
  const getUtilizationStyle = (percent: number) => {
    if (percent < 70) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (percent <= 85) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'  
    if (percent <= 100) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    return 'bg-red-500/20 text-red-400 border-red-500/30'
  }
  
  return (
    <span className={`px-2 py-1 rounded border text-xs font-medium ${getUtilizationStyle(percentage)}`}>
      {percentage}% utilized
    </span>
  )
}

// Assignment form using existing dark mode components
<Card className="bg-slate-800 border-slate-700">
  <Form onSubmit={handleCreateAssignment}>
    <Select 
      label="Person" 
      name="person"
      className="bg-slate-700 border-slate-600 text-slate-50"
      options={people.map(p => ({
        value: p.id,
        label: `${p.name} (${p.weeklyCapacity - p.currentAllocation}h available)`
      }))}
    />
    <Input 
      label="Project Name" 
      name="projectName"
      className="bg-slate-700 border-slate-600 text-slate-50"
    />
    <RangeSlider
      label="Allocation Percentage"
      name="allocationPercentage"
      min={10} max={100} step={5}
      className="accent-blue-500"
    />
  </Form>
</Card>
```

**Acceptance Criteria:**
```
✅ Can assign John (40h capacity) 50% to "Website Project" 
✅ Can assign John 25% to "Mobile App"
✅ Person detail shows "30h allocated / 40h capacity (75%)" with color coding
✅ Can edit/delete assignments using existing button styles
✅ Form prevents negative percentages with proper error styling
✅ Calculations are mathematically correct
✅ All forms use established dark mode design system
✅ Utilization badges use semantic color scheme
✅ Assignment tables match people table styling
```

**Demo Script:**
1. Go to John's detail page
2. Click "Add Assignment"
3. Select "Website Project", 50%
4. See assignment in list: "Website Project - 20h/week (50%)"
5. Add another: "Mobile App", 25% 
6. See total: "30h allocated / 40h capacity (75% utilized)"

---

### **Chunk 4: Dark Mode Team Dashboard (Day 4 - 4 hours)**
**Goal**: Manager overview of team utilization using established design system
**Reference**: `R2-REBUILD-002-BUSINESS-LOGIC.md`

**Database Usage:**
- Person: Use `email`, `role` fields (still optional)
- Assignment: Show all active assignments

**What to build:**
1. Dashboard route and page using existing Card layouts
2. Team utilization summary with dark mode styling
3. Color-coded utilization levels using established color scheme
4. Available people finder using existing components
5. Quick assignment creation using existing form patterns

**VSCode Dark Mode Dashboard Layout:**
```typescript
// Dashboard using existing Card components in grid layout
<Layout>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    
    {/* Summary Stats Cards */}
    <Card className="bg-[#2d2d30] border-[#3e3e42]">
      <div className="text-[#969696] text-sm">Total Team Members</div>
      <div className="text-2xl font-bold text-[#cccccc]">{totalPeople}</div>
    </Card>
    
    <Card className="bg-[#2d2d30] border-[#3e3e42]">
      <div className="text-[#969696] text-sm">Average Utilization</div>
      <div className="text-2xl font-bold text-blue-400">{avgUtilization}%</div>
    </Card>
    
    <Card className="bg-[#2d2d30] border-[#3e3e42]">
      <div className="text-[#969696] text-sm">Overallocated</div>
      <div className="text-2xl font-bold text-red-400">{overallocatedCount}</div>
    </Card>
    
    {/* Team List */}
    <Card className="md:col-span-2 bg-[#2d2d30] border-[#3e3e42]">
      <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Team Overview</h3>
      <div className="space-y-3">
        {people.map(person => (
          <div key={person.id} className="flex items-center justify-between p-3 bg-[#3e3e42]/50 rounded-lg">
            <div>
              <div className="font-medium text-[#cccccc]">{person.name}</div>
              <div className="text-sm text-[#969696]">{person.role}</div>
            </div>
            <UtilizationBadge percentage={person.utilization} />
          </div>
        ))}
      </div>
    </Card>
    
    {/* Available People */}
    <Card className="bg-[#2d2d30] border-[#3e3e42]">
      <h3 className="text-lg font-semibold text-[#cccccc] mb-4">Available</h3>
      <div className="space-y-2">
        {availablePeople.map(person => (
          <div key={person.id} className="text-sm">
            <div className="text-[#cccccc]">{person.name}</div>
            <div className="text-emerald-400">{person.availableHours}h available</div>
          </div>
        ))}
      </div>
    </Card>
    
  </div>
</Layout>
```

**VSCode Dark Mode Color Usage:**
```typescript
// Utilization color scheme (consistent with Chunk 3)
const utilizationColors = {
  available: 'text-emerald-400 bg-emerald-500/20',    // <70%
  optimal: 'text-blue-400 bg-blue-500/20',           // 70-85%  
  high: 'text-amber-400 bg-amber-500/20',            // 85-100%
  overallocated: 'text-red-400 bg-red-500/20'        // >100%
}

// Stats use VSCode brand colors
- Total counts: text-[#cccccc] (VSCode primary text)
- Percentages: text-blue-400 (semantic optimal) 
- Warnings: text-red-400 (semantic error)
- Success: text-emerald-400 (semantic success)
```

**Components (Evolve existing):**
```typescript
// Reuse existing components, no new ones needed
- Layout (existing navigation shell)
- Card (grid layout for dashboard sections)
- UtilizationBadge (from Chunk 3)
- Button (for actions)
- NEW: Dashboard page (composing existing components)
```

**Acceptance Criteria:**
```
✅ Dashboard loads quickly (<2 seconds)
✅ Shows all people with utilization percentages using color scheme
✅ Color coding matches Chunk 3 utilization badges
✅ "Available People" section shows people under 100% with green text
✅ Can click person to see their detail page
✅ Shows team-wide statistics in summary cards
✅ All cards use consistent dark mode styling (slate-800 backgrounds)
✅ Grid layout is responsive on mobile
✅ Stats cards use appropriate semantic colors
✅ No hardcoded colors - all use design system tokens
```

**Demo Script:**
1. Go to /dashboard
2. See team list: John (75% - yellow), Sarah (45% - green), Mike (110% - red)
3. Check "Available People" section shows Sarah (55% available)
4. Click John's name, goes to his detail page
5. See summary: "Team: 3 people, 77% average utilization, 1 overallocated"

---

### **Chunk 5: Project Management (Day 5 - 4 hours)**
**Goal**: Convert to structured projects
**Reference**: `R2-REBUILD-002-BUSINESS-LOGIC.md`

**Database Usage:**
- Project: Use `name`, `status`, `client` fields
- Assignment: Migrate from `project_name` to `project` FK
- Keep `project_name` as backup during migration

**What to build:**
1. Project CRUD interface
2. Data migration script (project_name → Project objects)
3. Project detail page with team assignments
4. Assignment forms now use Project dropdown
5. Project team summary and utilization

**Migration Script:**
```python
def migrate_string_projects():
    """Convert project_name strings to Project objects"""
    for assignment in Assignment.objects.filter(project__isnull=True):
        if assignment.project_name:
            project, created = Project.objects.get_or_create(name=assignment.project_name)
            assignment.project = project
            assignment.save()
```

**Acceptance Criteria:**
```
✅ Existing assignments still work after migration
✅ Can create new project "Mobile Redesign"
✅ Project detail shows team: "John (50%), Sarah (25%)"
✅ Can reassign John from Website to Mobile project
✅ Project list shows active projects with team info
✅ No data loss during migration
```

**Demo Script:**
1. Run migration script
2. Go to /projects
3. See projects: "Website Project (2 people, 75% avg util)", "Mobile App (1 person)"
4. Click "Website Project" 
5. See team assignments with utilization
6. Create new project "Dashboard Redesign"
7. Assign Sarah 30% to new project

---

### **Chunk 6: Smart Features (Day 6 - 6 hours)**
**Goal**: Intelligent assignment assistance
**Reference**: `R2-REBUILD-004-MANAGER-FEATURES.md`

**Database Usage:**
- Person: Use `department` field
- Assignment: Use validation logic
- Add `role_on_project` usage

**What to build:**
1. Overallocation warnings (soft validation)
2. Available people finder with capacity details
3. Smart assignment suggestions
4. Department-based filtering
5. Assignment conflict detection

**Smart Features:**
```
- "Sarah has 15h available this week"
- "Warning: This assignment would put John at 110% capacity"
- "Suggested: Move 10h from Website to Mobile App project"
- "Available in Engineering: 3 people with 45h total capacity"
```

**Acceptance Criteria:**
```
✅ System warns when assigning >100% (but allows override)
✅ "Find available people" shows capacity details
✅ Assignment suggestions consider current workload
✅ Can filter people by department
✅ Department utilization summary works
✅ Warnings are helpful, not annoying
```

**Demo Script:**
1. Try to assign John 50% more (would be 125% total)
2. See warning: "This would overallocate John (125%). Continue anyway?"
3. Use "Find Available People" 
4. See "Sarah (Engineering): 15h available, Mike (Design): 8h available"
5. Get suggestion: "For 20h project, consider Sarah (can handle 15h) + Mike (5h)"

---

### **Chunk 7: Polish & Deploy (Day 7 - 4 hours)**
**Goal**: Production-ready application
**Reference**: `R2-REBUILD-003-PRODUCTION.md`

**What to build:**
1. Comprehensive error handling
2. Loading states and user feedback
3. Production Docker configuration
4. Health checks and monitoring
5. Basic data backup/restore

**Production Features:**
```
- Graceful error messages
- Loading spinners during operations
- Health check endpoint
- Docker production build
- Environment variable validation
```

**Acceptance Criteria:**
```
✅ App handles network errors gracefully
✅ Users see loading states during operations
✅ Production Docker build works
✅ Health check reports system status
✅ Can export/import data for backups
✅ Error boundaries catch React crashes
```

**Demo Script:**
1. Disconnect network, try to save assignment
2. See friendly error: "Unable to save. Check connection and try again."
3. Reconnect, retry succeeds
4. Test production build: `docker-compose -f docker-compose.prod.yml up`
5. Verify health check: `curl http://localhost/api/health/`

## 🔄 Development Workflow

### **Daily Commands:**
```bash
# Start development
make up

# View logs
make logs

# Run migrations (when adding fields to use)
make migrate

# Access database
make shell-db

# Run tests
make test

# Deploy to staging
make deploy-staging
```

### **Feature Flag Strategy:**
```python
# settings.py
FEATURES = {
    'USE_DEPARTMENTS': False,      # Flip in Chunk 6
    'USE_PROJECT_OBJECTS': False,  # Flip in Chunk 5
    'USE_DELIVERABLES': False,     # Future feature
    'USE_SKILLS': False,           # Future feature
}

# Usage in code
if settings.FEATURES['USE_DEPARTMENTS']:
    # Show department fields in forms
else:
    # Hide department fields
```

## 📋 Success Metrics

### **Technical Metrics:**
- Database migrations: 1 (initial schema only)
- Test coverage: >80% for business logic
- Page load time: <2 seconds
- API response time: <500ms

### **User Metrics:**
- Time to create person: <30 seconds
- Time to create assignment: <45 seconds
- Time to understand team utilization: <10 seconds
- User errors: <5% of operations

## 🚨 Risk Mitigation

### **Database Risks:**
✅ Complete schema from Day 1 - no painful migrations
✅ Dual-field migration approach (project_name + project FK)
✅ All fields nullable/optional until needed
✅ JSON metadata fields for future expansion

### **Development Risks:**
✅ Working software at each chunk
✅ Clear exit criteria for each chunk
✅ Feature flags for safe rollback
✅ Comprehensive error handling

### **User Adoption Risks:**
✅ Minimal required fields (name only)
✅ Smart defaults for everything else
✅ Progressive complexity (start simple)
✅ Immediate value (utilization tracking)

## 📚 Reference Documents

1. **R2-REBUILD-STANDARDS.md** - Naming conventions & code quality
2. **R2-REBUILD-DARK-MODE-STANDARDS.md** - UI consistency & dark mode requirements ⭐ **CRITICAL**
3. **R2-REBUILD-NAMING-PREVENTION.md** - Bulletproof naming system to prevent mismatches 🔒 **CRITICAL** 
4. **R2-REBUILD-MINIMAL-FIELDS.md** - Required vs optional fields
5. **R2-REBUILD-ASSIGNMENTS.md** - Assignment system design
6. **R2-REBUILD-ROLE-CLARITY.md** - Organizational vs project roles
7. **R2-REBUILD-CONTRACTS.md** - API specifications
8. **R2-REBUILD-000-DOCKER-FIRST.md** - Docker setup guide

## 🎨 VSCode Dark Mode UI Confirmation

✅ **CONFIRMED: This application uses VSCode DARK MODE as the primary and only theme**

**Visual Design:**
- **Background**: VSCode Editor Dark (`#1e1e1e` app, `#2d2d30` cards, `#3e3e42` borders)
- **Text**: VSCode Text Hierarchy (`#cccccc` primary, `#969696` secondary, `#757575` muted) 
- **Primary Actions**: VSCode Blue (`#007acc` primary, `#1e90ff` hover)
- **Semantic Colors**: Emerald (success), Amber (warning), Red (error)
- **Utilization Colors**: Emerald (available), Blue (optimal), Amber (high), Red (overallocated)

**Typography**: Inter font family for modern, clean appearance (matches VSCode)
**Component Style**: VSCode-inspired, minimal, professional appearance for developer tools
**Icons**: Minimalistic SVG icons matching VSCode design language

## 🎯 Next Steps

1. **Start with Chunk 1**: Get Docker environment working
2. **Review each chunk before starting**: Understand acceptance criteria
3. **Don't skip chunks**: Each builds on the previous
4. **Test thoroughly**: Run demo script for each chunk
5. **Get user feedback early**: Show working software after Chunk 4

**Remember**: Complete database schema Day 1, progressive feature usage, no painful migrations later!