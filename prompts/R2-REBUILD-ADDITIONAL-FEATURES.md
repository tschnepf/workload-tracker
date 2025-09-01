# R2-REBUILD-ADDITIONAL-FEATURES: Milestones, Manager Tools, Forecasting, Production Polish

Purpose: Define and implement the remaining manager-focused features using the current codebase as the source of truth. This guide follows the prompting style and standards of `R2-REBUILD-MASTER-GUIDE.md` and `R2-REBUILD-STANDARDS.md`.

Key alignment rules:

- Backend uses snake_case models/fields; API maps to camelCase in serializers.
- UI follows VSCode dark theme tokens and established component patterns.
- Use existing models as-is; only add new models where necessary. Deliverables represent milestones.
- Weekly planning remains hours-per-week via JSON keys using date strings; normalize to Sunday week keys going forward for new features.

---

## Feature Set 1: Milestones and Related Features

Goal: Milestone tracking, milestone assignments to people, and a calendar view. No new Milestone model; reuse `Deliverable` as the milestone type.

References: `backend/deliverables/models.py` (Deliverable), `backend/assignments/models.py` (weekly_hours JSON pattern), `R2-REBUILD-004-MANAGER-FEATURES.md` (intent), `R2-REBUILD-STANDARDS.md` (naming/UI)

Design decisions (source-of-truth alignment):

- Treat each `Deliverable` as a milestone. Use its `date`, `description`, `percentage`, `is_completed`, `completed_date`, `sort_order`.
- Add a new linking model for milestone assignments that mirrors our weekly hours pattern.

Database additions (deliverables app):

```python
# backend/deliverables/models.py
class DeliverableAssignment(models.Model):
    """Link a deliverable (milestone) to a person with weekly hours."""
    deliverable = models.ForeignKey('deliverables.Deliverable', on_delete=models.CASCADE, related_name='assignments')
    person = models.ForeignKey('people.Person', on_delete=models.CASCADE, related_name='deliverable_assignments')
    # Follow Assignment.weekly_hours JSON convention: {"YYYY-MM-DD": hours}
    weekly_hours = models.JSONField(default=dict)
    role_on_milestone = models.CharField(max_length=100, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.person.name} on milestone {self.deliverable_id}"
```

API serializers (snake_case → camelCase):

```python
# backend/deliverables/serializers.py
class DeliverableAssignmentSerializer(serializers.ModelSerializer):
    weeklyHours = serializers.JSONField(source='weekly_hours')
    roleOnMilestone = serializers.CharField(source='role_on_milestone', required=False, allow_blank=True)
    personName = serializers.CharField(source='person.name', read_only=True)
    projectId = serializers.IntegerField(source='deliverable.project_id', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = DeliverableAssignment
        fields = ['id', 'deliverable', 'person', 'personName', 'projectId', 'roleOnMilestone', 'weeklyHours', 'createdAt', 'updatedAt']
```

Views/Routes:

```python
# backend/deliverables/views.py
class DeliverableAssignmentViewSet(viewsets.ModelViewSet):
    queryset = DeliverableAssignment.objects.filter(is_active=True).select_related('deliverable', 'person')
    serializer_class = DeliverableAssignmentSerializer
    permission_classes = []

    @action(detail=False, methods=['get'])
    def by_deliverable(self, request):
        deliverable_id = request.query_params.get('deliverable')
        qs = self.get_queryset()
        if deliverable_id:
            qs = qs.filter(deliverable_id=deliverable_id)
        ser = self.get_serializer(qs, many=True)
        return Response(ser.data)

    @action(detail=False, methods=['get'])
    def by_person(self, request):
        person_id = request.query_params.get('person')
        qs = self.get_queryset()
        if person_id:
            qs = qs.filter(person_id=person_id)
        ser = self.get_serializer(qs, many=True)
        return Response(ser.data)

# backend/deliverables/urls.py (router registration)
router.register(r'assignments', DeliverableAssignmentViewSet, basename='deliverable-assignment')
```

Milestone calendar endpoint (read-only):

```python
# backend/deliverables/views.py
class DeliverableCalendarView(APIView):
    def get(self, request):
        start = request.query_params.get('start')  # YYYY-MM-DD
        end = request.query_params.get('end')
        qs = Deliverable.objects.all()
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)

        data = [{
            'id': d.id,
            'project': d.project_id,
            'projectName': d.project.name,
            'title': d.description or (f"{d.percentage}%" if d.percentage is not None else 'Milestone'),
            'date': d.date,
            'isCompleted': d.is_completed,
            'assignmentCount': d.assignments.count(),
        } for d in qs.select_related('project')]
        return Response(data)

# urls: path('calendar/', DeliverableCalendarView.as_view())
```

Frontend patterns (VSCode dark mode):

- MilestoneCalendar: read-only grid/timeline using `Card`, `Table`, semantic colors for status; hover shows assignmentCount and projectName.
- Deliverable detail drawer: show milestone assignments with inline weekly hours editors reusing the assignment grid pattern and week key list from `AssignmentSerializer.availableWeeks`.

Status: Completed

Acceptance criteria:

```text
✅ Can link a person to a deliverable with weekly hours (JSON, Sunday keys)
✅ Calendar shows deliverables between date range with project names
✅ Deliverable page shows assigned people and weekly hours
✅ API fields use camelCase; backend uses snake_case
✅ Dark mode UI matches tokens (no hardcoded colors)
```

