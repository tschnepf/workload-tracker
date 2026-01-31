# Mobile-Friendly Pagination + Search Plan

This plan covers mobile updates for Assignments and Project Assignments to align with
`PLAN_PAGINATION_SEARCH.md` (server-side search + pagination).

## Constraints (must match existing desktop + API schema)
- **Desktop behavior takes precedence.** Do not change desktop UI/state logic.
- **Backend changes allowed only if additive/opt-in** and **do not change desktop behavior**.
- **Mobile must conform to current API schema + ordering** (no new ordering params).
- **Keep shared hooks compatible.** Do not introduce async `search()` where a sync hook is required.

---

## Backend Status (as of now)
- **Assignments search** (`POST /assignments/search/`): tokenized search, pagination, people match metadata, filteredTotals implemented.
- **Projects search** (`POST /projects/search/`): tokenized search (including `assigned_names_text`), pagination, deliverable date ordering implemented.
- **People search** (`POST /people/search/`): tokenized search + ordering parity implemented.
- **Project filter metadata** (`GET /projects/filter-metadata/`): missing QA + future deliverables implemented.
- **Assignments list** (`GET /assignments/`): supports paging by `page` and filters like `person`/`project`,
  but **ignores `page_size`** (server returns default page size and still echoes `page_size` in `next`).
- **Assignments by person** (`GET /assignments/by_person/`): returns full list, **no pagination**.
- **Potential gap**: `/assignments/?project=...` ordering for per-project paging may not match desired
  role/department → person sort. Consider adding backend ordering param or server-side sort parity if needed.

---

## Mobile Plan: Assignments (`/assignments`)

### 1) Add mobile paging state (mobile-only, no desktop changes)
- Track per-person paging + loading state:
  - `assignmentPageByPerson`
  - `hasMoreAssignmentsByPerson`
  - `loadingMoreByPerson`
- Loader behavior (use existing endpoints + schema only):
  - **Filtered mode**: use `assignmentsApi.search({ person, page, page_size, ...filters })`
  - **Unfiltered mode**: use `assignmentsApi.list({ person, page, include_children, include_placeholders })`
    (server ignores `page_size`, so treat page size as fixed default).
- If `assignmentsApi.list` does **not** accept `person`, add it **only if desktop already supports it**. Otherwise keep paging as filtered-only.
- **Optional safety**: scope mobile paging to **filtered mode only** to keep unfiltered behavior identical to desktop (load all).

### 2) Add mobile “Load more assignments” UI
- Update `frontend/src/pages/Assignments/grid/components/MobilePersonAccordions.tsx`:
  - Add props: `assignmentCountByPerson`, `hasMoreAssignmentsByPerson`, `loadingMoreByPerson`, `onLoadMoreAssignments`.
  - In the expanded view, show a “Load more assignments” button:
    - **Filtered mode**: use `assignmentCountsByPerson` + current page size.
    - **Unfiltered mode**: use `next` from the list response (since `page_size` is fixed server-side).
  - Keep summary row values driven by `hoursByPersonView` (filteredTotals when active).

### 3) Mobile add-assignment search (keep desktop sync contract)
- **Do not** switch to async `projectsApi.search`.
- Keep using the existing **sync** client-side search provided to `useProjectAssignmentAdd`,
  so shared desktop/mobile hooks are not broken.

### 4) Mutations and optimistic updates (mobile-only)
- On add/remove/update hours:
  - Update the mobile list immediately.
  - Update totals (filtered totals if in filtered mode).
  - Preserve paging metadata (counts/hasMore).
  - Revert on failure.

### 5) Reset matrix (mobile-only paging state)
- Reset mobile paging state on:
  - Department change
  - Include-children toggle
  - Status filter changes
  - Search token changes
  - Weeks horizon changes

---

## Mobile Plan: Project Assignments (`/project-assignments`)

### 1) Create mobile accordion UI (mirror Assignments, no desktop changes)
- Create mobile components similar to Assignments:
  - `MobileProjectAccordions`
  - `MobileProjectAssignmentSheet`
  - `MobileAddPersonSheet` / `MobileAddRoleSheet` (or unified add sheet)
- Use `peopleApi.search` for adding people and `searchProjectRoles` for roles.

### 2) Add per-project paging state (use current API schema)
- Track per-project assignment paging:
  - `assignmentPageByProject`
  - `hasMoreAssignmentsByProject`
  - `loadingMoreByProject`
- Loader uses `assignmentsApi.list({ project, page, include_placeholders })`
  with **current backend ordering** (no new params). `page_size` is ignored on this endpoint.
- **Ordering note**: Accept current server ordering; do not attempt to replicate desktop grouping on mobile.

### 3) Wire into `ProjectAssignmentsGrid` (mobile-only)
- When `isMobileLayout`:
  - Use project paging already present (`projectsApi.search`) for the list.
  - Use new per-project paging for assignments.
  - Use existing mutations to add/update/remove, but update mobile state immediately.

---

## Mobile QA Checklist (with constraints)

### Assignments (mobile)
- Filtered search: expand person, load more, ordering stable per current backend.
- Edit hours + auto hours update summary row in filtered mode.
- Add/remove assignment updates list immediately (no refresh).
- Scroll position remains stable when expanding a person.

### Project Assignments (mobile)
- Search + “Load more projects” works (no backend changes).
- Expand project + “Load more assignments” works.
- Add/remove/update assignments update the list immediately.

---

## Estimated Effort
- **Assignments mobile paging**: 1–2 days.
- **Project Assignments mobile mirror**: 2–3 days (new sheets + wiring).
- **Backend ordering parity (optional)**: 0.5–1 day if needed.

---

## API Behavior Caveats (Quick Reference)
- `GET /assignments/` ignores `page_size`; paging uses default size (100). Use `page` + `next`.
- `GET /assignments/by_person/` is **not paged** (returns full list).
- `POST /assignments/search/` honors `page_size` and returns `next`.

---

## Optional Backend Enhancements (Additive / Opt-In Only)
These changes are allowed **only if they do not alter desktop behavior**. Defaults remain unchanged.

1) **Honor `page_size` on `GET /assignments/`**
   - Fixes inconsistent “Load more” sizing on mobile.
   - Safe because desktop does not send `page_size`.
   - **Measured impact**: current `GET /assignments/` payload is ~72KB even with `page_size=1`.
     Honoring `page_size` will reduce mobile payloads.

2) **Add pagination to `GET /assignments/by_person/` (opt-in)**
   - Preserve current behavior when `page` is absent (full list).
   - When `page` is present, return paged response with `count/next`.
   - **Measured impact**: per-person search paging is fast (~0.03s, ~1.9KB for `page_size=1`),
     so a paged by-person list avoids large list payloads.

3) **Optional `ordering` param on `GET /assignments/`**
   - Default ordering unchanged.
   - Mobile can request clearer ordering for project-centric views.

4) **Counts-only endpoint for unfiltered mode**
   - Example: `GET /assignments/counts_by_person/?department=...`
   - Returns `{ personId: count }` so mobile can decide when to show “Load more.”

5) **`meta_only` flag for `POST /assignments/search/` (opt-in)**
   - `meta_only=1` returns counts/people/filteredTotals without `results`.
   - Mobile can refresh totals without reloading assignment pages.
   - **Measured impact**: unfiltered search meta with `page_size=1` is ~29KB,
     which is acceptable but could be reduced further with `meta_only` if needed.
