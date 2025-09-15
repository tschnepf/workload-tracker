# R2-REBUILD — Assignments Page: “Active or With Hours” Filter (Agent-Ready, Sequential Prompts)

Purpose: Add an opt-in filter on the Assignments page to only show projects that are either marked active or have any hours assigned. Apply it to (a) the project search picker when adding assignments and (b) the rendered assignment rows (optional), without breaking existing behaviors.

Key Standards to Honor (Do Not Deviate):

- Backend models/DB: snake_case. API: camelCase via DRF serializers with source mapping.
- UI: use tokens from `frontend/src/theme/tokens.ts` or Tailwind + dark theme variables already adopted by the page. No new hardcoded hex outside existing palette.
- Performance: avoid N+1; reuse bulk endpoints; coalesce duplicate fetches via the API layer.
- Tests/QA: add a small manual QA checklist and minimal utility validation (where practical).
- Safety gates: tsc must pass; run affected backend tests; do not change response shapes.

---

Critical Safety Checks (Run on Every Prompt Before/After):

```bash
# Health
docker-compose ps
curl -s http://localhost:8000/api/health/ | grep "healthy"

# Frontend gates (MANDATORY after code changes)
docker exec workload-tracker-frontend npx tsc --noEmit

# Backend gates (only if backend touched)
docker exec workload-tracker-backend python manage.py test people assignments --noinput -v 2
```
If a check fails, STOP and fix at the correct layer.

---

## Prompt 1 — Contract and Semantics

Define the filter’s behavior and scope. Update `contracts` if needed.

Requirements:
- Name: “Projects: Active or with hours” (short label acceptable in UI).
- Semantics (frontend baseline): project passes if `project.isActive == true` OR `project.status in {active, active_ca}` OR sum of all assignments’ `weeklyHours` for that project > 0.
- Scope of application:
  - Project search dropdown when adding a new assignment (must hide projects that don’t pass).
  - Optional: Hide rendered assignment rows for projects that don’t pass AND have zero hours, to reduce clutter.
- Persistence: localStorage key `assignments.onlyActiveOrWithHours` storing `"1"|"0"`.
- Interop: Works alongside the Global Department Filter; operate on the already department-filtered data in memory.

Acceptance Criteria:
- A concise contract note exists in `contracts/` or captured inline in code comments.
- No ambiguity on what qualifies a project as “active or with hours.”

---

## Prompt 2 — Data Plumbing (Client-Only Baseline)

Compute the allowed project set from currently loaded data.

Requirements:
- File: `frontend/src/pages/Assignments/AssignmentGrid.tsx`.
- After loading `assignmentsData` and `projectsData`, build with error boundaries:

```typescript
// Error-bounded computation with explicit null/undefined handling
const computeAllowedProjects = useMemo(() => {
  try {
    // Guard against missing data
    if (!assignmentsData?.length || !projectsData?.length) {
      return { projectHoursSum: new Map(), allowedProjectIds: new Set() };
    }

    const projectHoursSum = new Map<number, number>();
    const projectsWithHours = new Set<number>();
    const activeProjectIds = new Set<number>();

    // Build projectHoursSum with null/undefined safety
    assignmentsData.forEach(assignment => {
      // Skip assignments without valid project reference
      if (!assignment?.project || typeof assignment.project !== 'number') return;
      
      // Parse weeklyHours with null/undefined/string safety
      const hours = parseFloat(assignment.weeklyHours?.toString() || '0') || 0;
      
      const currentSum = projectHoursSum.get(assignment.project) || 0;
      projectHoursSum.set(assignment.project, currentSum + hours);
      
      if (hours > 0) {
        projectsWithHours.add(assignment.project);
      }
    });

    // Build activeProjectIds with null/undefined safety
    projectsData.forEach(project => {
      if (!project?.id) return;
      
      const isActive = project.isActive === true;
      const hasActiveStatus = ['active', 'active_ca'].includes(project.status?.toLowerCase() || '');
      
      if (isActive || hasActiveStatus) {
        activeProjectIds.add(project.id);
      }
    });

    // Union operation
    const allowedProjectIds = new Set([...projectsWithHours, ...activeProjectIds]);

    return { projectHoursSum, allowedProjectIds };
    
  } catch (error) {
    console.error('Error computing allowed projects:', error);
    // Return safe fallback - show all projects on error
    return { 
      projectHoursSum: new Map(), 
      allowedProjectIds: new Set(projectsData?.map(p => p?.id).filter(Boolean) || [])
    };
  }
}, [
  // Memoization dependencies (recompute when these change):
  assignmentsData,           // Assignment data array
  projectsData,             // Project data array
  // Note: Department filter state not needed here as data is pre-filtered
]);
```

