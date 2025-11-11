ETag Behavior: Current Implementation and Test Plan

Overview
- Server-side detail routes use conditional requests via ETags; select list routes include ETag/Last-Modified and 304 handling.
- Frontend automatically captures ETags from GETs and injects If-Match on PATCH/DELETE, with friendly errors and a single 401 refresh retry.

Server Implementation
- Detail ETags: `backend/core/etag.py` `ETagConditionalMixin` computes `MD5(updated_at)` (fallback to `id`) and:
  - GET retrieve: returns `ETag` (and `Last-Modified` if `updated_at` present); honors `If-None-Match` with 304.
  - Mutations (PUT/PATCH/DELETE): if `If-Match` present and mismatched → 412 Precondition Failed.
- Currently applied to:
  - People: `backend/people/views.py` → `class PersonViewSet(ETagConditionalMixin, ModelViewSet)`
  - Projects: `backend/projects/views.py` → `class ProjectViewSet(ETagConditionalMixin, ModelViewSet)`
  - Not yet on: Assignments, Deliverables, Departments, Skills, Roles (detail preconditions not enforced yet).
- List ETags/304:
  - People list includes `ETag` and `Last-Modified` via max(updated_at) and returns 304 for `If-None-Match` / `If-Modified-Since` when unchanged.

Frontend Implementation
- File: `frontend/src/services/api.ts`.
  - Stores ETags from successful GET responses in an in-memory `etagStore`, keyed by endpoint path with trailing slash.
  - Injects `If-Match` on PATCH/PUT/DELETE for detail endpoints when an ETag exists.
  - 412 handling: shows toast "This record changed since you loaded it. Refresh and retry." and throws an `ApiError` (for callers to rollback optimistic updates).
  - 401 handling: coalesces to a single `refreshAccessToken()` and retries the request once after refresh.

How To Test (API level)
Prereqs: Backend up, obtain a valid JWT access token.

1) People detail GET → ETag and 304
- `curl -i -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/people/1/`
- Note returned `ETag: "<etag>"`. Then:
- `curl -i -H "Authorization: Bearer $TOKEN" -H "If-None-Match: \"<etag>\"" http://localhost:8000/api/people/1/` → expect `304 Not Modified`.

2) People PATCH with If-Match → success
- `curl -i -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "If-Match: \"<etag>\"" -d '{"notes":"test"}' http://localhost:8000/api/people/1/` → 200 and new `ETag`.

3) People PATCH with stale If-Match → 412
- After another update in a separate tab/process, repeat PATCH with the older ETag → expect `412 Precondition Failed` and same toast in the UI.

4) Projects detail (same as People)
- Repeat steps 1–3 against `/api/projects/{id}/` (Projects uses the mixin).

Notes
- Assignments/Deliverables/Departments/Skills/Roles detail routes currently do not enforce `If-Match`; add `ETagConditionalMixin` when migrating their CRUD.
- Frontend storage is in-memory per session; on reload, ETags are reacquired via GETs.