Demo script:

```text
1) Create a Deliverable with date and description on Project A.
2) Assign Sarah to the deliverable for 8h on two weeks.
3) Load calendar for the month; see the milestone with assignment count.
4) Open detail and adjust week hours inline; verify persistence.
```

---

## Feature Set 2: Advanced Manager Tools

Goal: Capacity heatmap, workload balancer, quick actions, smart rebalancing suggestions.

References: `assignments/views.py` (conflict checks), `people/models.py` (utilization methods), `R2-REBUILD-004-MANAGER-FEATURES.md` (intent)

Capacity Heatmap (backend):

```python
# backend/people/views.py (add to PersonViewSet)
@action(detail=False, methods=['get'])
def capacity_heatmap(self, request):
    weeks = int(request.query_params.get('weeks', 12))
    people = self.get_queryset().select_related('department')
    result = []
    for p in people:
        util = p.get_utilization_over_weeks(weeks=weeks)
        result.append({
            'id': p.id,
            'name': p.name,
            'weeklyCapacity': p.weekly_capacity,
            'department': p.department.name if p.department else None,
            'weekKeys': util['week_keys'],
            'weekTotals': util['week_totals'],
            'peak': {
                'weekKey': util['peak_week_key'],
                'percentage': util['peak_percentage']
            },
            'averagePercentage': util['total_percentage']
        })
    return Response(result)
```

Workload Balancer (backend suggestions):

```python
# backend/assignments/views.py (new action)
@action(detail=False, methods=['get'])
def rebalance_suggestions(self, request):
    """Suggest non-destructive rebalancing ideas across the next 12 weeks."""
    weeks = Assignment.get_next_12_weeks()
    suggestions = []
    # Example heuristic: find people >100% and suggest shifting hours to available teammates
    from people.models import Person
    team = Person.objects.filter(is_active=True)
    over = []
    under = []
    for person in team:
        u = person.get_utilization_over_weeks(weeks=1)
        if u['allocated_hours'] > person.weekly_capacity:
            over.append((person, u))
        elif u['allocated_hours'] < person.weekly_capacity * 0.7:
            under.append((person, u))
    for (op, ou) in over:
        for (up, uu) in under:
            suggestions.append({
                'id': f"{op.id}-{up.id}",
                'title': f"Shift hours from {op.name} to {up.name}",
                'description': f"{op.name} peak {ou['peak_percentage']}%. {up.name} avg {uu['total_percentage']}%. Consider moving 4-8h on overlapping projects.",
                'fromPersonId': op.id,
                'toPersonId': up.id,
            })
    return Response(suggestions[:20])
```

Quick Actions (frontend):

- Reuse existing Button/Card styles to render a 2x2 grid: Find Available, Balance Workload, Milestone Review, Capacity Report.
- Each opens a split-panel modal using the Projects/People split-panel pattern.

Acceptance criteria:

```text
✅ Heatmap endpoint returns weekKeys and weekTotals per person (12 weeks default)
✅ Rebalance suggestions endpoint returns human-readable, non-destructive suggestions
✅ Quick Actions panel launches the three tools
✅ UI complies with VSCode dark tokens
```

---

## Feature Set 3: Forecasting and Visual Planning

Goal: Team workload forecast and timeline views based on current weekly hours.

Backend forecast (team-level):

```python
# backend/people/views.py (add to PersonViewSet)
@action(detail=False, methods=['get'])
def workload_forecast(self, request):
    weeks = int(request.query_params.get('weeks', 8))
    people = self.get_queryset()
    from datetime import date, timedelta
    start = date.today() - timedelta(days=date.today().weekday())
    forecast = []
    for w in range(weeks):
        week_start = start + timedelta(weeks=w)
        week_key = week_start.strftime('%Y-%m-%d')
        total_capacity = 0
        total_allocated = 0
        overallocated = []
        for p in people:
            util = p.get_utilization_over_weeks(weeks=1)
            total_capacity += p.weekly_capacity
            total_allocated += util['allocated_hours']
            if util['allocated_hours'] > p.weekly_capacity:
                overallocated.append({'id': p.id, 'name': p.name})
        team_util = round((total_allocated / total_capacity * 100), 1) if total_capacity else 0
        forecast.append({
            'weekStart': week_key,
            'totalCapacity': total_capacity,
            'totalAllocated': total_allocated,
            'teamUtilization': team_util,
            'peopleOverallocated': overallocated,
        })
    return Response(forecast)
```

Visual timeline views (frontend):

- Project timeline: stacked bars per assignment by week, overlay deliverable dates; respect utilization color scale.
- Team forecast chart: line or stacked area for capacity vs. allocated.

Acceptance criteria:

```text
✅ `/api/people/workload_forecast/` returns 8-week forecast with teamUtilization
✅ Timeline displays deliverable dates from Deliverables API
✅ Colors follow established utilization palette
```

---

## Feature Set 4: Production Polish

Goal: Strengthen error handling, logging, monitoring, and deployment scripts.

Backend hardening:

- Global DRF exception handler returning structured error shapes; map to camelCase in responses.
- Structured logging (JSON) with request IDs, user/route, and latency; enable slow query logging.
- Add audit log hooks on Assignment and DeliverableAssignment create/update/delete.
- Keep `/api/health/` fast and dependency-light (already present).

