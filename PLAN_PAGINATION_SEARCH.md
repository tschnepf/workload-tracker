# Server-Side Search + Pagination Plan (Assignments, Project Assignments, Projects, and Related Pages)

## Goals
- Preserve current UI behavior while making search/filters accurate and scalable.
- Move filtering, search, and sorting to the backend for large datasets.
- Keep responses bounded with pagination (page size clamp + stable ordering).
- Reuse existing endpoints where possible; add parameters rather than new routes unless needed.
- Keep existing snapshot endpoints for aggregates/headers.

## Guiding Principles
- **Correctness first**: never filter/search against partial client-side data.
- **Stable ordering**: consistent sort keys so pagination is deterministic.
- **Compatible APIs**: extend existing list endpoints with optional filter params.
- **Index-friendly queries**: avoid `LIKE '%term%'` for large datasets.
- **Parity with current UI**: replicate AND/OR/NOT token logic and special filters exactly.

---

# Shared Backend Work (Applies to All Pages)

## 1) Tokenized Search (Exact Parity)
- Accept `search_tokens` as **structured data** (avoid long query strings).
- Preferred: **POST** `/search` endpoints (e.g., `/assignments/search/`, `/projects/search/`, `/people/search/`) to accept JSON payloads.
- Backward compatibility: keep `q` for simple search and support `search_tokens` in query params for short payloads.
- **React Query caching**: use deterministic query keys with a hash of the POST payload.

**Token semantics must match current UI logic**
- Tokens: `{ term: string, op: 'or' | 'and' | 'not' }`.
- OR behavior: if any OR tokens exist, at least one OR must match.
- AND: all AND tokens must match.
- NOT: no NOT tokens may match.

**Search parity vs performance (explicit choice)**
- Default to **exact substring parity** with the current UI (like `includes`).
- Implement using **precomputed searchable fields + trigram index**, or `ILIKE` on precomputed fields if needed.
- Only introduce full-text search if it is versioned/flagged to avoid behavior drift.

**Code comment (backend query builder)**
```py
# Apply token logic exactly as client does:
# - NOT tokens exclude matches
# - AND tokens require all matches
# - OR tokens: if present, at least one must match
qs = apply_search_tokens_exact(qs, tokens)
```

## 2) Pagination + Ordering
- Enforce max `page_size` (e.g., 200) in API layer.
- Always include **stable tie-breakers** (append `id` to ordering).
- Document default ordering per endpoint.

**Code comment (pagination)**
```py
# Clamp page_size and enforce stable ordering to prevent duplicates/holes
page_size = min(requested_page_size, MAX_PAGE_SIZE)
qs = qs.order_by(*ordering_fields, 'id')
```

## 3) Searchable Fields (Explicit Parity)
Define fields per entity to match current UI behavior:
- **Assignments**: person name, role name, project name, client, project number, project description, assignment display name.
- **Projects**: name, client, project number, description, *assigned names* (must be supported server-side).
- **People**: name, role, department, location, notes.

## 4) Indexes / Search Strategy
- Use full-text or trigram indexes for name/client/description fields.
- Add compound indexes for common filters (department, status, project).

## 5) Derived / Computed Filters (Server Support)
- Project status filters currently depend on **deliverables + assignments**.
- Provide a backend **Project Filter Metadata** endpoint that returns:
  - `hasFutureDeliverables`, `assignmentCount`, `missingQa`, etc.
- Ensure this endpoint accepts **department + include_children** scope params.

**Code comment (project metadata)**
```py
# Precompute filter metadata so server-side filters
# match existing UI behavior (missing QA, active with dates, etc.)
metadata = build_project_filter_metadata(filters)
```

## 6) Snapshot Compatibility (Avoid Wrong Totals)
- Snapshot aggregates must **reflect filters** when used with filtered assignment views.
- To avoid cache explosion, compute **filtered totals in the assignments search response**,
  or use a short TTL + hash key when filters are active.

**Code comment (snapshot)**
```py
# When filters are active, return filtered totals in the
# search response so grid totals match visible rows
filtered_totals = compute_filtered_totals(...)
```

