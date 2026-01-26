# UI Page Snapshot Plan (Assignments + Project Assignments)

## Goal
Reduce redundant API calls and first-load latency by adding page-level snapshot endpoints that return all data needed for initial render. Use one request per page to hydrate client caches/state.

## Scope
- Assignments pages (Assignment Grid + Project Assignments Grid) only.

## Non-Goals
- Changing data models.
- Replacing fine-grained refresh signals for mutations (keep refresh buses/targeted updates).
- Server-side pagination changes unless required by snapshot payload size.

---

## 1) Assignments Page Snapshot (Assignment Grid + Project Assignments Grid)

### Backend
Add endpoint:
- `GET /ui/assignments-page/`

Payload (suggested):
- `assignmentGridSnapshot`: same shape as `/assignments/grid_snapshot/`
- `projectGridSnapshot`: same shape as `/assignments/project_grid_snapshot/` (weeks + projects + hours)
- `projects`: minimal (id, name, client, status)
- `people`: minimal (id, name, department, weeklyCapacity)
- `departments`
- `projectRolesByDepartment`
- `capabilities`
- `utilizationScheme`

Notes:
- If payload is too large, allow `weeks` param to scope snapshots:
  - `/ui/assignments-page/?weeks=12&department=...`
- Default `weeks` server-side (e.g., 12) when omitted.

### Frontend
Add bootstrap hook:
- `useAssignmentsPageSnapshot({ weeks, department, includeChildren })`

Responsibilities:
- Fetch once on page mount (or when weeks/department changes).
- Seed React Query caches used by AssignmentGrid + ProjectAssignmentsGrid.
- Wire both grids to read from React Query (single source of truth).
- Replace independent calls to:
  - `/assignments/grid_snapshot/`
  - `/assignments/project_grid_snapshot/`
  - `/departments/`
  - `/project-roles/`
  - `/capabilities`
  - `/utilization_scheme`

Implementation notes:
- Replace direct service calls in both grids with `useQuery` hooks keyed by weeks/department.
- Populate those queries from the snapshot payload to avoid a second fetch.
- Keep mutation refresh signals; refetch relevant queries on events.
- Add a shared roles cache and prefill from snapshot:
  - `primeRolesCache(snapshot.projectRolesByDepartment)`
  - `getRolesForDept(deptId)` reads cache first, then fetches if missing.
- Ensure snapshot accepts and applies `department` + `include_children` consistently for *both* grid snapshots.
- Always pass `weeks`, `department`, `include_children` from the grid state to the snapshot call.
- Cache shape guardrails:
  - When seeding `useInfiniteQuery` caches (people/projects), use `{ pages, pageParams }` shape.
- Hydration gate:
  - Set `snapshotHydrated` so grids don’t fire their own loaders before snapshot data is ready.

### Validation
- Assignment Grid loads with one snapshot request.
- Project Assignments Grid loads with one snapshot request.
- No duplicated snapshot calls during initial render.
- Mutations still trigger targeted refresh events (no full reload on every edit).

---

## 2) Rollout Steps
1) Backend: add `/ui/assignments-page/` (include minimal payload + tests).
2) Frontend: Assignments pages bootstrap + cache seeding; remove duplicate fetches.
3) Verify mutation refresh paths still work.

---

## 3) Risks + Mitigations
- Large payloads: keep minimal fields; optionally add `?summary=1` and `?weeks=12`.
- Stale data: keep existing refresh buses; allow manual refetch per section.
- Cache mismatch: ensure snapshot data shape matches existing hooks.
- Role fetch storms: avoid repeated `/project-roles?department=...` via shared roles cache.
- Param drift: enforce consistent weeks/department/include_children across snapshot + grids.

---

## 4) Tests (Manual)
- Assignments page: single network call; verify grids render data.
- After edits: updates visible without full refresh.
