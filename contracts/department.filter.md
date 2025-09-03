# Department Filter Contract

Purpose: Define a non-breaking, consistent contract for a global Department filter used across the application. This contract specifies frontend state and persistence, URL semantics, and backend query parameters and behavior.

Complies with: prompts/R2-REBUILD-STANDARDS.md

Status: Draft (v1)

---

## Scope

- Introduce a single global selection representing the active Department and an option to include sub-departments.
- Persist the selection across navigation and reloads; support deep links via URL parameters.
- Apply the filter consistently across the following read operations without changing response shapes:
  - People list
  - Assignments list
  - People workload_forecast
  - People capacity_heatmap

Out of scope for this version: server-side persisted defaults, role-based visibility rules (see Security note).

---

## Frontend State Contract

State shape (TypeScript):

```ts
type DepartmentFilterState = {
  selectedDepartmentId: number | null; // null means "All departments" (no filter)
  includeChildren: boolean; // whether to include sub-departments
};
```

Persistence (localStorage):

- Keys
  - `deptFilter.selectedId`: stringified number or empty for null
  - `deptFilter.includeChildren`: "1" | "0"
- Behavior
  - On first load, URL takes precedence over localStorage if present (see URL semantics below).
  - Subsequent user-initiated changes write through to both localStorage and URL.

URL parameters (deep links):

- Query parameters
  - `dept=ID` where ID is a positive integer
  - `deptChildren=0|1`
- Precedence and lifecycle
  - On initial load: if any of `dept` or `deptChildren` is present, initialize state from URL and overwrite localStorage.
  - Thereafter, the store is the source of truth; reflect changes to the URL using `history.replaceState` (do not push a new entry).
  - Use an `initializing` guard to avoid URL<->store echo loops. Initialization from URL occurs once per page load.
- Serialization
  - When clearing the filter (All departments): remove both `dept` and `deptChildren` from the URL and clear localStorage keys.
  - When `includeChildren` is false, still serialize `deptChildren=0` if `dept` is present to keep links explicit.

Change propagation:

- The global store emits changes; pages subscribe via a hook (e.g., `useDepartmentFilter`) and should re-run queries accordingly.
- Pages must include the filter in query keys or invalidate queries on changes to avoid stale results.

Accessibility and UX (summary; see UI prompt for details):

- The UI must follow ARIA combobox patterns, provide keyboard access (Home/End, PageUp/Down, type-to-select, Esc to clear when empty), `aria-describedby` for include-children help, and respect `prefers-reduced-motion`.

---

## Backend Contract

Query parameters (snake_case):

- `department=<id>`: optional; integer department primary key. When missing or invalid, do not apply department filtering.
- `include_children=0|1`: optional; defaults to `0` (false). Accepts string or integer values; treat any non-`1` as false.

Semantics:

- If `department` is provided and valid:
  - Filter People by `person.department_id = department`.
  - If `include_children` is truthy and hierarchy support exists, also include all descendants of the department.
  - If hierarchy traversal is not implemented, safely ignore `include_children` without error (documented behavior).
- Assignments list should filter by the related person’s department using `select_related('person__department')`.
- Forecast and heatmap endpoints should scope the base People queryset before aggregation, to ensure counts align with filtered sets.

Supported endpoints (read-only; response shapes unchanged):

- `GET /api/people/`
- `GET /api/assignments/`
- `GET /api/people/workload_forecast/`
- `GET /api/people/capacity_heatmap/`

Performance guidance:

- Avoid N+1 queries via `select_related('department')` and `prefetch_related` where applicable.
- Ensure useful indexes on `people(department_id)` and `assignments(person_id)`; consider composite or covering indexes per query patterns.

Non-breaking guarantee:

- All parameters are optional. If omitted or invalid, endpoints return their existing, unfiltered results. No response shape changes.

---

## Validation and Error Handling

- Invalid `department` (non-integer or non-existent): treat as not provided; do not error; return unfiltered results.
- `include_children` accepts `1` or `0` (string or int). Default to `0` when missing or invalid.
- Do not leak data for unauthorized departments; if authorization applies, return only permitted records (policy enforced outside this contract).

---

## Examples

Frontend URL examples:

```text
/reports/team-forecast?dept=3&deptChildren=1
/assignments?dept=12&deptChildren=0
```

People list (filtered):

Request

```http
GET /api/people/?department=3&include_children=1
```

Response (shape unchanged; example abbreviated)

```json
[
  { "id": 101, "firstName": "Ada", "lastName": "Lovelace", "departmentId": 3 },
  { "id": 102, "firstName": "Grace", "lastName": "Hopper", "departmentId": 7 }
]
```

Assignments list (filtered):

Request

```http
GET /api/assignments/?department=3&include_children=0
```

Response (abbreviated)

```json
[
  { "id": 555, "personId": 101, "projectId": 42, "hours": 20 },
  { "id": 556, "personId": 103, "projectId": 42, "hours": 15 }
]
```

Workload forecast (filtered):

Request

```http
GET /api/people/workload_forecast/?department=3&include_children=0
```

Response (shape unchanged; example abbreviated)

```json
[
  { "week": "2025-09-01", "capacity": 160, "allocated": 120, "available": 40 },
  { "week": "2025-09-08", "capacity": 160, "allocated": 110, "available": 50 }
]
```

Capacity heatmap (filtered):

Request

```http
GET /api/people/capacity_heatmap/?department=3&include_children=1
```

Response (abbreviated)

```json
{
  "weeks": ["2025-09-01", "2025-09-08"],
  "people": [
    { "personId": 101, "values": [0.75, 0.68] },
    { "personId": 102, "values": [0.80, 0.77] }
  ]
}
```

---

## Param Mapping Helper (Frontend)

To keep mapping consistent, clients should use a single helper to translate UI state to backend params:

```ts
function buildDeptParams(state: DepartmentFilterState): {
  department?: number;
  include_children?: 0 | 1;
} {
  const params: { department?: number; include_children?: 0 | 1 } = {};
  if (state.selectedDepartmentId != null) {
    params.department = state.selectedDepartmentId;
    params.include_children = state.includeChildren ? 1 : 0;
  }
  return params;
}
```

Notes:

- Only include params when a department is selected; keep URLs clean when unfiltered.
- Frontend URL param names differ intentionally (`dept`, `deptChildren`) to match UI semantics; backend remains snake_case.

---

## Acceptance Criteria

- This file documents:
  - Frontend state, persistence keys, URL parameters, precedence, and lifecycle.
  - Backend query parameters, semantics, endpoints, performance notes, and non-breaking guarantees.
  - Validation behavior for invalid/missing params.
  - Example requests/responses illustrating filters applied.
- Naming follows standards: backend snake_case; API/TS shapes in camelCase where appropriate.