## 7) Assigned Names Search (Projects) — Recommended Approach
- Use **denormalized field + async rebuild queue** for scalability and correctness.
- Add `Project.assigned_names_text` with trigram/full-text index.
- On assignment/person changes, **enqueue** a rebuild of that project’s assigned names.
- Job recomputes from source of truth and updates `assigned_names_text`.
- Provide a **synchronous fallback** (best-effort) if async jobs are unavailable.

**Code comment (assigned names)**
```py
# Keep a precomputed searchable field for assigned names
# so project search doesn't need expensive joins
enqueue_assigned_names_rebuild(project_id)
```

## 8) Event Bus / Invalidation Strategy
- Replace local array mutation with **query invalidation by scope**.
- On assignment/person/project updates, invalidate affected queries (filtered scope + page).
- Default to refreshing the **current page** unless the update changes ordering.

**Code comment (invalidation)**
```ts
// Invalidate only the current page and filter scope to avoid refetch storms
queryClient.invalidateQueries({ queryKey: ['assignments-search', scopeHash, page] })
```

---

# API Contracts (Requests + Responses)

## Assignments Search (POST `/assignments/search/`)
**Request**
```json
{
  "page": 1,
  "page_size": 100,
  "department": 3,
  "include_children": 1,
  "status_in": "active,active_ca",
  "search_tokens": [
    { "term": "acme", "op": "and" },
    { "term": "qa", "op": "or" }
  ]
}
```
**Response**
```json
{
  "count": 245,
  "next": "...",
  "previous": null,
  "results": [ /* assignments page */ ],
  "people": [ /* active people matching person or assignment/project fields */ ],
  "assignment_counts_by_person": { "12": 4, "42": 1 },
  "people_match_reason": { "12": "assignment", "42": "person_name" },
  "filteredTotals": { "12": { "2026-02-02": 32 } }
}
```

## Projects Search (POST `/projects/search/`)
**Request**
```json
{
  "page": 1,
  "page_size": 100,
  "ordering": "client,name",
  "status_in": "active,active_ca",
  "search_tokens": [ { "term": "airport", "op": "and" } ]
}
```
**Response**
```json
{
  "count": 120,
  "next": "...",
  "previous": null,
  "results": [
    {
      "id": 1,
      "name": "Alpha",
      "client": "Acme",
      "projectNumber": "A-001",
      "nextDeliverableDate": "2026-02-12",
      "prevDeliverableDate": "2026-01-15"
    }
  ]
}
```

## People Search (POST `/people/search/`)
**Request**
```json
{
  "page": 1,
  "page_size": 100,
  "department": 3,
  "include_children": 1,
  "location": ["Remote"],
  "search_tokens": [ { "term": "alex", "op": "and" } ],
  "ordering": "name"
}
```
**Response**
```json
{
  "count": 56,
  "next": "...",
  "previous": null,
  "results": [ /* people page */ ]
}
```

## Project Filter Metadata (GET `/projects/filter-metadata/`)
**Request params**
```
status_in=active,active_ca
department=3
include_children=1
```
**Response**
```json
{
  "projectFilters": {
    "12": { "assignmentCount": 3, "hasFutureDeliverables": true, "missingQa": false }
  }
}
```

---

# Filter/Field Mapping (Parity Table)

| UI Search Context | Fields Included | Notes |
| --- | --- | --- |
| Assignments search | person.name, assignment.roleName, project.name, project.client, project.project_number, project.description | Exact substring parity |
| Projects search | project.name, project.client, project.project_number, project.description, project.assigned_names_text | assigned names is precomputed |
| People search | person.name, person.roleName, person.departmentName, person.location, person.notes | Remote and Unspecified semantics preserved |

---

# Ordering Specs (Parity Table)

| Page | Ordering | Tie-breaker |
| --- | --- | --- |
| Assignments grid (per person) | client → project name | assignment.id |
| Project assignments (per project) | department role order → person name | assignment.id |
| Projects list | client,name (default) or next/prev deliverable | project.id |
| People list | UI rule set (Remote/Unassigned/Unspecified) | person.id |

---

# Response Size Guardrails
- Max `page_size` = 200 (server enforced).
- Assignments search returns `people` + counts **only when filters active**.
- Snapshot remains unchanged when no filters; filtered totals live in search response.

---

# Event Invalidation Map

