Bulk Response Shape Policy (Phase 0.7)

Scope
- Endpoints that support `?all=true` and return raw arrays (not paginated objects), notably People, Projects, and Departments.

Options considered
- Keep legacy implementation for `all=true` during migration and only migrate paginated flows now.
- Introduce dedicated `/bulk/` endpoints returning arrays, explicitly annotated via `@extend_schema`.
- Standardize list responses to always be paginated and adjust backend + UI.

Decision (low risk, incremental)
- Keep legacy for `?all=true` during Phase 0–2.
- Migrate only paginated flows to the typed client in early phases.
- Revisit dedicated `/bulk/` endpoints (or standardization) in a later phase once types and callers are stabilized.

Rationale
- Avoids ambiguity in OpenAPI types for mixed array/paginated shapes.
- Minimizes risk by not altering heavy UI call sites that expect arrays.
- Keeps diffs small while typed client adoption proceeds.

Implementation Notes
- People: `peopleApi.list` (paginated) may be routed through typed client under flags; `peopleApi.listAll` remains legacy (`/people/?all=true`).
- Projects: `projectsApi.list` (paginated) is eligible for typed migration; `projectsApi.listAll` remains legacy (`/projects/?all=true`).
- Departments: `departmentsApi.list` (paginated) eligible; `departmentsApi.listAll` remains legacy (`/departments/?all=true`).
- Code references: `frontend/src/services/api.ts` has explicit comments to keep `listAll` on legacy during Phase 0–2.

Testing
- With flags enabled (e.g., `VITE_OPENAPI_MIGRATION_ENABLED=true` and endpoint-specific flags), verify UI features using paginated lists continue to work via typed client.
- Manually verify bulk endpoints still return arrays:
  - `curl -sSf http://localhost:8000/api/people/?all=true | head -c 80`
  - `curl -sSf http://localhost:8000/api/projects/?all=true | head -c 80`
  - `curl -sSf http://localhost:8000/api/departments/?all=true | head -c 80`
- Confirm code paths for `listAll` use the legacy fetch implementation (see services/api.ts lines around people/projects/departments `listAll`).

Future Work
- If bulk endpoints remain, introduce dedicated `/bulk/` routes with clear request/response models and add `@extend_schema` annotations so typed clients can consume them safely.
- Alternatively, standardize list responses to paginated shapes and retire `?all=true` where practical.

