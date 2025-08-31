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
```

## Minimal QA Script

```text
1) Create deliverable with date; assign two people via DeliverableAssignments.
2) Verify calendar shows the milestone with assignmentCount.
3) Open heatmap and see 12-week rows per person; colors reflect utilization tiers.
4) Open rebalancer suggestions; apply one manually and recheck conflicts via existing `check_conflicts`.
5) Load team forecast (8 weeks) and scan for weeks over 100%.
6) Force an API error; confirm structured error and log entry with requestId.
```

## Notes

- We intentionally reuse Deliverable as the milestone model to avoid duplicate concepts. The new DeliverableAssignment mirrors `Assignment.weekly_hours` conventions to keep calculations consistent with the rest of the system.
