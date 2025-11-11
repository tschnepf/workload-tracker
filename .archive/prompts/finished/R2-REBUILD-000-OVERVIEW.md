# R2-REBUILD-000: WORKLOAD TRACKER LEAN REBUILD OVERVIEW

## Project Philosophy
**Build Working Software, Not Perfect Architecture**

This rebuild guide follows lean programming principles to create a functional workload tracker in 5-7 days instead of 5-7 weeks. We prioritize working features over architectural purity, measure before optimizing, and evolve based on actual usage.

## Tech Stack (Simple & Proven)
- **Backend**: Django 5.0 + Django REST Framework
- **Database**: PostgreSQL 15
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **API State**: TanStack Query (React Query)
- **Deployment**: Docker + Docker Compose

## Project Structure
```
workload-tracker/
├── backend/                 # Django project
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/             # Settings and URLs
│   └── apps/               # Django apps
│       ├── people/         # Employee management
│       ├── projects/       # Project management
│       └── assignments/    # Resource allocation
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   ├── hooks/         # Custom React hooks
│   │   └── types/         # TypeScript interfaces
│   └── package.json
├── docker-compose.yml      # Local development
└── README.md              # Setup instructions
```

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
**Goal**: Working CRUD application with authentication
- Setup development environment
- Create basic models and migrations
- Implement REST API endpoints
- Build React app with routing
- Add JWT authentication
- **Deliverable**: Users can create, read, update, delete people and projects

### Phase 2: Business Logic (Days 3-4)
**Goal**: Core workload tracking features
- Assignment management with overlap detection
- Utilization calculations
- Availability checking
- Basic validation rules
- Simple dashboard
- **Deliverable**: Functional workload tracking system

### Phase 3: Production Ready (Days 5-6)
**Goal**: Polish, optimize, and deploy
- Error handling and logging
- Performance optimization (only where measured)
- Docker containerization
- Basic monitoring
- User feedback incorporation
- **Deliverable**: Production-deployed application

## Key Principles

### 1. YAGNI (You Aren't Gonna Need It)
- No microservices for <1000 users
- No event sourcing without audit requirements
- No Redis caching until proven necessary
- No complex state management without state complexity

### 2. Convention Over Configuration
```python
# Use Django conventions
class PersonViewSet(viewsets.ModelViewSet):
    queryset = Person.objects.all()
    serializer_class = PersonSerializer
    # That's it - Django handles the rest
```

### 3. Progressive Enhancement
```
Day 1: GET /api/people returns list
Day 2: Add filtering: GET /api/people?department=engineering
Day 3: Add search: GET /api/people?search=john
Day 4: Add pagination if list >100 items
```

### 4. Measure Before Optimizing
```python
# Don't do this on day 1:
@cache_page(60 * 15)
@vary_on_headers('Authorization')
def complex_calculation_view(request):
    # ...

# Do this instead:
def calculation_view(request):
    # Simple implementation first
    # Add caching ONLY if this becomes slow
```

## Success Metrics
- **Day 2**: Basic CRUD working
- **Day 4**: Core features complete
- **Day 6**: Deployed and usable
- **Week 2**: Iterate based on user feedback

## What We're NOT Building (Initially)
- ❌ Complex domain-driven design patterns
- ❌ Event sourcing and CQRS
- ❌ Microservices architecture
- ❌ GraphQL API
- ❌ Real-time WebSocket updates
- ❌ Advanced analytics dashboards
- ❌ Multi-tenant architecture
- ❌ Custom authentication system

## What We ARE Building
- ✅ Simple Django models with business logic
- ✅ REST API with standard patterns
- ✅ React components with hooks
- ✅ Basic but functional UI
- ✅ Essential validations
- ✅ Docker deployment
- ✅ Tests for critical paths

## File Guide
1. **R2-REBUILD-000-OVERVIEW.md** (this file) - Project philosophy and structure
2. **R2-REBUILD-001-FOUNDATION.md** - Days 1-2: Setup and CRUD
3. **R2-REBUILD-002-BUSINESS-LOGIC.md** - Days 3-4: Core features
4. **R2-REBUILD-003-PRODUCTION.md** - Days 5-6: Deploy and polish
5. **R2-REBUILD-CONTRACTS.md** - API specifications

## Quick Start for AI Agents
```bash
# Start with R2-REBUILD-001-FOUNDATION.md
# Complete each phase before moving to next
# Focus on working software over perfect code
# Deploy early, iterate often
```

## Remember
**"Make it work, make it right, make it fast" - in that order.**

The goal is to have working software that users can provide feedback on, not a perfect architecture that takes months to deliver. Every line of code should be justified by an actual requirement, not a potential future need.