- Store `allowedProjectIds` from the memoized result.

Acceptance Criteria:
- No change to network calls; derived sets computed reliably after data load.
- Works with department-filtered inputs (i.e., respects global filter naturally).
- Graceful handling of null/undefined/malformed data without crashes.
- Error boundary returns safe fallback (all projects visible on computation error).

---

## Prompt 3 — UI Toggle (Accessible, Persistent)

Add the toggle to the Assignments header.

Requirements:
- File: `frontend/src/pages/Assignments/AssignmentGrid.tsx`.
- State: `onlyActiveOrWithHours: boolean` (default from localStorage `assignments.onlyActiveOrWithHours`).
- UI: Checkbox with label “Projects: Active or with hours” in the sticky header area, right-aligned near counts.
- Accessibility: associate label via `htmlFor`; keyboard accessible; announce state change via existing toast or polite text when feasible.
- Persistence: write-through on change.

Acceptance Criteria:
- Toggling updates state and persists to localStorage; no console errors.

---

## Prompt 4 — Apply Filter to Project Search (Add-Assignment)

Constrain the dropdown results while searching for a project.

Requirements:
- File: `frontend/src/pages/Assignments/AssignmentGrid.tsx`.
- In `searchProjects`, with null/undefined safety:

```typescript
const searchProjects = (query: string) => {
  try {
    if (!projectsData?.length) return [];
    
    let results = projectsData.filter(project => {
      // Null/undefined safety for project properties
      const name = project?.name?.toLowerCase() || '';
      const client = project?.client?.toLowerCase() || '';
      const searchQuery = query?.toLowerCase() || '';
      
      return name.includes(searchQuery) || client.includes(searchQuery);
    });
    
    // Apply active/hours filter with null safety
    if (onlyActiveOrWithHours && allowedProjectIds) {
      results = results.filter(project => 
        project?.id && allowedProjectIds.has(project.id)
      );
    }
    
    return results;
  } catch (error) {
    console.error('Error in searchProjects:', error);
    return []; // Safe fallback
  }
};
```

- Optional UX: When a user's query yields 0 results due to the toggle, show a small inline hint: "No matches under current filter."

Acceptance Criteria:
- With toggle ON, dropdown only shows active/with-hours projects; OFF shows all matching projects.
- Graceful handling of null/undefined project properties and missing allowedProjectIds.

---

## Prompt 5 — Apply Filter to Rendered Rows (Optional but Recommended)

Reduce visual clutter by hiding zero-hour inactive projects in the grid.

Requirements:
- File: `frontend/src/pages/Assignments/AssignmentGrid.tsx`.
- When mapping `person.assignments`, with comprehensive null/undefined handling:

```typescript
const getVisibleAssignments = (assignments: Assignment[]) => {
  try {
    if (!assignments?.length) return [];
    
    return assignments.filter(assignment => {
      // Always show if toggle is OFF
      if (!onlyActiveOrWithHours) return true;
      
      // Null/undefined safety for assignment properties
      const projectId = assignment?.project;
      const weeklyHours = parseFloat(assignment?.weeklyHours?.toString() || '0') || 0;
      
      // Show if has hours (even with missing/invalid project reference)
      if (weeklyHours > 0) return true;
      
      // Show if project is in allowed set (with null safety)
      if (projectId && allowedProjectIds?.has(projectId)) return true;
      
      // Hide zero-hour assignments for non-allowed projects
      return false;
    });
  } catch (error) {
    console.error('Error filtering assignments:', error);
    return assignments || []; // Safe fallback - show all on error
  }
};
```

- Totals: compute displayed per-person totals using the same filtered set for visual consistency, with null safety:

