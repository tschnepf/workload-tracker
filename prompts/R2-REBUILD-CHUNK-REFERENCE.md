# R2-REBUILD-CHUNK-REFERENCE: Implementation Mapping

## 📋 Chunk-to-Documentation Mapping

### **Chunk 1: Foundation (4 hours)**
**Primary Reference:** `R2-REBUILD-000-DOCKER-FIRST.md`
**Supporting:** `R2-REBUILD-DOCKER-SETUP.md`

**Implementation Details:**
- Follow Docker setup exactly as specified
- Use complete database schema from MASTER-GUIDE.md (not the minimal version)
- Create all models Day 1, but don't use most fields yet
- Health check endpoint from DOCKER-SETUP.md

**Key Files to Create:**
```
docker-compose.yml
Makefile  
.env.example
backend/models.py (complete schema)
frontend/src/App.tsx (hello world)
```

---

### **Chunk 2: People Management (6 hours)**
**Primary Reference:** `R2-REBUILD-001-FOUNDATION.md` (Days 1-2 backend + frontend sections)
**Supporting:** 
- `R2-REBUILD-STANDARDS.md` (naming conventions)
- `R2-REBUILD-MINIMAL-FIELDS.md` (only use name + capacity)

**Implementation Details:**
- Use Django ModelViewSet from FOUNDATION.md
- Apply STANDARDS.md naming: snake_case backend, camelCase frontend
- Forms only show name (required) + capacity (default 36h)
- Ignore email, department, hire_date fields (they exist but hidden)

**API Endpoints:** Follow CONTRACTS.md Person endpoints
**UI Components:** Use FOUNDATION.md React component structure

---

### **Chunk 3: Assignment Basics (4 hours)**
**Primary Reference:** `R2-REBUILD-ASSIGNMENTS.md`
**Supporting:** `R2-REBUILD-002-BUSINESS-LOGIC.md` (utilization calculation)

**Implementation Details:**
- Use Assignment model from ASSIGNMENTS.md but only:
  - person (FK)
  - project_name (string, not FK yet)
  - allocation_percentage
- Ignore: role_on_project, start_date, end_date
- Add utilization calculation from BUSINESS-LOGIC.md Step 1

**Key Features:**
- Assignment CRUD with string-based projects
- Person.get_current_utilization() method
- Simple assignment form (person dropdown + project text + percentage)

---

### **Chunk 4: Team Dashboard (4 hours)**
**Primary Reference:** `R2-REBUILD-002-BUSINESS-LOGIC.md` (Day 4 Dashboard sections)
**Supporting:** `R2-REBUILD-004-MANAGER-FEATURES.md` (team capacity overview)

**Implementation Details:**
- Dashboard API endpoint from BUSINESS-LOGIC.md
- Team utilization color coding from MANAGER-FEATURES.md
- Available people finder logic
- Start using Person.email and Person.role fields (optional)

**Components:**
- Dashboard page with utilization summary
- Color-coded team member list
- Available people section

---

### **Chunk 5: Project Management (4 hours)**
**Primary Reference:** `R2-REBUILD-002-BUSINESS-LOGIC.md` (Project Resource Summary)
**Supporting:** `R2-REBUILD-ASSIGNMENTS.md` (project access patterns)

**Implementation Details:**
- Activate Project model (created in Chunk 1)
- Migrate project_name strings to Project FKs using ASSIGNMENTS.md patterns
- Project CRUD interface
- Project team summary from BUSINESS-LOGIC.md
- Keep project_name field as backup during migration

**Migration Strategy:**
```python
# Use the dual-field approach from MASTER-GUIDE
# Don't delete project_name column yet
```

---

### **Chunk 6: Smart Features (6 hours)**
**Primary Reference:** `R2-REBUILD-004-MANAGER-FEATURES.md`
**Supporting:** `R2-REBUILD-002-BUSINESS-LOGIC.md` (validation)

**Implementation Details:**
- Available people finder from MANAGER-FEATURES.md
- Assignment validation from BUSINESS-LOGIC.md Step 2
- Start using Person.department field
- Smart assignment suggestions
- Workload rebalancing suggestions

**Key Features:**
- Overallocation warnings
- Department-based filtering
- Capacity recommendations
- Assignment conflict detection

---

### **Chunk 7: Polish & Deploy (4 hours)**
**Primary Reference:** `R2-REBUILD-003-PRODUCTION.md`
**Supporting:** `R2-REBUILD-DOCKER-SETUP.md` (production section)

**Implementation Details:**
- Error handling from PRODUCTION.md Step 1-2
- Loading states from PRODUCTION.md Step 3
- Docker production setup from PRODUCTION.md Step 2
- Health checks from DOCKER-SETUP.md
- Basic monitoring setup

---

## 🔄 Cross-Reference Guide

### **When You Need:**

**Naming Conventions** → `R2-REBUILD-STANDARDS.md`
- Snake_case for Python/Django
- CamelCase for TypeScript/React  
- API transformation at serializer boundary

**Field Requirements** → `R2-REBUILD-MINIMAL-FIELDS.md`
- Only name is required for Person
- Everything else has smart defaults or is optional
- Progressive enhancement pattern

**API Contracts** → `R2-REBUILD-CONTRACTS.md`
- Complete endpoint specifications
- Request/response formats
- Error handling patterns

**Role Clarification** → `R2-REBUILD-ROLE-CLARITY.md`
- Person.role = organizational role (Engineer, Designer)
- Assignment.role_on_project = project-specific role (Technical Lead)
- Most assignments don't need project role

**Docker Issues** → `R2-REBUILD-DOCKER-SETUP.md`
- Troubleshooting containers
- Network connectivity problems
- Environment variable issues

**Advanced Manager Features** → `R2-REBUILD-004-MANAGER-FEATURES.md`
- Milestone tracking (future enhancement)
- Advanced dashboards
- Email notifications

**Deliverables System** → `R2-REBUILD-DELIVERABLES.md`
- Flexible milestone system (future enhancement)
- Progress tracking
- Project completion metrics

## ⚠️ Important Notes

### **Database Strategy:**
- **DO**: Create complete schema in Chunk 1
- **DON'T**: Add new tables/columns later (causes migration hell)
- **DO**: Use feature flags to progressively activate fields
- **DON'T**: Delete unused columns (keep for future use)

### **Implementation Order:**
- **DO**: Complete each chunk fully before moving on
- **DON'T**: Skip chunks or combine them initially
- **DO**: Test acceptance criteria thoroughly
- **DON'T**: Move forward if exit criteria are hit

### **Code Quality:**
- **DO**: Follow STANDARDS.md religiously
- **DON'T**: Mix naming conventions
- **DO**: Keep functions under 20 lines
- **DON'T**: Leave TODO comments or dead code

## 🚀 Quick Start Commands

```bash
# Chunk 1: Foundation
make setup
curl http://localhost:8000/api/health/

# Chunk 2: People Management  
# Create person via Django admin
# Test API: POST /api/people/ {"name": "John Doe"}

# Chunk 3: Assignment Basics
# Test API: POST /api/assignments/ {"person": 1, "project_name": "Website", "allocation_percentage": 50}

# Chunk 4: Team Dashboard
# Visit /dashboard, verify utilization calculations

# Chunk 5: Project Management
# Run migration script, test project FK relationships

# Chunk 6: Smart Features  
# Test overallocation warnings, available people finder

# Chunk 7: Polish & Deploy
# Build production containers: docker-compose -f docker-compose.prod.yml build
```

This reference guide maps your comprehensive documentation to the practical implementation chunks, ensuring nothing gets lost while keeping development focused and manageable.