# R2-REBUILD-MINIMAL-FIELDS: Field Requirements & Defaults

## AI Agent Instructions
**CRITICAL: Only name fields are required. Everything else has smart defaults.**

## 🎯 Core Principle: Minimal Friction
**Users should be able to create records with ONE field, then add details later.**

---

## 👤 PERSON FIELDS

### Required Fields (Only 1!)
```python
class Person(models.Model):
    # REQUIRED
    name = models.CharField(max_length=200)  # ✅ ONLY THIS IS REQUIRED
```

### Optional Fields with Smart Defaults
```python
class Person(models.Model):
    # REQUIRED
    name = models.CharField(max_length=200)
    
    # OPTIONAL - With Defaults
    weekly_capacity = models.IntegerField(default=36)  # Default: 36 hours
    role = models.CharField(max_length=100, blank=True, default='Engineer')  # Default: Engineer
    
    # OPTIONAL - No Defaults
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    department = models.ForeignKey('Department', blank=True, null=True, on_delete=models.SET_NULL)
    location = models.CharField(max_length=100, blank=True, null=True)
    skills = models.ManyToManyField('Skill', blank=True)
    notes = models.TextField(blank=True)
    
    # AUTOMATIC - System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

### API/Frontend Creation
```typescript
// Minimal creation - just a name!
const createPerson = async (name: string) => {
    return await api.post('/api/people/', { name });
};

// Full creation (all optional)
interface CreatePersonRequest {
    name: string;           // ✅ Required
    weeklyCapacity?: number;// Optional (defaults to 36)
    role?: string;          // Optional (defaults to "Engineer")
    email?: string;         // Optional
    phone?: string;         // Optional
    department?: string;    // Optional
    location?: string;      // Optional
    skills?: string[];      // Optional
    notes?: string;         // Optional
}
```

---

## 🏢 DEPARTMENT FIELDS

### Required Fields (Only 1!)
```python
class Department(models.Model):
    # REQUIRED
    name = models.CharField(max_length=100, unique=True)  # ✅ ONLY THIS IS REQUIRED
```

### Optional Fields
```python
class Department(models.Model):
    # REQUIRED
    name = models.CharField(max_length=100, unique=True)
    
    # OPTIONAL - No Defaults
    parent_department = models.ForeignKey('self', blank=True, null=True, on_delete=models.SET_NULL)
    manager = models.ForeignKey('Person', blank=True, null=True, on_delete=models.SET_NULL)
    description = models.TextField(blank=True)
    
    # AUTOMATIC - System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

### API/Frontend Creation
```typescript
// Minimal creation - just a name!
const createDepartment = async (name: string) => {
    return await api.post('/api/departments/', { name });
};

// Full creation (all optional)
interface CreateDepartmentRequest {
    name: string;               // ✅ Required
    parentDepartment?: string;  // Optional
    manager?: string;           // Optional
    description?: string;       // Optional
}
```

---

## 📋 PROJECT FIELDS

### Required Fields (Only 1!)
```python
class Project(models.Model):
    # REQUIRED
    name = models.CharField(max_length=200)  # ✅ ONLY THIS IS REQUIRED
```

### Optional Fields with Smart Defaults
```python
class Project(models.Model):
    # REQUIRED
    name = models.CharField(max_length=200)
    
    # OPTIONAL - With Defaults
    status = models.CharField(
        max_length=20,
        choices=[
            ('planning', 'Planning'),
            ('active', 'Active'),
            ('on_hold', 'On Hold'),
            ('completed', 'Completed'),
            ('cancelled', 'Cancelled'),
        ],
        default='active'  # Default: active
    )
    client = models.CharField(max_length=100, blank=True, default='Internal')  # Default: Internal
    
    # OPTIONAL - No Defaults
    project_number = models.CharField(max_length=50, blank=True, unique=True, null=True)
    tags = models.ManyToManyField('Tag', blank=True)
    
    # AUTOMATIC - System fields
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

### API/Frontend Creation
```typescript
// Minimal creation - just a name!
const createProject = async (name: string) => {
    return await api.post('/api/projects/', { name });
};