Monitoring & alerts:

- Optional Sentry integration via `SENTRY_DSN` env var and middleware.
- Add lightweight metrics endpoint or integrate Django Silk/toolbar in dev only; keep prod clean.

Deployment scripts:

- Makefile targets: `make build-prod`, `make up-prod`, `make logs-prod`, `make backup-db`.
- Docker Compose prod overlay; Nginx stays as static/frontend proxy; backend served via gunicorn.

Acceptance criteria:

```text
✅ Consistent error responses with helpful messages; frontend toasts render cleanly
✅ Logs include requestId, path, status, duration; are JSON-formatted in containers
✅ Basic audit events for assignment changes are captured
✅ One-command prod bring-up and logs work locally
```

---

## Standards & Compliance Checklist

```text
✅ Backend snake_case; API camelCase via serializers
✅ UI uses VSCode dark tokens; no hardcoded colors  
✅ Week keys normalized to Sunday for new data; tolerant reading (+/- days) remains in People methods
✅ Feature flags allowed where helpful (e.g., enable DeliverableAssignments gradually)
✅ No stale .js/.jsx files in frontend/src during development
✅ TypeScript compilation passes before any feature marked complete
✅ All new API endpoints manually tested with curl/Postman
✅ Container restarts performed after significant changes
```

## 🚨 Production Deployment Validation

**Database Migration Safety:**
```bash
# Before deploying migrations:
docker-compose exec backend python manage.py makemigrations --dry-run --verbosity=2
docker-compose exec backend python manage.py migrate --plan

# Test rollback capability:
docker-compose exec backend python manage.py migrate deliverables 0001 --fake
docker-compose exec backend python manage.py migrate deliverables
```

**Frontend Build Validation:**
```bash
# Ensure production build works:
docker-compose exec frontend npm run build
docker-compose exec frontend ls -la dist/

# Check bundle size impact:
docker-compose exec frontend npm run build -- --report
```

**API Performance Monitoring:**
- Set query time limits for heatmap/forecast endpoints (max 5 seconds)
- Monitor memory usage for large weekly_hours JSON objects
- Add rate limiting to heavy computational endpoints
- Track feature adoption metrics

**Error Prevention Patterns:**
- **Dropdown Components**: Always load options from API endpoints
- **Form Data**: Test string ↔ number conversion explicitly with browser network tab
- **Import Resolution**: After path/config changes, verify imports resolve in container
- **API Responses**: Validate camelCase fields appear correctly in browser network requests

## Enhanced QA Script

**Pre-QA Environment Check:**
```bash
# 1. Clean slate - remove stale files:
find frontend/src -name "*.js" -o -name "*.jsx" | grep -v node_modules | xargs rm -f

# 2. Verify services:
docker-compose ps  # All "Up"
docker-compose exec frontend npx tsc --noEmit  # No errors

# 3. API health:
curl -s http://localhost:8000/api/health/ | grep "healthy"
```

**Feature Testing Sequence:**
```text
1) Create deliverable with date; assign two people via DeliverableAssignments.
   ✅ Check browser network tab shows camelCase fields
   ✅ No console errors during form submission

2) Verify calendar shows the milestone with assignmentCount.
   ✅ API endpoint returns expected JSON shape
   ✅ Frontend renders without TypeScript errors

3) Open heatmap and see 12-week rows per person; colors reflect utilization tiers.
   ✅ Performance: query completes under 5 seconds
   ✅ Colors match established utilization palette

4) Open rebalancer suggestions; apply one manually and recheck conflicts via existing `check_conflicts`.
   ✅ Suggestions API returns reasonable data
   ✅ Manual application doesn't break existing functionality

5) Load team forecast (8 weeks) and scan for weeks over 100%.
   ✅ Forecast calculations are mathematically sound
   ✅ No N+1 query issues in backend logs

6) Force an API error; confirm structured error and log entry with requestId.
   ✅ Error response follows standard shape
   ✅ Frontend handles errors gracefully with toasts
```

**Post-QA Validation:**
```bash
# Production readiness:
docker-compose exec frontend npm run build  # Must succeed
docker-compose exec backend python manage.py check  # No warnings
docker-compose logs | grep ERROR  # Should be empty
```

## Notes

- We intentionally reuse Deliverable as the milestone model to avoid duplicate concepts. The new DeliverableAssignment mirrors `Assignment.weekly_hours` conventions to keep calculations consistent with the rest of the system.

## 📚 Implementation Safety Improvements (2025-09-01)

**Based on lessons learned from TypeScript cleanup and PersonForm dropdown issues:**

### ✅ Added Critical Safety Measures:
1. **Stale File Prevention**: Mandatory checks for compiled .js/.jsx files that override TSX changes
2. **TypeScript Validation Gates**: Required `tsc --noEmit` validation after all changes
3. **Container Synchronization**: Explicit restart protocols when changes aren't reflecting
4. **API Contract Testing**: Manual curl testing before frontend implementation
5. **Browser Validation**: Network tab verification for camelCase field transformation

### ✅ Enhanced Each Prompt With:
- Pre-flight safety checks (find/delete stale files)
- Implementation validation commands (TypeScript compilation)
- Post-implementation verification (browser testing)
- Clear acceptance criteria including operational requirements

### ✅ Production Deployment Safeguards:
- Migration rollback testing procedures
- Build validation and bundle analysis
- Performance monitoring requirements
- Error handling validation

