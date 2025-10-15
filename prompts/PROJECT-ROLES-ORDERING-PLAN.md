# Project Roles — Ordering & UI Reorder Plan

Goal: Allow admins to define the order of Project Roles in Settings using a drag handle (3‑line grabber), persist that order, and reflect it across all role dropdowns and the Projects page. On Projects → Details, list people within each department group ordered by project role (as defined in Settings) and then alphabetically by person name.

Effort: Moderate. Backend already has departmental roles with `sort_order` and list/update APIs. Main work is: add a small, robust reorder UI in Settings, provide a bulk reorder endpoint for atomic saves, fix ETag ordering sensitivity, and apply ordering consistently in consumers (dropdowns already sorted; Projects page needs a sort). Includes a data backfill to ensure stable sort for legacy rows using spaced values to reduce churn on later inserts.

Non‑Goals: Changing role semantics, permissions, or non‑department role scope.

Key Facts From Repo (as of this plan)
- Backend model for departmental Project Roles exists: `backend/projects/models.py:ProjectRole` with `sort_order` and `is_active`.
- List endpoint already orders by `-is_active, sort_order, name` via selector: `backend/projects/roles_selectors.py`.
- Update endpoint accepts `sortOrder`: `backend/projects/views_roles.py` and serializer in `roles_serializers.py`.
- Frontend role APIs/hooks exist: `frontend/src/roles/api.ts`, `frontend/src/roles/hooks/useProjectRoles.ts`.
- Settings page has a Department Project Roles section: `frontend/src/components/settings/DepartmentProjectRolesSection.tsx` (no drag‑reorder yet).
- Deliverables already implement a grab‑handle reorder UI we can mirror.
 - Projects → Details currently sorts assignments by person name in the data hook; we will re‑sort in the panel component using role order then name.

Principles
- Lean programming: minimal, cohesive changes; remove duplication; follow existing patterns.
- No quick fixes. Avoid hacky client‑only ordering; persist in DB.
- Backend and frontend changes must be coordinated and versioned to avoid mismatches.
- Accessible UI: keyboard and screen‑reader friendly interactions.
 - Cache correctness: server responses must reflect ordering changes via ETag/Last‑Modified so clients refresh reliably.

---

## Phase 0 — Discovery & Validation

Step 0.1 — Confirm current roles model and endpoints
- Prompt:
  - Inspect `backend/projects/models.py:ProjectRole` for `sort_order` and departmental scoping.
  - Verify list/update endpoints in `backend/projects/views_roles.py` and `roles_selectors.py` order by `sort_order`.
  - Confirm frontend uses `frontend/src/roles/api.ts` + `useProjectRoles` and receives ordered data. Do not change behavior yet.

Step 0.2 — Inventory all consumers
- Prompt:
  - Find all Role dropdown consumers: `RoleDropdown`, Assignments grid cells, Projects → Details add/edit flows.
  - Note whether they sort locally; if so, remove local sorting and rely on API order.
  - Identify Projects → Details component where assignment display order must be updated.

Step 0.3 — Routing and caching preflight
- Prompt:
  - Confirm backend routes in `backend/projects/urls_roles.py`. Plan to place `project-roles/reorder/` BEFORE `project-roles/<int:id>/` to avoid path shadowing.
  - Inspect ETag computation in `backend/projects/views_roles.py` list GET. Plan an update so order changes bust caches (hash must include order, not only ids).

---

## Phase 1 — Data Reliability (Backfill + Constraints)

Step 1.1 — Data backfill migration for `sort_order`
- Prompt:
  - Add a data migration in `backend/projects/migrations` that, for each department, seeds `sort_order` using spaced values (10, 20, 30, …) by alphabetical name.
  - If ALL roles in a department have `sort_order = 0`, seed all.
  - If SOME roles have non‑zero values, DO NOT overwrite those; only assign spaced values to zeros appended after the highest existing order to preserve prior curation.
  - Ensure idempotency and no downtime (wrap in transaction; guard so re‑running is a no‑op).
  - Tests: load fixtures or create sample roles and assert `sort_order` becomes deterministic alphabetical order after migration.

Step 1.2 — Enforce stable ordering contract
- Prompt:
  - Confirm `ProjectRole.Meta.ordering = ['department_id', 'sort_order', 'name']` remains.
  - Ensure selector `list_roles_by_department` returns `-is_active, sort_order, name` (active first, then order, then name). Keep this contract documented.

---

## Phase 2 — Backend: Bulk Reorder Endpoint

Rationale: PATCHing many roles individually is chatty and non‑atomic. Provide a single endpoint to apply an ordered list safely.

Step 2.1 — API design and implementation
- Prompt:
  - Add `POST /projects/project-roles/reorder/` accepting `{ department: number, order: Array<{ id: number, sortOrder: number }> }` (camelCase to match existing writers).
  - Permissions: Admin‑only (match Detail PATCH policy).
  - Validate: department exists; all ids belong to the department; ids are unique; `sortOrder` are integers.
  - Normalize: server may coerce posted orders to spaced values (e.g., multiples of 10). Always return normalized values.
  - Apply inside a transaction; update only changed rows; bump `updated_at`.
  - Audit log: record actor, department, count of changes, and a compact diff.
  - Return the updated ordered list via `ProjectRoleItemSerializer` (same shape as list).