| Event | Queries to Invalidate |
| --- | --- |
| Assignment create/update/delete | assignments search (scope hash), project assignments page, project filter metadata |
| Project status change | projects search (scope hash), project filter metadata |
| Person update | people search (scope hash), assignments search (scope hash) |

---

# Migration Notes (Assigned Names)
1. Add `assigned_names_text` field + index.
2. Backfill by scanning assignments per project.
3. Enable async rebuild on assignment/person changes.
4. Enable synchronous fallback if async not available.

---

# Page Plans

## 1) Assignments Grid (`/assignments`)
### Current Issues
- Search tokens only apply to loaded assignments (expanded people or bulk refresh).
- Totals come from snapshot and don’t match filtered rows.
- People visibility can change based on assignment matches and person-name matches.

### Plan
1. **Backend**: Extend assignments search endpoint to return:
   - `assignments` (paged)
   - `people` matching **either person fields OR assignment/project fields**
   - `assignment_counts_by_person` for active filters (active-only people)
   - `filteredTotals` for hours/totals
   - `people_match_reason` map keyed by person id (`"person_name"` | `"assignment"` | `"both"`)
2. **Frontend**:
   - Use `people` + `assignment_counts_by_person` to render visible people when filters are active.
   - Use `people_match_reason` to show a small badge/tooltip for **person-name-only matches**.
   - Keep snapshot for week headers + base people list when no filters are active.
   - Replace client-side filtering with server-filtered paging.
3. **Selection & navigation**:
   - Reset selection when page changes (safe default).
   - Optional: auto-load next page when keyboard nav reaches last row to preserve continuous navigation.

### Implementation Notes (frontend pseudocode)
```ts
// Fetch filtered assignments + people match metadata in one request
const res = await assignmentsApi.search({
  page,
  page_size,
  department,
  include_children,
  status_in,
  search_tokens
})

// Use res.people + res.assignment_counts_by_person to compute visiblePeople
setVisiblePeople(res.people)
setAssignmentCounts(res.assignment_counts_by_person)

// Use match reasons to display a subtle badge for name-only matches
setPeopleMatchReason(res.people_match_reason)

// Use res.filteredTotals so totals match visible rows
setHoursByPerson(res.filteredTotals)
```

### Tests (Assignments Grid)
1. Search for a project/client that only appears under a collapsed person; verify it shows without expanding.
2. Search by person name only; verify person appears **with a “Matched by name” badge** even if no assignments match.
3. Add AND/OR/NOT tokens and confirm results match current client logic.
4. Toggle department filter and verify results are correct and paged.
5. Expand a person with many assignments; verify “Load more” works and ordering is stable.
6. Verify totals match filtered rows (no mismatch between totals and displayed assignments).

---

## 2) Project Assignments Grid (`/project-assignments`)
### Current Issues
- Snapshot provides all projects (unpaged).
- Search tokens are client-side and can miss matches.
- Per-project assignments are capped at 10k.

### Plan
1. **Backend**: Provide server-side project search + pagination.
2. **Frontend**:
   - Fetch projects from `/projects/` (paged) instead of relying on snapshot’s project list.
   - Keep snapshot for week headers + deliverables only (use `include=assignment` or `include=project` as needed).
3. **Assignments per project**:
   - Fetch via `/assignments/` with `project=...` + pagination.
   - Enforce server ordering that matches current UI (role/department → person name → id).
   - Remove 10k cap and replace with “Load more.”

### Implementation Notes (frontend pseudocode)
```ts
// Fetch paged projects using server filters
const projectsRes = await projectsApi.search({ page, page_size, ordering, search_tokens, status_in })

// Expand project: fetch assignments in pages (server-ordered)
const assignRes = await assignmentsApi.list({ project: projectId, page, page_size, include_placeholders, ordering })
```

### Tests (Project Assignments Grid)
1. Search for a project by client/name and verify results without pre-loading assignments.
2. Expand a project with many assignments; verify pagination continues past 10k.
3. Toggle status filters and confirm projects update correctly.
4. Ensure placeholder assignments appear only when include_placeholders is set.
5. Confirm keyboard navigation and selection still work across pages.

---

## 3) Projects List (`/projects`)
### Current Issues
- Client-side filtering/search only applies to loaded pages.
- Filter metadata + QA detection depends on bulk assignment loads.
- Sorting uses derived deliverable dates (next/prev) in the UI.