**These improvements prevent the class of issues that occurred with:**
- PersonForm role dropdown (stale JS overriding TSX changes)
- TypeScript compilation failures breaking deployments
- API field transformation not working as expected
- Container state inconsistencies during development

### ✅ Scale Architecture Enhancements (2025-09-01):
1. **Service Layer Refactoring (Prompt 7.5)**: Moved complex business logic from ViewSets to dedicated service classes for improved testability and reusability at 100-300+ person scale
2. **Robust Input Validation (Prompt 3)**: Added comprehensive JSONField validation for weekly_hours and XSS protection for user strings to prevent data corruption at scale
3. **Performance Caching Infrastructure (Prompt 7.6)**: Implemented Redis caching with invalidation signals for analytics endpoints to achieve sub-second response times with large teams
4. **Selective Atomic Transactions (Prompt 7.5)**: Added transaction guidelines for multi-step operations while avoiding unnecessary overhead on simple CRUD

**Scale Benefits:**
- **Performance**: Sub-second analytics response times for 300+ people via caching
- **Data Quality**: Malformed weekly_hours data prevented via validation
- **Maintainability**: Business logic testable independent of HTTP layer
- **Reliability**: Multi-step operations protected by atomic transactions

---

# Implementation Prompts (Agent-Ready, One-At-A-Time)

Purpose: Provide precise, prescriptive prompts you can feed to an AI agent to implement this feature set safely and consistently. Each prompt focuses on one deliverable, enforces our standards, and includes acceptance criteria. Do not take shortcuts. Follow best practices and keep changes scoped.

Global standards to apply in every prompt:
- Backend models/DB: snake_case. API: camelCase via DRF serializers `source=...` mapping.
- Week keys: use Sunday `YYYY-MM-DD` for new writes. Existing readers may stay tolerant (+/- 3 days) as implemented.
- UI tokens: only use VSCode dark theme tokens from `frontend/src/theme/tokens.ts`. No hardcoded colors.
- Naming and structure: prefer `select_related`/`prefetch_related` to avoid N+1 queries. Index FKs used in filters.
- Tests: for backend, add DRF tests that validate status codes and response shapes; for frontend, add smoke tests where practical. Keep tests focused on the change.
- Logging/Errors: use structured, clear error messages. Avoid noisy debug logs by default; guard behind env flags that already exist.

## 🚨 CRITICAL: Pre-Implementation Safety Checks (Every Prompt)

**Development Workflow Safeguards** - Apply to ALL prompts:

### Pre-Flight Checks (Before Starting):
```bash
# 1. Check for stale compiled JS files that can override changes
find frontend/src -name "*.js" -o -name "*.jsx" | grep -v node_modules
# Delete any found: rm frontend/src/path/to/file.js

# 2. Verify container health
docker-compose ps  # All should show "Up"

# 3. Test existing related API endpoints work
curl -s http://localhost:8000/api/health/ | grep "healthy"
```

### During Implementation:
- **TypeScript Safety**: Run `tsc --noEmit` after any model/API changes
- **API Testing**: Test new endpoints with curl before frontend work
- **Container Sync**: Run `docker-compose restart frontend` after significant changes

### Post-Implementation Validation:
```bash
# 1. TypeScript compilation MUST pass
docker-compose exec frontend npx tsc --noEmit

# 2. Verify no browser console errors
# Open http://localhost:3000 and check dev tools

# 3. Test API contract manually
curl -s http://localhost:8000/api/your-new-endpoint/ | head -20

# 4. Verify camelCase fields in browser Network tab
```

**🔴 STOP WORK if any of these fail. Fix before proceeding.**

Do not implement backward-compatibility shims or versioned APIs for these prompts; not required at this time.

## Prompt 1 — Freeze Contract: DeliverableAssignment

Define the DeliverableAssignment API contract as a short spec inside this repository (e.g., `contracts/deliverables.assignments.md`). Capture exact request/response shapes in camelCase. Include examples for create, update, list, by_deliverable, and by_person. Reference week key conventions and date formats.

Requirements:
- Document endpoints:
  - `POST /api/deliverables/assignments/`
  - `PATCH /api/deliverables/assignments/{id}/`
  - `GET /api/deliverables/assignments/`
  - `GET /api/deliverables/assignments/by_deliverable?deliverable=ID`
  - `GET /api/deliverables/assignments/by_person?person=ID`
- Request/response examples with fields: `deliverable`, `person`, `weeklyHours`, `roleOnMilestone`, `personName`, `projectId`, `createdAt`, `updatedAt`.
- Validation notes: week key format `YYYY-MM-DD` (Sundays); hours are non-negative floats and reasonable per week.
- Error shape examples for 400/404/500.

Acceptance criteria:
- Contract file exists and is consistent with standards above.
- Examples compile logically and match our naming scheme.

## Prompt 2 — Backend: DeliverableAssignment Model + Migration

Implement `DeliverableAssignment` in `backend/deliverables/models.py`. Follow existing patterns used by `Assignment` and `Deliverable`.

Requirements:
- Fields: `deliverable (FK)`, `person (FK)`, `weekly_hours JSONField default={}`, `role_on_milestone (CharField, nullable)`, `is_active (BooleanField, default=True)`, `created_at`, `updated_at`.
- Meta: ordering by `-created_at`.
- DB indices: add indexes on `deliverable`, `person`.
- Admin registration: optional but preferred for quick inspection.
- Generate and apply migration.