```typescript
const calculatePersonTotal = (assignments: Assignment[]) => {
  try {
    const visibleAssignments = getVisibleAssignments(assignments);
    return visibleAssignments.reduce((sum, assignment) => {
      const hours = parseFloat(assignment?.weeklyHours?.toString() || '0') || 0;
      return sum + hours;
    }, 0);
  } catch (error) {
    console.error('Error calculating person total:', error);
    return 0; // Safe fallback
  }
};
```

Acceptance Criteria:
- With toggle ON, irrelevant rows disappear; totals reflect visible rows; performance remains acceptable.
- Graceful handling of malformed assignment data (null projects, invalid hours).
- Error boundaries prevent crashes from data inconsistencies.

---

## Prompt 6 — QA and Minimal Validation

Add a QA checklist and light validation with dual-filter integration tests.

Requirements:
- Docs: `prompts/R2-REBUILD-ASSIGNMENTS-ACTIVE-OR-WITH-HOURS-QA.md` with manual steps:
  1) Toggle ON: project search narrows; grid hides zero-hour inactive rows.
  2) Toggle OFF: all projects/rows return.
  3) **Dual-filter integration testing:**
     - Department filter + Active/Hours filter both ON: verify intersection behavior
     - Department filter changes while Active/Hours ON: verify re-computation
     - Active/Hours filter changes while Department filter ON: verify preserved scope
     - Both filters OFF: verify all data visible
  4) Persistence across reloads.
  5) **Error resilience testing:**
     - Test with malformed assignment data (null projects, invalid hours)
     - Test with empty datasets
     - Verify graceful fallbacks without crashes

- **Integration test utility** (in dev file): 
```typescript
// Test dual-filter interaction scenarios
const testDualFilterScenarios = () => {
  const mockAssignments = [
    { id: 1, project: 101, weeklyHours: '40', person: { department: { id: 1 }}},
    { id: 2, project: 102, weeklyHours: '0', person: { department: { id: 2 }}},
    { id: 3, project: null, weeklyHours: '20', person: { department: { id: 1 }}}, // malformed
  ];
  const mockProjects = [
    { id: 101, isActive: false, status: 'inactive' }, // has hours only
    { id: 102, isActive: true, status: 'active' },    // active only
    { id: 103, isActive: false, status: 'inactive' }, // neither (should be filtered)
  ];
  
  // Test scenarios...
  console.log('Dual filter integration tests passed');
};
```

Acceptance Criteria:
- QA doc exists with comprehensive dual-filter test scenarios.
- Integration test utility validates filter interaction behavior.
- Error resilience testing covers malformed data scenarios.

---

## Prompt 7 — Optional Backend Support (Future Efficiency)

If client-side computation becomes heavy, add server help.

Options:
1) Reuse `projectsApi.getFilterMetadata()` to return per-project totals (if not already populated).
2) Add `GET /assignments/?active_or_hours=1` for server-side filtering (ensure response shape unchanged). Document param handling.

Requirements (if pursued now):
- Maintain snake_case on backend params; keep pagination and `all=true` semantics consistent.
- Add DRF tests covering the new filter semantics (counts and default behavior).

Acceptance Criteria:
- Backend toggles do not break existing clients; tests pass.

---

## Prompt 8 — Performance and Docs Polish

Finalize performance and documentation.

Requirements:
- Confirm no additional N+1 introduced; keep `select_related('person','person__department','project')` on assignments.
- Leverage existing API in-memory GET coalescing to avoid duplicate fetches.
- README: add a short note in the Assignments section about the new toggle.

Acceptance Criteria:
- tsc OK; backend tests OK (if touched); README updated.

---

Appendix — Engineering Notes

- Keep logic side-effect free where possible; memoize allowed sets on stable inputs.
- **Null/Undefined Handling Policy:**
  - All user input (`weeklyHours`, search queries) should be coerced safely using `?.toString() || ''` and `parseFloat()` with fallbacks
  - All object property access should use optional chaining (`?.`) 
  - All array operations should guard against null/undefined arrays with `?.length` checks
  - Missing project FK references should not crash the filter - show assignment if it has hours
  - Error boundaries should always return safe fallbacks (empty arrays, zero totals, or all data visible)
- **Filter Interaction Policy:**
  - Department filter operates first (pre-filters data arrays)
  - Active/Hours filter operates on department-filtered results
  - Both filters OFF should show complete unfiltered dataset
  - Filter state changes should trigger memoized recomputation
- Defer backend changes unless necessary for scale.

End of Guide.
