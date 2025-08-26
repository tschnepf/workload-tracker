# R2-REBUILD-001: FOUNDATION - Days 1-2

## Objective
Create a working CRUD application with authentication in 2 days. No fancy patterns, just Django and React doing what they do best.

## Day 1: Backend Foundation

### Step 1: Project Setup (30 minutes)
```bash
# Create project structure
mkdir workload-tracker && cd workload-tracker

# Backend setup
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install django djangorestframework django-cors-headers djangorestframework-simplejwt psycopg2-binary python-decouple

# Create Django project
django-admin startproject config .
python manage.py startapp people
python manage.py startapp projects
python manage.py startapp assignments

# Create requirements.txt
pip freeze > requirements.txt
```

### Step 2: Database Configuration (30 minutes)
```python
# config/settings.py
from decouple import config
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY', default='dev-secret-key-change-in-production')
DEBUG = config('DEBUG', default=True, cast=bool)
ALLOWED_HOSTS = ['localhost', '127.0.0.1']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'people',
    'projects',
    'assignments',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='workload_tracker'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default='postgres'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

# CORS settings - allow frontend
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",  # Vite default port
    "http://localhost:3000",
]

# REST Framework settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}
```

### Step 3: Simple Models (1 hour)
```python
# people/models.py
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator

class Person(models.Model):
    """Simple person model - no over-engineering"""
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    department = models.CharField(max_length=50)
    role = models.CharField(max_length=50)
    weekly_capacity = models.IntegerField(
        default=40,
        validators=[MinValueValidator(1), MaxValueValidator(80)]
    )
    hire_date = models.DateField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name

# projects/models.py
from django.db import models

class Project(models.Model):
    STATUS_CHOICES = [
        ('planning', 'Planning'),
        ('active', 'Active'),
        ('on_hold', 'On Hold'),
        ('completed', 'Completed'),
    ]
    
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    client = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planning')
    start_date = models.DateField()
    end_date = models.DateField()
    estimated_hours = models.IntegerField(validators=[MinValueValidator(1)])
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-start_date', 'name']
    
    def __str__(self):
        return self.name

# assignments/models.py
from django.db import models
from django.core.exceptions import ValidationError

class Assignment(models.Model):
    """Link people to projects with hours"""
    person = models.ForeignKey('people.Person', on_delete=models.CASCADE, related_name='assignments')
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='assignments')
    weekly_hours = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(40)])
    start_date = models.DateField()
    end_date = models.DateField()
    role = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-start_date']
    
    def clean(self):
        # Simple validation - no complex business rules yet
        if self.end_date < self.start_date:
            raise ValidationError("End date must be after start date")
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.person.name} on {self.project.name}"
```

### Step 4: Serializers & ViewSets (1 hour)
```python
# people/serializers.py
from rest_framework import serializers
from .models import Person

class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

# people/views.py
from rest_framework import viewsets, filters
from .models import Person
from .serializers import PersonSerializer

class PersonViewSet(viewsets.ModelViewSet):
    """Simple CRUD for people - no complex logic yet"""
    queryset = Person.objects.filter(is_active=True)
    serializer_class = PersonSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'email', 'department', 'role']
    ordering_fields = ['name', 'department', 'hire_date']

# projects/serializers.py
from rest_framework import serializers
from .models import Project

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

# projects/views.py
from rest_framework import viewsets, filters
from .models import Project
from .serializers import ProjectSerializer

class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.filter(is_active=True)
    serializer_class = ProjectSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'client', 'description']
    ordering_fields = ['start_date', 'name', 'status']
    filterset_fields = ['status', 'client']

# assignments/serializers.py
from rest_framework import serializers
from .models import Assignment
from people.serializers import PersonSerializer
from projects.serializers import ProjectSerializer

class AssignmentSerializer(serializers.ModelSerializer):
    person_detail = PersonSerializer(source='person', read_only=True)
    project_detail = ProjectSerializer(source='project', read_only=True)
    
    class Meta:
        model = Assignment
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

# assignments/views.py
from rest_framework import viewsets
from .models import Assignment
from .serializers import AssignmentSerializer

class AssignmentViewSet(viewsets.ModelViewSet):
    queryset = Assignment.objects.filter(is_active=True)
    serializer_class = AssignmentSerializer
    filterset_fields = ['person', 'project', 'start_date', 'end_date']
```

### Step 5: URL Configuration (30 minutes)
```python
# config/urls.py
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from people.views import PersonViewSet
from projects.views import ProjectViewSet
from assignments.views import AssignmentViewSet

router = DefaultRouter()
router.register(r'people', PersonViewSet)
router.register(r'projects', ProjectViewSet)
router.register(r'assignments', AssignmentViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
```

### Step 6: Migrations & Admin (30 minutes)
```bash
# Create and run migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Register models in admin (optional but helpful)
```

```python
# people/admin.py
from django.contrib import admin
from .models import Person

@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'department', 'role', 'weekly_capacity', 'is_active']
    list_filter = ['department', 'role', 'is_active']
    search_fields = ['name', 'email']

# Similar for projects and assignments...
```

## Day 2: Frontend Foundation