Acceptance criteria:
- Model created; migration runs cleanly.
- Indices present for FKs.
- No changes to unrelated models.

## Prompt 3 — Backend: Serializer + ViewSet + URLs for DeliverableAssignment

Add serializer and viewset for `DeliverableAssignment`, registered under `/api/deliverables/assignments/`.

Requirements:
- Serializer maps: `weeklyHours -> weekly_hours`, `roleOnMilestone -> role_on_milestone`, `personName -> person.name`, `projectId -> deliverable.project_id`, `createdAt/updatedAt`.
- ViewSet: CRUD with `queryset` filtered by `is_active=True`, `select_related('deliverable','person','deliverable__project')`.
- Actions:
  - `by_deliverable?deliverable=ID`
  - `by_person?person=ID`
- URLs: register as `router.register('assignments', DeliverableAssignmentViewSet, basename='deliverable-assignment')` inside `backend/deliverables/urls.py`.
- Tests: DRF tests for create, list, by_deliverable, by_person; verify camelCase response fields.

**🔒 Robust Input Validation (Scale Protection):**
```python
# Add to DeliverableAssignmentSerializer:
def validate_weekly_hours(self, value):
    """Validate weekly_hours JSON structure and values for data quality"""
    if not isinstance(value, dict):
        raise serializers.ValidationError("Weekly hours must be a dictionary")
    
    for date_key, hours in value.items():
        # Validate YYYY-MM-DD format (Sunday week keys)
        try:
            date_obj = datetime.strptime(date_key, '%Y-%m-%d')
            # Ensure it's a Sunday (weekday() == 6)
            if date_obj.weekday() != 6:
                raise serializers.ValidationError(f"Week key {date_key} must be a Sunday")
        except ValueError:
            raise serializers.ValidationError(f"Invalid date format: {date_key}. Use YYYY-MM-DD Sunday")
        
        # Validate hours: non-negative, reasonable limits
        if not isinstance(hours, (int, float)) or hours < 0 or hours > 80:
            raise serializers.ValidationError(f"Hours must be 0-80, got: {hours}")
    
    return value

def validate_role_on_milestone(self, value):
    """Sanitize role description for security and consistency"""
    if value:
        value = value.strip()[:100]  # Truncate to field max length
        # Remove potentially problematic characters
        import re
        value = re.sub(r'[<>"\']', '', value)  # Basic XSS prevention
    return value
```

**Validation Tests Required:**
- Valid weekly_hours with Sunday dates
- Invalid date formats (non-Sunday, malformed)
- Hours validation (negative, over 80, non-numeric)
- Role sanitization (XSS attempts, length limits)

**🚨 Implementation Safety Checklist:**
```bash
# Before coding:
find frontend/src -name "*.js" -o -name "*.jsx" | grep -v node_modules

# After backend changes:
docker-compose exec backend python manage.py migrate
curl -s http://localhost:8000/api/deliverables/assignments/ | head -20

# After serializer changes - CRITICAL:
docker-compose exec frontend npx tsc --noEmit
```

Acceptance criteria:
- ✅ Pre-flight checks pass (no stale JS files)
- ✅ TypeScript compilation passes after changes
- ✅ Endpoints work with expected shapes and status codes
- ✅ API manually tested with curl shows camelCase fields
- ✅ Input validation prevents malformed data (invalid dates, negative hours)
- ✅ Sanitization protects against XSS in role descriptions
- ✅ Tests pass locally including validation edge cases

## Prompt 4 — Backend: Milestone Calendar Endpoint

Implement a read-only calendar endpoint that returns deliverables within a date range along with `assignmentCount`.

Requirements:
- Endpoint: `GET /api/deliverables/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD`.
- Response items: `{ id, project, projectName, title, date, isCompleted, assignmentCount }`.
- Efficient query: `select_related('project')` and annotate `assignmentCount` using related `DeliverableAssignment`.
- Conditional caching: ETag/Last-Modified like existing patterns.
- Tests: date filtering, missing params tolerated (all), and assignment counts.

Acceptance criteria:
- Endpoint returns correct items and counts within range.
- Adds no N+1 queries in common paths.

## Prompt 5 — Backend: People Capacity Heatmap Action

Add `capacity_heatmap` action to `PersonViewSet` that returns per-person week summaries based on existing utilization helpers.

Requirements:
- Endpoint: `GET /api/people/capacity_heatmap/?weeks=12` (default 12).
- Response for each person: `{ id, name, weeklyCapacity, department, weekKeys, weekTotals, peak: { weekKey, percentage }, averagePercentage }`.
- Use `Person.get_utilization_over_weeks` to compute.
- Tests: endpoint exists, default weeks=12, stable keys, reasonable values.

Acceptance criteria:
- Action returns expected structure and values.

## Prompt 6 — Backend: Workload Rebalance Suggestions Action

Add non-destructive suggestions endpoint to `AssignmentViewSet` for potential hour shifts across team.

Requirements:
- Endpoint: `GET /api/assignments/rebalance_suggestions/` with optional params (e.g., horizon weeks in future).
- Heuristic: identify overallocated (>100%) and underutilized (<70%) people; suggest shifts (IDs and titles, human-readable descriptions).
- Tests: returns list; fields present; suggestions limited (e.g., max 20).

