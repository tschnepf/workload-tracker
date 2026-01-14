# Project Risk Log Plan

## Backend patterns observed
- **Projects app**: `Project` model lives in `backend/projects/models.py` and is exposed via `ProjectViewSet` (`backend/projects/views.py`) using DRF `ModelViewSet`.
- **Routing**: `backend/projects/urls.py` uses `DefaultRouter()` for standard CRUD plus a separate `urls_roles.py` file for non-CRUD endpoints.
- **Serializers**: `backend/projects/serializers.py` maps snake_case model fields to camelCase API fields (e.g., `start_date` -> `startDate`).
- **Departments**: model in `backend/departments/models.py`, used elsewhere via FK and list endpoints.
- **Uploads**: Django `MEDIA_ROOT`/`MEDIA_URL` are configured in `backend/config/settings.py`. No existing model-based `FileField` pattern, but DRF serializers already handle `FileField` in other endpoints (e.g., backup upload).
- **Schema**: OpenAPI is generated via drf-spectacular (`backend/config/urls.py`).

## Proposed model (projects app)
Create a new `ProjectRisk` model in `backend/projects/models.py`:
- `project` (FK → `projects.Project`, `related_name='risks'`)
- `description` (TextField)
- `departments` (M2M → `departments.Department`, `related_name='risk_entries'`)
- `created_by` (FK → `settings.AUTH_USER_MODEL`, nullable, `on_delete=SET_NULL`)
- `created_at` (auto timestamp)
- **Optional:** `updated_at`, `updated_by` if edits are allowed
- `attachment` (FileField, optional)
Suggested model options:
- `ordering = ['-created_at']`
- Indexes on `project_id` and `created_at`
- Confirm default pagination remains enabled for list endpoints.

Suggested upload path:
```
project_risks/<project_id>/<timestamp>_<filename>
```
**Folder marker file:** on first attachment for a project, create a blank text file named  
`client-projectnumber-projectname.txt` in that project’s attachment folder to identify the project.

## Attachment access strategy (decide early)
**Option B (protected)** — store attachments outside `MEDIA_ROOT` and expose a DRF download endpoint with auth checks.
- Store files in a non-public directory (e.g., `RISK_ATTACHMENTS_DIR` in settings).
- Implement a **custom storage class** (or `FileSystemStorage`) that uses `RISK_ATTACHMENTS_DIR`.
- **Configurable path:** allow an admin (or env var) to set `RISK_ATTACHMENTS_DIR` in settings.
- Add a download endpoint that checks permissions and streams the file.
- Use the storage backend to open/stream files (avoid raw filesystem path usage).
- This prevents public access and aligns with auth requirements.

## Upload validation
- Enforce max upload size (e.g., `RISK_UPLOAD_MAX_BYTES` in settings)
- Optional allowlist for extensions/MIME types

## Serializer + API design
Add serializer(s) in `backend/projects/serializers.py`:
- **ProjectRiskSerializer**
  - Input: `project`, `description`, `departments` (list of IDs), `attachment`
  - Output: `departments` (IDs), `departmentNames`, `createdBy`, `createdByName`, `createdAt`, `attachmentUrl`
  - `created_by` and `created_at` are **read-only** (set server-side)
  - `createdByName` derived from `user.profile.person.name` fallback to `user.username`
  - **Optional:** add `updated_at` / `updated_by` fields if edits are allowed; expose as `updatedAt` / `updatedBy` / `updatedByName`

Add `ProjectRiskViewSet` in `backend/projects/views_risks.py`:
- `list`, `create`, `update`, `destroy`
- **Nested route scoping:** expose `/api/projects/<id>/risks/` to hard-scope by project
  - Queryset uses `filter(project_id=...)` and `prefetch_related('departments')`
- **Query optimization:** `select_related('created_by', 'created_by__profile', 'created_by__profile__person')`
- **Enforce nested detail scoping:** override `get_queryset()` / `get_object()` to filter by `project_id` on detail routes.
- `perform_create()` sets `created_by = request.user` and `project_id` from the URL
- **Optional:** `perform_update()` sets `updated_by` if enabled
- Use `MultiPartParser` + `FormParser` for file upload
- **Permissions:** set `permission_classes = [IsAuthenticated]` so normal users can create/edit risks
  - If you want stricter rules later, add object-level checks (e.g., only project members can edit).
- **Multipart handling:** accept `departments` as either a JSON string or a list to avoid 400s.
- **Clearing M2M:** ensure serializer supports `departments: []` to clear on update.

Routing:
- Add `backend/projects/urls_risks.py` with `/projects/<int:project_id>/risks/` (list/create)
- **Use nested detail only:** `/projects/<int:project_id>/risks/<int:id>/` for update/delete
- Include in `backend/projects/urls.py` before the router to avoid PK collisions

## Frontend integration
Add a **Risk Log** section to the Project Dashboard:
- List risks with description, departments, created by, created at, attachment link
- Add risk (description + department multi-select + file upload)
- Edit risk (description, departments, attachment replace/remove)
- Delete risk
- **Multipart handling:** send `departments` in `FormData` as JSON (e.g., `"[1,2]"`).

API usage:
- `GET /api/projects/<id>/risks/`
- `POST /api/projects/<id>/risks/`
- `PATCH /api/projects/<project_id>/risks/<id>/`
- `DELETE /api/projects/<project_id>/risks/<id>/`

## Migrations + tests
- Add migration for `ProjectRisk`
- Model tests: M2M integrity, attachment optionality, created_by audit
- API tests: CRUD, filtering by project, permissions, multipart upload
- Add file cleanup tests if possible

## File cleanup (avoid storage bloat)
- Add `post_delete` and `pre_save` cleanup for the attachment `FileField` to remove old files.
- Ensure cleanup only removes files on replace/delete (not on partial updates without new file).
- Use storage backend for delete calls (avoid raw path usage).

## OpenAPI + generated types (required)
- Regenerate backend schema if `backend/openapi.json` is used.
- Update `frontend/src/api/schema.src.json` and run the generator to refresh `schema.ts`.
- Document schema regeneration commands in the repo (or README/Makefile target).

## Implementation steps
1) Add `ProjectRisk` model + migration in `projects/models.py`
2) Add serializer + viewset + nested urls for risks
   - Explicitly set `permission_classes = [IsAuthenticated]` on the risk viewset
3) Implement protected attachment storage + download endpoint
4) Add multipart parsing for `departments` in serializer
5) Add upload validation (size limits, optional MIME allowlist)
6) Update OpenAPI schema + regenerate frontend types (with documented commands)
7) Build Project Dashboard Risk Log UI + wire to API
8) Add tests for model, API, and file cleanup
9) Update deployment/docker volumes for `RISK_ATTACHMENTS_DIR`