### Plan
1. **Backend**: Extend `/projects/` with status + search filters and stable ordering.
2. **Backend**: Add or extend **project filter metadata endpoint** to accept the same filters and scope params.
3. **Backend**: Support sorting by next/prev deliverable dates via indexed computed fields or materialized view,
   and return those computed dates in the list response for display.
4. **Frontend**:
   - Request projects via server filters (paged).
   - Use metadata endpoint instead of `listAll` for QA + deliverables flags.

### Implementation Notes (frontend pseudocode)
```ts
// Request filtered projects directly from server
const res = await projectsApi.search({ page, page_size, ordering, status_in, search_tokens })

// Request metadata for current filter scope
const meta = await projectsApi.filterMetadata({ status_in, search_tokens, department, include_children })
```

### Tests (Projects List)
1. Search for project by client/name/number; verify results are accurate across large lists.
2. Toggle status filters (Active, Missing QA, etc.) and confirm results match previous behavior.
3. Verify sorting remains stable when paginating, including next/prev deliverable sorting.
4. Confirm “Show All” still works and matches expected counts.

---

## 4) People List (`/people`)
### Current Issues
- Filters/search apply only to loaded pages.
- UI has special ordering rules (Remote, Unspecified, Unassigned).

### Plan
1. **Backend**: Extend `/people/` with search + department + location filters.
2. **Backend**: Implement ordering rules that match current UI (including Remote/Unspecified handling).
3. **Frontend**: Move filters to server and paginate results.

### Tests (People List)
1. Search for a person not on page 1; confirm they appear.
2. Filter by department/location and validate results.
3. Check sorting across pages is stable and matches UI rules.
4. Verify “Remote” and “Unspecified” semantics match current behavior.

---

## 5) Assignment Form (person/project selectors)
### Current Issues
- Only first 100 people/projects are loaded.
- People list is sorted by department + skills in the client.

### Plan
1. **Backend**: Provide a ranked people search endpoint that matches current sorting rules.
2. **Frontend**:
   - Use typeahead search backed by the server.
   - Optionally keep a small cached list for immediate display and use server search for out-of-range queries.

### Tests (Assignment Form)
1. Search for a person/project not in the first 100; confirm it appears.
2. Ensure department filter still applies when enabled.
3. Verify ordering matches current department + skills ranking.

---

## 6) Project Dashboard (assignments list)
### Current Issues
- Loads only first 200 assignments.

### Plan
1. **Frontend**: Add pagination controls for assignments list.
2. **Backend**: Ensure `/assignments/?project=...` supports paging + ordering.

### Tests (Project Dashboard)
1. Project with >200 assignments: ensure “Load more” appears.
2. Verify assignments ordering matches current UI.

---

## 7) Team Forecast (projects + deliverables)
### Current Issues
- Projects limited to first 200; deliverables limited to first 1000.

### Plan
1. **Backend**: Add paging to forecast-related project/deliverable calls.
2. **Frontend**: Use pagination or scoped filters to avoid truncation.

### Tests (Team Forecast)
1. Select a project beyond page 1; confirm it appears.
2. Verify deliverables list includes items beyond 1000 when paged.

---

## 8) Project Details Assignments Hook
### Current Issues
- Loops through all pages per project (expensive for large datasets).

### Plan
1. **Backend**: Add cursor pagination or page cap with “Load more.”
2. **Frontend**: Replace “fetch all pages” with paged fetch + UI “Load more.”

### Tests (Project Details)
1. Large project: verify it loads quickly and can page.
2. Confirm sorting by project role remains intact.

---

# Rollout Strategy (Suggested)
1. Add backend support for search tokens + pagination + metadata.
2. Update Assignments Grid first (highest risk of incorrect data).
3. Update Project Assignments Grid.
4. Update Projects List.
5. Roll forward remaining pages.
6. Remove `listAll` usage from UI once covered.

# Backend Test Checklist
- Token logic parity: AND/OR/NOT semantics match client.
- Ordering stability: repeated requests yield stable ordering with pagination.
- Filter metadata: missing QA and deliverable flags match current UI behavior.
- Assigned names: denormalized field updates on assignment/person changes.
- People search: Remote/Unspecified/Unassigned ordering parity.