Acceptance criteria:
- Action returns well-formed suggestions under varying team states.

## Prompt 7 — Backend: Team Workload Forecast Action

Add `workload_forecast` action to `PersonViewSet` that aggregates team capacity vs allocated for N weeks ahead.

Requirements:
- Endpoint: `GET /api/people/workload_forecast/?weeks=8` (default 8).
- Response array: `{ weekStart, totalCapacity, totalAllocated, teamUtilization, peopleOverallocated[] }`.
- Tests: correct length, utilization calculation, stable date keys.

Acceptance criteria:
- Forecast response matches spec and calculations are sound.

## Prompt 7.5 — Backend: Service Layer Implementation for Business Logic

Refactor complex business logic from ViewSet actions into dedicated service classes for improved testability, maintainability, and scale readiness (100-300+ people).

**🔴 PREREQUISITE: Complete Prompts 5-7 first (requires existing ViewSet actions to refactor)**

**🚨 Implementation Safety Checklist:**
```bash
# Before refactoring:
docker-compose ps  # All services "Up"
curl -s http://localhost:8000/api/people/capacity_heatmap/ | head -20  # Existing endpoints work
curl -s http://localhost:8000/api/assignments/rebalance_suggestions/ | head -20

# After refactoring - CRITICAL:
docker-compose exec backend python manage.py test people assignments
curl -s http://localhost:8000/api/people/capacity_heatmap/ | head -20  # Still works
```

Requirements:
- Create `backend/people/services.py` with `CapacityAnalysisService` class
- Create `backend/assignments/services.py` with `WorkloadRebalancingService` class  
- Move business logic from ViewSet actions to service static methods
- Keep ViewSets as thin HTTP adapters focused on request/response handling
- Add comprehensive unit tests for service classes (independent of DRF)
- Maintain exact same API response formats and behavior

**Service Structure:**
```python
# backend/people/services.py
class CapacityAnalysisService:
    @staticmethod
    def get_capacity_heatmap(people_queryset, weeks: int = 12) -> List[Dict]:
        """Extract logic from PersonViewSet.capacity_heatmap"""
        # Move utilization calculation logic here
        
    @staticmethod
    def get_workload_forecast(people_queryset, weeks: int = 8) -> List[Dict]:
        """Extract logic from PersonViewSet.workload_forecast"""
        # Move team aggregation logic here

# backend/assignments/services.py  
class WorkloadRebalancingService:
    @staticmethod
    def generate_rebalance_suggestions(weeks: int = 12) -> List[Dict]:
        """Extract logic from AssignmentViewSet.rebalance_suggestions"""
        # Move heuristic analysis logic here
```

**Refactored ViewSet Pattern:**
```python
# backend/people/views.py
from .services import CapacityAnalysisService

@action(detail=False, methods=['get'])
def capacity_heatmap(self, request):
    weeks = int(request.query_params.get('weeks', 12))
    people = self.get_queryset().select_related('department')
    result = CapacityAnalysisService.get_capacity_heatmap(people, weeks)
    return Response(result)
```

**Scale Preparation Enhancements:**
- Design services for future async processing (Celery integration points)
- Add caching decorators to service methods for performance
- Structure for bulk operations on large people querysets
- Include performance logging for methods handling 100+ records

**🔒 Atomic Transactions (Data Integrity at Scale):**
```python
# Use transactions for multi-step operations only:
from django.db import transaction

@staticmethod
@transaction.atomic
def bulk_rebalance_assignments(rebalance_actions: List[Dict]) -> Dict:
    """Apply multiple assignment changes atomically"""
    # Only use for operations that modify multiple records
    # Single CRUD operations don't need explicit transactions
    
# Example: Complex multi-step operation
@transaction.atomic
def create_milestone_with_assignments(deliverable_data, assignment_list):
    """Create deliverable and assign people atomically"""
    deliverable = Deliverable.objects.create(**deliverable_data)
    for assignment in assignment_list:
        DeliverableAssignment.objects.create(deliverable=deliverable, **assignment)
    return deliverable
```

**Transaction Guidelines:**
- ✅ **Use for**: Multi-model operations, bulk updates, complex workflows  
- ❌ **Don't use for**: Simple CRUD operations, read-only endpoints
- ✅ **Performance**: Keep transaction blocks small and fast

**🚀 Caching Integration (Performance Critical at 100-300+ People):**
```python
# Service methods must include caching strategy:
from django.core.cache import cache

@staticmethod
def get_capacity_heatmap(people_queryset, weeks: int = 12) -> List[Dict]:
    """Cached capacity analysis - essential for scale performance"""
    cache_key = f"capacity_heatmap_{hash(str(people_queryset.query))}_{weeks}"
    
    result = cache.get(cache_key)
    if result is None:
        result = CapacityAnalysisService._calculate_heatmap_raw(people_queryset, weeks)
        cache.set(cache_key, result, timeout=300)  # 5 minutes
        
    return result

@staticmethod  
def get_workload_forecast(people_queryset, weeks: int = 8) -> List[Dict]:
    """Cached forecast analysis - prevents database overload"""
    cache_key = f"workload_forecast_{hash(str(people_queryset.query))}_{weeks}"
    
    result = cache.get(cache_key)
    if result is None:
        result = CapacityAnalysisService._calculate_forecast_raw(people_queryset, weeks)
        cache.set(cache_key, result, timeout=600)  # 10 minutes
        
    return result
```