Step 2.2 — Wire URLs and docs
- Prompt:
  - Add route in `backend/projects/urls_roles.py` and import in `backend/projects/urls.py`.
  - Ensure route order: `project-roles/reorder/` comes BEFORE `project-roles/<int:id>/` to prevent path shadowing.
  - Add OpenAPI annotations via `drf_spectacular` with request/response schemas.
  - Unit tests: success path, invalid department, cross‑department id, duplicate ids, partial subset update.

Step 2.3 — ETag/Last‑Modified correctness for ordering
- Prompt:
  - In list GET, compute the ETag using a stable representation that includes order, e.g., `md5(','.join(f"{id}:{sort_order}:{1 if is_active else 0}") )`.
  - Keep Last‑Modified based on max(updated_at) as today, but verify it changes on reorder.
  - Add unit tests where order changes but membership does not; verify 200 (not 304) and new ETag.

---

## Phase 3 — Frontend: Settings UI Reorder

Step 3.1 — UI/UX design using existing patterns
- Prompt:
  - In `DepartmentProjectRolesSection.tsx`, replace the static list with a draggable list modeled on `DeliverablesSection` DnD (HTML5 drag events + small “three‑line” grabber).
  - Add keyboard support: Up/Down arrow to move selected item; Enter toggles grab state; ESC cancels.
  - Visuals: `bg-[var(--surface)]` row, subtle hover, grab cursor, focus ring. Keep it lightweight and matching current design system.
  - Default scope: reorder only ACTIVE roles. Either separate Inactive roles visually below (non‑draggable) or expose an “Include inactive” toggle that reorders all.

Step 3.2 — State and persistence
- Prompt:
  - Maintain a local ordered array of roles. On drag/drop or keyboard re‑order, update local order.
  - Add a “Save Order” button that calls new `rolesApi.reorder(departmentId, order)`; disable while pending and when there are no local changes.
  - Add a “Discard Changes” action to reset to server order.
  - On success: invalidate React Query cache for `['projectRoles', departmentId]` and show toast.
  - On failure: revert local state and show error toast.

Step 3.3 — API client additions
- Prompt:
  - Add `reorderProjectRoles(departmentId: number, order: Array<{ id: number; sortOrder: number }>)` to `frontend/src/roles/api.ts`.
  - Add a small `useReorderProjectRoles` mutation in `frontend/src/roles/hooks/useProjectRoles.ts` for cache invalidation reuse.
  - Invalidate both `['projectRoles']` and `['projectRoles', departmentId]` to refresh all consumers.

Step 3.4 — Accessibility
- Prompt:
  - Add ARIA attributes for draggable list and items; expose position (e.g., `aria-posinset`, `aria-setsize`).
  - Ensure focus is managed: after save, return focus to the list; on cancel, restore prior focus.

Step 3.5 — Capability flag fallback
- Prompt:
  - Respect a capability/feature flag (e.g., `caps.data.projectRolesByDepartment && caps.data.projectRolesReorder`) from the backend. If unavailable, render read‑only list and hide Save.

---

## Phase 4 — Consumers: Ordering Everywhere

Step 4.1 — Role dropdowns
- Prompt:
  - Audit `RoleDropdown` and all call sites. Remove any local sorts; rely entirely on API order.
  - Ensure React Query invalidation after reordering causes dropdowns to re‑render in updated order.

Step 4.2 — Projects → Details: assignment ordering
- Prompt:
  - Implement deterministic ordering of assignments within each department group: first by project role order (as per Settings), then by person name.
  - Create a hook `useDeptRoleOrderMap(deptIds: number[])` that loads roles (using existing list endpoint per department) and returns a map `{ [deptId]: { [roleId]: sortOrder, byName: { [normalizedName]: sortOrder } } }`.
  - Use the map inside `ProjectDetailsPanel.tsx` to `sort` items with comparator:
    - Primary key: `roleSort = roleId ? map[deptId][roleId] : map[deptId].byName[normalize(roleName)]`.
    - Unknown/missing roles: place last via `roleSort ?? LARGE_NUMBER`.
    - Secondary key: case‑insensitive `personName`.
  - While role maps are loading, render current order and re‑sort when ready (avoid blocking UI and minimize flicker).
  - Batch and de‑dupe department fetches via React Query; only fetch distinct dept ids.

---

## Phase 5 — Testing

Step 5.1 — Backend unit tests
- Prompt:
  - Reorder endpoint: valid reorder, duplicate ids, mixed departments, missing ids, permission required, no‑op when order unchanged.
  - Migration tests: all‑zero department, mixed zero/non‑zero department, idempotency.
  - ETag tests: same membership but changed order must yield new ETag and 200 response; unchanged order should allow 304.