### Step 1: React Setup (30 minutes)
```bash
# Frontend setup (in project root)
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# Essential packages only
npm install axios react-router-dom @tanstack/react-query
npm install -D @types/react @types/react-dom

# Tailwind CSS for quick styling
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Step 2: Basic Project Structure (30 minutes)
```typescript
// frontend/src/types/index.ts
export interface Person {
  id?: number;
  name: string;
  email: string;
  department: string;
  role: string;
  weeklyCapacity: number;
  hireDate: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id?: number;
  name: string;
  description: string;
  client: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed';
  startDate: string;
  endDate: string;
  estimatedHours: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Assignment {
  id?: number;
  person: number;
  project: number;
  weeklyHours: number;
  startDate: string;
  endDate: string;
  role: string;
  isActive: boolean;
  personDetail?: Person;
  projectDetail?: Project;
}
```

### Step 3: API Service (1 hour)
```typescript
// frontend/src/services/api.ts
import axios from 'axios';

const API_BASE = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Simple API methods
export const peopleAPI = {
  getAll: () => api.get('/people/').then(res => res.data),
  getById: (id: number) => api.get(`/people/${id}/`).then(res => res.data),
  create: (data: any) => api.post('/people/', data).then(res => res.data),
  update: (id: number, data: any) => api.put(`/people/${id}/`, data).then(res => res.data),
  delete: (id: number) => api.delete(`/people/${id}/`),
};

export const projectsAPI = {
  getAll: () => api.get('/projects/').then(res => res.data),
  getById: (id: number) => api.get(`/projects/${id}/`).then(res => res.data),
  create: (data: any) => api.post('/projects/', data).then(res => res.data),
  update: (id: number, data: any) => api.put(`/projects/${id}/`, data).then(res => res.data),
  delete: (id: number) => api.delete(`/projects/${id}/`),
};

export const assignmentsAPI = {
  getAll: () => api.get('/assignments/').then(res => res.data),
  create: (data: any) => api.post('/assignments/', data).then(res => res.data),
  update: (id: number, data: any) => api.put(`/assignments/${id}/`, data).then(res => res.data),
  delete: (id: number) => api.delete(`/assignments/${id}/`),
};

export const authAPI = {
  login: (email: string, password: string) => 
    api.post('/auth/token/', { email, password }).then(res => {
      localStorage.setItem('access_token', res.data.access);
      localStorage.setItem('refresh_token', res.data.refresh);
      return res.data;
    }),
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
};
```

### Step 4: Basic Components (2 hours)
```typescript
// frontend/src/pages/PeoplePage.tsx
import { useState, useEffect } from 'react';
import { peopleAPI } from '../services/api';
import { Person } from '../types';

export function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    try {
      const data = await peopleAPI.getAll();
      setPeople(data.results || data);
    } catch (error) {
      console.error('Failed to load people:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">People</h1>
      
      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">Name</th>
            <th className="border p-2 text-left">Email</th>
            <th className="border p-2 text-left">Department</th>
            <th className="border p-2 text-left">Role</th>
            <th className="border p-2 text-left">Capacity</th>
          </tr>
        </thead>
        <tbody>
          {people.map(person => (
            <tr key={person.id}>
              <td className="border p-2">{person.name}</td>
              <td className="border p-2">{person.email}</td>
              <td className="border p-2">{person.department}</td>
              <td className="border p-2">{person.role}</td>
              <td className="border p-2">{person.weeklyCapacity}h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Similar simple components for Projects and Assignments...
```

### Step 5: Routing & App Structure (1 hour)
```typescript
// frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PeoplePage } from './pages/PeoplePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { AssignmentsPage } from './pages/AssignmentsPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white shadow mb-4">
            <div className="container mx-auto px-4">
              <div className="flex space-x-8 py-4">
                <Link to="/people" className="hover:text-blue-500">People</Link>
                <Link to="/projects" className="hover:text-blue-500">Projects</Link>
                <Link to="/assignments" className="hover:text-blue-500">Assignments</Link>
              </div>
            </div>
          </nav>
          
          <Routes>
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route path="/" element={<div className="container mx-auto p-4">
              <h1 className="text-2xl">Workload Tracker</h1>
              <p>Select a section from the navigation above.</p>
            </div>} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
```

## Testing Checklist - End of Day 2

### Backend Tests
```bash
# Test API endpoints
curl http://localhost:8000/api/people/
curl http://localhost:8000/api/projects/
curl http://localhost:8000/api/assignments/

# Test creating a person
curl -X POST http://localhost:8000/api/people/ \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","department":"Engineering","role":"Developer","weekly_capacity":40,"hire_date":"2024-01-01"}'
```

### Frontend Tests
- ✅ Can view list of people
- ✅ Can view list of projects
- ✅ Can view list of assignments
- ✅ Navigation works between pages
- ✅ Data loads from backend API

## What We Built in 2 Days
- ✅ Working Django backend with PostgreSQL
- ✅ REST API with CRUD operations
- ✅ React frontend with TypeScript
- ✅ Basic routing and navigation
- ✅ Data fetching and display
- ✅ JWT authentication setup (ready to implement login)

## What We Didn't Build (Yet)
- ❌ Complex validations (coming in Phase 2)
- ❌ Utilization calculations (coming in Phase 2)
- ❌ Forms for creating/editing (can add as needed)
- ❌ Error handling UI (can add as needed)
- ❌ Unit tests (can add for critical paths)

## Next Steps
Move to **R2-REBUILD-002-BUSINESS-LOGIC.md** to add:
- Assignment overlap detection
- Utilization calculations
- Availability checking
- Dashboard with metrics

## Key Takeaways
1. **Framework defaults work** - Django's ModelViewSet gives us CRUD for free
2. **Simple is sufficient** - Basic tables display data effectively
3. **Iterate from working** - We have a foundation to build upon
4. **No premature abstraction** - We'll add patterns when we need them

**Time Invested**: 2 days  
**Result**: Working CRUD application ready for business logic