**Cache Invalidation Strategy:**
- Invalidate capacity/forecast caches when assignments change
- Use Django signals: `post_save`, `post_delete` on Assignment/DeliverableAssignment
- Cache key patterns: `"capacity_*"`, `"forecast_*"`, `"rebalance_*"`

**Tests Required:**
```python
# backend/people/tests/test_services.py
class TestCapacityAnalysisService(TestCase):
    def test_capacity_heatmap_calculation(self):
    def test_workload_forecast_aggregation(self):
    
# backend/assignments/tests/test_services.py  
class TestWorkloadRebalancingService(TestCase):
    def test_rebalance_suggestions_generation(self):
```

Acceptance criteria:
- ✅ Service classes created with static methods for business logic
- ✅ ViewSet actions refactored to use services (thin HTTP adapters)
- ✅ All existing API endpoints return identical responses
- ✅ Comprehensive unit tests for service classes pass
- ✅ No performance regression in endpoint response times
- ✅ Business logic is now reusable outside of API context
- ✅ Service methods designed for scale (bulk operations, caching ready)
- ✅ Caching strategy implemented with proper invalidation
- ✅ Cache performance provides sub-second response times for 100+ people

## Prompt 7.6 — Backend: Caching Infrastructure Setup

Configure Redis caching infrastructure and invalidation signals to support high-performance analytics endpoints at scale.

**🔴 PREREQUISITE: Complete Prompt 7.5 first (requires service layer caching integration)**

**🚨 Implementation Safety Checklist:**
```bash
# Before setup:
docker-compose ps  # All services healthy
curl -s http://localhost:8000/api/people/capacity_heatmap/ | head -20  # Baseline performance

# After caching setup:
docker-compose exec backend python manage.py shell -c "from django.core.cache import cache; print(cache.get('test-key'))"
curl -w "Time: %{time_total}s\n" http://localhost:8000/api/people/capacity_heatmap/ -o /dev/null
```

Requirements:
- Configure Redis cache backend in Django settings with environment-specific configuration
- Add cache invalidation signals for Assignment and DeliverableAssignment models  
- Implement cache key naming conventions and TTL policies
- Add cache monitoring and hit/miss metrics for development debugging
- Environment configuration: local cache for dev, Redis for staging/prod

**Cache Configuration:**
```python
# backend/config/settings.py
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache' if os.getenv('REDIS_URL') else 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': os.getenv('REDIS_URL', 'redis://127.0.0.1:6379/1'),
        'TIMEOUT': 300,  # 5 minutes default
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}
```

**Cache Invalidation Signals:**
```python
# backend/assignments/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache

@receiver([post_save, post_delete], sender=Assignment)
@receiver([post_save, post_delete], sender=DeliverableAssignment)
def invalidate_analytics_cache(sender, instance, **kwargs):
    """Invalidate capacity and forecast caches when assignments change"""
    cache.delete_pattern("capacity_heatmap_*")
    cache.delete_pattern("workload_forecast_*")
    cache.delete_pattern("rebalance_suggestions_*")
```

**Performance Monitoring:**
```python
# Add cache performance logging to service methods
import logging
logger = logging.getLogger('cache_performance')

def log_cache_performance(cache_key: str, hit: bool, calculation_time: float = None):
    logger.info(f"Cache {'HIT' if hit else 'MISS'}: {cache_key}", extra={
        'cache_hit': hit,
        'calculation_time_ms': calculation_time * 1000 if calculation_time else None
    })
```

Acceptance criteria:
- ✅ Redis cache backend configured with environment variables
- ✅ Cache invalidation signals properly registered and tested
- ✅ Service methods integrate with caching infrastructure  
- ✅ Cache hit/miss logging functional for performance monitoring
- ✅ 80%+ cache hit rate for repeated analytics requests
- ✅ Sub-second response times for cached endpoints with 100+ people
- ✅ Cache invalidation works correctly when assignments change

## Prompt 8 — Frontend: API Client Extensions

Extend `frontend/src/services/api.ts` to add typed client functions for the new endpoints.

**🔴 CRITICAL: Check for stale compiled files FIRST:**
```bash
# Delete any .js files in src/ before starting:
find frontend/src -name "*.js" -o -name "*.jsx" | grep -v node_modules | xargs rm -f
```

Requirements:
- Add `deliverableAssignmentsApi` with `list`, `byDeliverable`, `byPerson`, `create`, `update`, `delete`.
- Add `deliverablesApi.calendar(start,end)`.
- Add `peopleApi.capacityHeatmap(weeks?)` and `peopleApi.workloadForecast(weeks?)`.
- Use existing fetch wrapper; return proper TS types; no hardcoded colors/log spam.
- Regenerate TS interfaces if needed (`make generate-types`).

**🚨 Implementation Safety Checklist:**
```bash
# After changes - MANDATORY:
docker-compose exec frontend npx tsc --noEmit
docker-compose restart frontend

# Verify imports work in browser:
# Open http://localhost:3000 and check console for import errors
```

Acceptance criteria:
- ✅ No stale .js files exist in src/
- ✅ TypeScript compilation passes with no errors
- ✅ API methods compile and are used by subsequent prompts
- ✅ Browser console shows no import resolution errors

## Prompt 9 — Frontend: Quick Actions Panel