Step 5.2 — Frontend unit tests
- Prompt:
  - Component tests for the settings reorder list: drag event simulation yields correct local order; Save calls API with expected payload.
  - Hook tests for `useDeptRoleOrderMap` given mocked API.
  - Dropdown respects incoming order (snapshot or DOM order assertions).
  - Project Details comparator: ensure role order takes precedence over name; unknown roles sorted last; stable tie‑breaks by name.
  - Query invalidation: confirm that saving reorder invalidates dropdown data and re‑renders with new order.

Step 5.3 — Integration manual checks (agent‑scriptable)
- Prompt:
  - Script: create 3 roles A/B/C; reorder to C/A/B; verify Settings list reflects new order; open a Role dropdown → verify order; open Project Details → verify assignment order by role then name.
  - Verify cache invalidation paths: reordering in Settings immediately updates dropdowns on next open.
  - Verify inactive roles are shown as non‑draggable (or behind the toggle) and do not interfere with active ordering.

---

## Phase 6 — Rollout & Ops

Step 6.1 — Migration and deploy
- Prompt:
  - Ensure migrations are generated and applied. Provide a one‑time admin command to print a summary of departments with all‑zero `sort_order` for audit.
  - Document the new endpoint in the API docs.

Step 6.2 — Metrics and logs
- Prompt:
  - Log reorder actions (admin audit) with department id and count of roles changed.
  - Add simple client‑side performance trace around reorder Save for visibility.
  - Monitor list GET cache hit ratio and confirm ETag changes occur on reorders.

---

## Phase 7 — Contingencies

Step 7.1 — Backward compatibility
- Prompt:
  - If the frontend with reorder UI deploys before the backend endpoint, hide the Save button behind a capability flag fetched from `/capabilities/` or feature toggle; fall back to list‑only view. Continue to show server order and prevent local reordering to avoid drift.

Step 7.2 — Failure modes
- Prompt:
  - If `reorder` fails, keep user’s local order intact and display a non‑dismissive error; offer “Retry” and “Discard Changes”.
  - If ETag/If‑None‑Match handling causes stale order, force a cache bypass on next fetch (e.g., add a `cacheBust` query param once) and log a warning.

---

## Appendix — Example Prompts for Implementation Steps

Use these as copy‑paste prompts to drive the AI‑Agent through each step without ambiguity.

1) “Backend: add bulk reorder endpoint”
- Implement `POST /projects/project-roles/reorder/` in `backend/projects/views_roles.py` with payload `{ department: number, order: Array<{ id: number, sortOrder: number }>} `. Validate department/id ownership, enforce atomic transaction, update only changed rows. Return updated ordered list using `ProjectRoleItemSerializer`. Add URL in `urls_roles.py`, register in `urls.py`, and OpenAPI annotations. Add unit tests for success and edge cases.
 - Ensure route order: add `project-roles/reorder/` BEFORE `project-roles/<int:id>/`.
 - ETag: update list GET ETag to include order and active flag; add tests to prevent 304 on order change.

2) “Backend: data migration to seed sort_order”
- Add a data migration that, per department, seeds `sort_order` to spaced values (10,20,30,…) by alphabetical order when all are zero; if some are non‑zero, fill zeros at the end without changing existing non‑zero values. Make it idempotent and transactional. Add tests for mixed cases.

3) “Frontend: Settings reorder UI”
- In `DepartmentProjectRolesSection.tsx`, replace the static mapped list with a draggable list modeled on `DeliverablesSection` grab‑handle. Keep visuals consistent with settings cards. Implement keyboard reordering. Add ‘Save Order’ calling a new `reorderProjectRoles` client method. Invalidate queries on success.
 - Separate inactive roles (non‑draggable) or allow an “Include inactive” toggle to reorder all consistently with the backend ordering contract.
 - Add a ‘Discard Changes’ action and disable Save when no local changes.

4) “Frontend: add roles API client”
- In `frontend/src/roles/api.ts`, add `export async function reorderProjectRoles(departmentId, order)`. In `useProjectRoles.ts`, add a `useReorderProjectRoles` mutation that invalidates `['projectRoles', departmentId]`.
 - Invalidate both global and department‑keyed caches so dropdowns across the app refresh.

5) “Consumers: remove local sorts; rely on backend order”
- Audit `RoleDropdown` and related call sites in Assignments and Projects pages. Remove any local sort calls so the UI matches backend order exactly.

6) “Projects → Details: sort assignments by role order then name”
- Create `useDeptRoleOrderMap(deptIds: number[])` that returns `{ byId: { [deptId]: { [roleId]: sortOrder } }, byName: { [deptId]: { [normalizedName]: sortOrder } } }`. Use it in `ProjectDetailsPanel.tsx` to sort each department’s `items` by `(roleSort || nameSortFallback || LARGE_NUMBER, personNameLower)`. Write unit tests for null/unknown roles.

7) “Testing: run full pass”
- Backend unit tests (new endpoint + migration), frontend tests (UI reorder, hook, dropdown order). Manual script to reorder roles and verify dropdowns and Projects page ordering. Ensure no regressions in existing role creation/deletion.

Done when:
- Settings page supports drag‑reorder with visible Save and it persists.
- Role dropdown order matches Settings across the app.
- Projects → Details lists people by role order then name.