// Full creation (all optional)
interface CreateProjectRequest {
    name: string;              // ✅ Required
    status?: string;           // Optional (defaults to "active")
    client?: string;           // Optional (defaults to "Internal")
    projectNumber?: string;    // Optional
    tags?: string[];          // Optional
}
```

---

## 🔄 PROGRESSIVE ENHANCEMENT PATTERN

### Step 1: Quick Creation
```typescript
// User can create with just a name
const quickCreate = () => {
    const person = await createPerson("John Doe");
    const dept = await createDepartment("Engineering");
    const project = await createProject("Website Redesign");
};
```

### Step 2: Add Details Later
```typescript
// User can add details when they have them
const addDetails = (personId: string) => {
    await updatePerson(personId, {
        email: "john@example.com",
        department: "Engineering",
        weeklyCapacity: 32  // Override default of 36
    });
};
```

### Step 3: Bulk Import with Defaults
```python
# Backend can handle minimal CSV
def import_people_csv(csv_file):
    # CSV can have just names
    # name
    # John Doe
    # Jane Smith
    
    for row in csv_reader:
        Person.objects.create(
            name=row['name'],
            # Everything else uses defaults
            weekly_capacity=36,
            role='Engineer',
            is_active=True
        )
```

---

## 🎨 UI FORMS DESIGN

### Progressive Disclosure Form
```typescript
// Start with minimal form
const QuickAddPerson: React.FC = () => {
    const [name, setName] = useState('');
    const [showMore, setShowMore] = useState(false);
    
    return (
        <form>
            {/* Always visible - required */}
            <input
                type="text"
                placeholder="Person's name*"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
            />
            
            {/* Optional - hidden by default */}
            {!showMore && (
                <button type="button" onClick={() => setShowMore(true)}>
                    + Add more details (optional)
                </button>
            )}
            
            {showMore && (
                <>
                    <input type="email" placeholder="Email (optional)" />
                    <input type="text" placeholder="Department (optional)" />
                    <input type="number" placeholder="Weekly hours (default: 36)" />
                </>
            )}
            
            <button type="submit" disabled={!name}>
                Create Person
            </button>
        </form>
    );
};
```

---

## 📊 FIELD SUMMARY TABLE

| Model | Required Fields | Optional with Defaults | Optional No Default | System Auto |
|-------|----------------|------------------------|-------------------|------------|
| **Person** | name | weekly_capacity (36)<br>role ("Engineer") | email<br>phone<br>department<br>location<br>skills<br>notes | is_active<br>created_at<br>updated_at |
| **Department** | name | - | parent_department<br>manager<br>description | is_active<br>created_at<br>updated_at |
| **Project** | name | status ("active")<br>client ("Internal") | project_number<br>tags | is_active<br>created_at<br>updated_at |

---

## 🚫 VALIDATION RULES

### Backend Validation
```python
class Person(models.Model):
    name = models.CharField(max_length=200)  # Only this is validated as required
    
    def clean(self):
        # Minimal validation - just name
        if not self.name or len(self.name.strip()) < 1:
            raise ValidationError("Name is required")
        
        # Email validation ONLY if provided
        if self.email and '@' not in self.email:
            raise ValidationError("Invalid email format")
        
        # Don't validate optional fields if not provided
```

### Frontend Validation
```typescript
const validatePerson = (person: CreatePersonRequest): boolean => {
    // Only validate required field
    if (!person.name || person.name.trim().length < 1) {
        return false;
    }
    
    // Optional fields - validate ONLY if provided
    if (person.email && !person.email.includes('@')) {
        return false;
    }
    
    // Don't block on missing optional fields
    return true;
};
```

---

## 🎯 Key Principles

1. **Start Minimal**: Users can create with just a name
2. **Smart Defaults**: Sensible values for common fields
3. **Progressive Enhancement**: Add details when available
4. **Never Block**: Don't prevent creation due to missing optional data
5. **Validate Gently**: Only validate what's provided

---

## 🤖 AI Agent Implementation Note

When implementing models, the AI agent MUST:
1. Make only name fields required
2. Use `blank=True, null=True` for optional fields
3. Provide sensible defaults where applicable
4. Never require fields that might not be known immediately
5. Allow records to be created incomplete and enhanced later

Example serializer:
```python
class PersonSerializer(serializers.ModelSerializer):
    # Transform to camelCase as per standards
    name = serializers.CharField(required=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    weeklyCapacity = serializers.IntegerField(source='weekly_capacity', required=False, default=36)
    role = serializers.CharField(required=False, default='Engineer')
    
    class Meta:
        model = Person
        fields = '__all__'
        
    def validate_name(self, value):
        if not value or len(value.strip()) < 1:
            raise serializers.ValidationError("Name is required")
        return value.strip()
```

This approach ensures maximum usability - users can quickly add people/projects/departments and fill in details as they become available!