Create a `QuickActionsPanel` component that presents actions: Find Available, Balance Workload, Milestone Review, Capacity Report. Each opens a split-panel modal consistent with the Projects/People pattern.

Status: Completed

Requirements:
- Use dark tokens; no hardcoded hex colors.
- Keyboard accessible; focus management in modals.
- No blocking network in initial render; lazy-load heavy content.

Acceptance criteria:
- Panel renders; each button opens the correct tool shell.

## Prompt 10 — Frontend: Milestone Assignments UI

In the project detail deliverables section, allow linking/unlinking people to a deliverable (optional role). Do not store per-deliverable weekly hours; display derived hours from Assignment.weekly_hours for the deliverable’s project over the milestone window.

**🔴 CRITICAL: Prevent Dropdown/Form Issues:**
```bash
# 1. Check for stale compiled files:
find frontend/src -name "*.js" -o -name "*.jsx" | grep -v node_modules | xargs rm -f

# 2. Test the deliverable assignments API first:
curl -s http://localhost:8000/api/deliverables/assignments/ | head -20
```

Requirements:
- For a selected deliverable, show linked people and display derived totals and a small week breakdown for the milestone window.
- Milestone window default: 6 weeks leading up to the deliverable date; if a prior deliverable exists for the same project, use the time between the prior and current deliverable (exclusive→inclusive).
- No inline hour editing here; any hour adjustments are made on the Assignments grid.
- Optimistic UI updates for link/unlink and role changes; rollback on error with clear toast.
- **CRITICAL**: Load people/roles from API, never hardcode options in dropdowns

**🚨 Implementation Safety Checklist:**
```bash
# After UI changes:
docker-compose exec frontend npx tsc --noEmit
docker-compose restart frontend

# Test in actual browser:
# 1. Open http://localhost:3000/projects/{id}
# 2. Check that dropdowns populate from API
# 3. Verify no console errors
# 4. Test form submission with browser network tab
```

Acceptance criteria:
- ✅ No stale .js files preventing updates
- ✅ TypeScript compilation passes
- ✅ Create/update/delete works; conflict warnings surface
- ✅ UI adheres to VSCode dark tokens
- ✅ Dropdowns load from API (never hardcoded)

## Prompt 11 — Frontend: Milestone Calendar View

Add a calendar view that consumes `/api/deliverables/calendar` and displays deliverables within a date range.

Requirements:
- Show project name, title (description or percentage), date, assignmentCount badge.
- assignmentCount represents the number of distinct people with >0 derived hours (from Assignment.weekly_hours) on the deliverable’s project within the milestone window.
- Range controls (month, custom start/end). Debounce queries.
- Lightweight rendering; no heavy dependency unless justified. Plain SVG/DOM acceptable.

Acceptance criteria:
- Calendar renders range correctly; counts match API; responsive layout.

## Prompt 12 — Frontend: Team Forecast & Project Timeline

Add charts for team workload forecast and a per-project timeline with assignment bars and deliverable overlays.

Requirements:
- Forecast: line/area comparing totalCapacity vs totalAllocated for N weeks (sourced from Assignment.weekly_hours via API).
- Timeline: stacked bars by week from Assignment.weekly_hours; overlay deliverable markers (display-only); use utilization color scale from tokens.
- Keep bundle size in check; prefer small libs or SVG.

Acceptance criteria:
- Charts render correctly; color scale matches utilization tiers.

## Prompt 13 — Backend: Global Exception Handler

Add a DRF global exception handler that returns a consistent error shape and integrates with logging.

Requirements:
- Shape: `{ message, details?, requestId }` with HTTP status codes.
- Wire as `REST_FRAMEWORK['EXCEPTION_HANDLER']`.
- Map serializer/validation errors to `details` for frontend toasts.

Acceptance criteria:
- Errors across APIs return the standard shape; manual test verifies.

## Prompt 14 — Backend: Structured JSON Logging

Configure JSON logging with request metadata and slow-query logging.

Requirements:
- Log fields: timestamp, level, logger, requestId, method, path, status, durationMs.
- Add slow query threshold logging via DB settings.
- Ensure logs are JSON in containers.

Acceptance criteria:
- Logs appear as JSON with required fields; slow queries logged.

## Prompt 15 — Build & Deploy: Makefile + Compose (Prod Overlay)

Add Makefile targets and a docker-compose prod overlay to run the backend under gunicorn behind nginx, and serve the frontend statically.

Requirements:
- Make targets: `build-prod`, `up-prod`, `logs-prod`, `backup-db`.
- Compose overlay: production services, healthchecks, volumes.
- Keep prod environment free of dev-only middleware unless explicitly enabled.

Acceptance criteria:
- `make build-prod && make up-prod` starts a working prod stack locally.

## Prompt 16 — Dev Ergonomics: EditorConfig, Attributes, Hooks

Add `.editorconfig` and `.gitattributes` to enforce text encoding and line endings; optionally wire pre-commit hooks that run existing formatters/linters.

Requirements:
- `.editorconfig`: UTF-8, LF (or repo standard), final newline; indent rules for py/ts/tsx.
- `.gitattributes`: `* text=auto` and normalize for common code/text files.
- Pre-commit (optional): use existing tools only; do not introduce heavy new dependencies unless already in the repo.

Acceptance criteria:
- New files present; line ending/encoding normalization verified by a small commit.
