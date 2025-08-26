# R2-REBUILD-CONTRACTS: API Specifications

## Overview
Simple, pragmatic API contracts for the workload tracker. No over-engineering, just clear request/response formats.

## API Principles
1. **RESTful conventions** - Standard HTTP verbs and status codes
2. **Consistent naming** - camelCase for JSON, snake_case in database
3. **Predictable responses** - Same structure for all endpoints
4. **Pragmatic pagination** - Simple page-based pagination
5. **Simple authentication** - JWT tokens in Authorization header

## Base Configuration

```yaml
base_url: http://localhost:8000/api
authentication: Bearer Token (JWT)
content_type: application/json
```

## Standard Response Format

### Success Response
```json
{
  "data": {...} or [...],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Response
```json
{
  "error": "Error Type",
  "details": "Human readable error message",
  "field_errors": {
    "field_name": ["Error message"]
  }
}
```

## Authentication Endpoints

### POST /api/auth/token/
**Login and get access token**

Request:
```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

Response (200):
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

### POST /api/auth/refresh/
**Refresh access token**

Request:
```json
{
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

Response (200):
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

## People Endpoints

### GET /api/people/
**List all people with optional filtering**

Query Parameters:
- `page` (int): Page number (default: 1)
- `page_size` (int): Items per page (default: 20, max: 100)
- `search` (string): Search by name or email
- `department` (string): Filter by department
- `role` (string): Filter by role
- `is_active` (boolean): Filter by active status

Response (200):
```json
{
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john.doe@example.com",
      "department": "Engineering",
      "role": "Developer",
      "weeklyCapacity": 40,
      "hireDate": "2024-01-15",
      "isActive": true,
      "currentUtilization": {
        "weeklyHours": 32,
        "capacity": 40,
        "utilizationPercent": 80.0
      },
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### POST /api/people/
**Create a new person**

Request:
```json
{
  "name": "Jane Smith",
  "email": "jane.smith@example.com",
  "department": "Design",
  "role": "UX Designer",
  "weeklyCapacity": 40,
  "hireDate": "2024-02-01"
}
```

Response (201):
```json
{
  "data": {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane.smith@example.com",
    "department": "Design",
    "role": "UX Designer",
    "weeklyCapacity": 40,
    "hireDate": "2024-02-01",
    "isActive": true,
    "currentUtilization": {
      "weeklyHours": 0,
      "capacity": 40,
      "utilizationPercent": 0.0
    },
    "createdAt": "2024-02-01T10:00:00Z",
    "updatedAt": "2024-02-01T10:00:00Z"
  }
}
```

### GET /api/people/{id}/
**Get a specific person**

Response (200):
```json
{
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john.doe@example.com",
    "department": "Engineering",
    "role": "Developer",
    "weeklyCapacity": 40,
    "hireDate": "2024-01-15",
    "isActive": true,
    "currentUtilization": {
      "weeklyHours": 32,
      "capacity": 40,
      "utilizationPercent": 80.0
    },
    "assignments": [
      {
        "id": 1,
        "projectId": 1,
        "projectName": "Website Redesign",
        "weeklyHours": 20,
        "startDate": "2024-02-01",
        "endDate": "2024-04-30",
        "role": "Frontend Developer"
      }
    ],
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
}
```

### PUT /api/people/{id}/
**Update a person**

Request:
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "department": "Engineering",
  "role": "Senior Developer",
  "weeklyCapacity": 35
}
```

Response (200): Same as GET

### DELETE /api/people/{id}/
**Delete a person (soft delete)**

Response (204): No content

### GET /api/people/availability/
**Find available people for a period**

Query Parameters:
- `start_date` (date, required): YYYY-MM-DD
- `end_date` (date, required): YYYY-MM-DD
- `required_hours` (int): Minimum weekly hours needed

Response (200):
```json
{
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "department": "Engineering",
      "availableHours": 8,
      "currentUtilization": 80.0
    }
  ]
}
```

### GET /api/people/{id}/utilization_timeline/
**Get utilization timeline for a person**

Query Parameters:
- `weeks` (int): Number of weeks to show (default: 12)

Response (200):
```json
{
  "data": [
    {
      "weekStart": "2024-01-29",
      "weekEnd": "2024-02-04",
      "utilizationPercent": 80.0,
      "hours": 32
    }
  ]
}
```

## Projects Endpoints

### GET /api/projects/
**List all projects**

Query Parameters:
- `page` (int): Page number
- `page_size` (int): Items per page
- `search` (string): Search by name or client
- `status` (string): Filter by status (planning|active|on_hold|completed)
- `client` (string): Filter by client

Response (200):
```json
{
  "data": [
    {
      "id": 1,
      "name": "Website Redesign",
      "description": "Complete redesign of company website",
      "client": "Acme Corp",
      "status": "active",
      "startDate": "2024-02-01",
      "endDate": "2024-04-30",
      "estimatedHours": 320,
      "isActive": true,
      "resourceSummary": {
        "totalWeeklyHours": 60,
        "peopleCount": 3,
        "estimatedTotalHours": 320,
        "progressPercent": 25.5
      },
      "isAdequatelyStaffed": true,
      "createdAt": "2024-01-20T10:00:00Z",
      "updatedAt": "2024-02-15T14:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

### POST /api/projects/
**Create a new project**

Request:
```json
{
  "name": "Mobile App Development",
  "description": "Native iOS and Android apps",
  "client": "TechStart Inc",
  "status": "planning",
  "startDate": "2024-03-01",
  "endDate": "2024-06-30",
  "estimatedHours": 640
}
```

Response (201): Same structure as GET

### GET /api/projects/{id}/
**Get project details with assignments**

Response (200):
```json
{
  "data": {
    "id": 1,
    "name": "Website Redesign",
    "description": "Complete redesign of company website",
    "client": "Acme Corp",
    "status": "active",
    "startDate": "2024-02-01",
    "endDate": "2024-04-30",
    "estimatedHours": 320,
    "isActive": true,
    "resourceSummary": {
      "totalWeeklyHours": 60,
      "peopleCount": 3,
      "estimatedTotalHours": 320,
      "progressPercent": 25.5,
      "assignments": [
        {
          "personName": "John Doe",
          "role": "Frontend Developer",
          "weeklyHours": 20,
          "startDate": "2024-02-01",
          "endDate": "2024-04-30"
        }
      ]
    },
    "isAdequatelyStaffed": true,
    "createdAt": "2024-01-20T10:00:00Z",
    "updatedAt": "2024-02-15T14:30:00Z"
  }
}
```

### PUT /api/projects/{id}/
**Update a project**

Request: Same as POST
Response (200): Same as GET

### DELETE /api/projects/{id}/
**Delete a project (soft delete)**

Response (204): No content

## Assignments Endpoints

### GET /api/assignments/
**List all assignments**

Query Parameters:
- `person` (int): Filter by person ID
- `project` (int): Filter by project ID
- `start_date` (date): Filter by start date
- `end_date` (date): Filter by end date

Response (200):
```json
{
  "data": [
    {
      "id": 1,
      "person": 1,
      "project": 1,
      "weeklyHours": 20,
      "startDate": "2024-02-01",
      "endDate": "2024-04-30",
      "role": "Frontend Developer",
      "isActive": true,
      "personDetail": {
        "id": 1,
        "name": "John Doe",
        "department": "Engineering"
      },
      "projectDetail": {
        "id": 1,
        "name": "Website Redesign",
        "client": "Acme Corp"
      },
      "warnings": [
        {
          "type": "high_utilization",
          "message": "John Doe has high utilization (92%)"
        }
      ],
      "createdAt": "2024-01-25T10:00:00Z",
      "updatedAt": "2024-01-25T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### POST /api/assignments/
**Create a new assignment**

Request:
```json
{
  "person": 1,
  "project": 1,
  "weeklyHours": 20,
  "startDate": "2024-02-01",
  "endDate": "2024-04-30",
  "role": "Frontend Developer"
}
```

Response (201): Same structure as GET

Validation Errors (400):
```json
{
  "error": "Validation Error",
  "details": "Assignment would exceed John Doe's capacity. Current: 30h, Adding: 20h, Capacity: 40h"
}
```

### PUT /api/assignments/{id}/
**Update an assignment**

Request: Same as POST
Response (200): Same as GET

### DELETE /api/assignments/{id}/
**Delete an assignment**

Response (204): No content

## Dashboard Endpoint

### GET /api/dashboard/
**Get dashboard metrics**

Response (200):
```json
{
  "data": {
    "summary": {
      "totalPeople": 25,
      "totalProjects": 12,
      "activeProjects": 8,
      "totalAssignments": 45
    },
    "utilizationDistribution": {
      "underutilized": 5,
      "optimal": 15,
      "high": 4,
      "overallocated": 1
    },
    "projectStatus": [
      {"status": "planning", "count": 2},
      {"status": "active", "count": 8},
      {"status": "on_hold", "count": 1},
      {"status": "completed", "count": 1}
    ],
    "projectsAtRisk": [
      {
        "id": 3,
        "name": "Data Migration",
        "client": "BigCorp",
        "endDate": "2024-03-15"
      }
    ],
    "recentAssignments": [
      {
        "person": "Jane Smith",
        "project": "Mobile App",
        "hours": 30,
        "created": "2024-02-10T14:30:00Z"
      }
    ]
  }
}
```

## Health Check

### GET /api/health/
**System health check**

Response (200):
```json
{
  "status": "healthy",
  "timestamp": 1707123456,
  "checks": {
    "database": "ok",
    "cache": "ok"
  }
}
```

Response (503):
```json
{
  "status": "unhealthy",
  "timestamp": 1707123456,
  "checks": {
    "database": "Connection failed",
    "cache": "ok"
  }
}
```

## Error Codes

| Status Code | Meaning |
|------------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful delete) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |

## Rate Limiting

- **Authenticated users**: 1000 requests per hour
- **Unauthenticated users**: 100 requests per hour
- Rate limit headers included in responses:
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Time when limit resets

## Notes for AI Implementation

1. **Start with basic CRUD** - Get POST/GET/PUT/DELETE working first
2. **Add business logic endpoints later** - availability, utilization_timeline, etc.
3. **Use Django REST Framework defaults** - ModelViewSet handles most of this automatically
4. **Don't over-validate** - Basic validation in serializers is sufficient initially
5. **Pagination is optional** - Start without it, add when lists get long

## TypeScript Interface Generation

```typescript
// Generate from these contracts
interface Person {
  id: number;
  name: string;
  email: string;
  department: string;
  role: string;
  weeklyCapacity: number;
  hireDate: string;
  isActive: boolean;
  currentUtilization?: {
    weeklyHours: number;
    capacity: number;
    utilizationPercent: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: number;
  name: string;
  description: string;
  client: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed';
  startDate: string;
  endDate: string;
  estimatedHours: number;
  isActive: boolean;
  resourceSummary?: ResourceSummary;
  isAdequatelyStaffed?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Assignment {
  id: number;
  person: number;
  project: number;
  weeklyHours: number;
  startDate: string;
  endDate: string;
  role: string;
  isActive: boolean;
  personDetail?: Partial<Person>;
  projectDetail?: Partial<Project>;
  warnings?: Warning[];
  createdAt: string;
  updatedAt: string;
}
```

This contract specification provides everything needed to build the API without complexity. Focus on making these endpoints work reliably rather than adding features not listed here.