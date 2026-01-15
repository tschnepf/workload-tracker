# Deliverable Task Templates Plan

## Goal
Add a new Deliverable Tasks feature that auto-generates standard tasks for SD (1–40%), DD (41–89%), IFP (90–99%), and IFC (100%) deliverables. Generation must first match by description (SD/DD/IFP/IFC), then fall back to percentage. Tasks are defined in a spreadsheet-style Settings table and rendered/managed on the Project Dashboard.

## Scope & Requirements
- Generate tasks when a deliverable is created (including default deliverables created when a project is created).
- Matching order: description (case-insensitive, trimmed) → percentage range.
- Task template fields:
  - Department (required, FK)
  - Sheet # (optional, alphanumeric with `-` or `.`)
  - Sheet name (optional, alphanumeric)
  - Scope description (free text)
  - Completion status (required)
  - QA status (required)
  - Default assignee (optional; must be on project at generation time)
- Task instances:
  - Can be assigned to a project member or left open.
  - Can be completed by any project member.

## Proposed Data Model (backend)
- `DeliverableTaskTemplate`
  - `phase` (enum: `sd`, `dd`, `ifp`, `ifc`) — must align with global DeliverablePhase enum once IFC is added (see below).
  - `department` (FK to `departments.Department`, required)
  - `sheet_number` (CharField, optional)
  - `sheet_name` (CharField, optional)
  - `scope_description` (TextField, optional)
  - `default_completion_status` (CharField, required)
  - `default_qa_status` (CharField, required)
  - **No default assignee** (manual assignment only; see Permissions & Validation Rules)
  - `sort_order` (int for stable table ordering)
  - `is_active` (bool)
- `DeliverableTask`
  - `deliverable` (FK)
  - `department` (FK)
  - `sheet_number`, `sheet_name`, `scope_description`
  - `completion_status` (CharField)
  - `qa_status` (CharField)
  - `assigned_to` (FK to `people.Person`, optional)
  - `completed_by` (FK to `people.Person`, optional)
  - `completed_at` (DateTimeField, optional)
  - `created_at`, `updated_at`
  - Unique constraint `(deliverable, template)` to prevent duplicate generation.
- `DeliverableTaskTemplate` → `DeliverableTask` mapping stored with FK (template id).

### New: Deliverable Phase Mapping Settings (single source of truth)
- `DeliverablePhaseMappingSettings` (singleton)
  - `use_description_match` (bool, default true)
  - `desc_sd_tokens` (CSV or JSON list; default `["sd", "schematic"]`)
  - `desc_dd_tokens` (default `["dd", "design development"]`)
  - `desc_ifp_tokens` (default `["ifp"]`)
  - `desc_ifc_tokens` (default `["ifc"]`)
  - `range_sd_min`, `range_sd_max` (default 1–40)
  - `range_dd_min`, `range_dd_max` (default 41–89)
  - `range_ifp_min`, `range_ifp_max` (default 90–99)
  - `range_ifc_exact` (default 100)
  - `updated_at`
- Validation rules:
  - Ranges must be contiguous, non-overlapping, and within 0–100.
  - IFC must be a single value (default 100).
  - If `use_description_match` is true, description tokens are matched before percentages.
  - Ensure tokens are sanitized (lowercase, trimmed) and de-duplicated.

## Matching & Generation Rules
- Normalize description: trim, collapse whitespace, uppercase.
- Description match: exact `SD`, `DD`, `IFP`, `IFC`.
- Percentage match (global, single-source rules; see “IFC everywhere” update below):
  - `1–40` → SD
  - `41–89` → DD
  - `90–99` → IFP
  - `100` → IFC
- If description matches, skip percentage evaluation.
- If no match, do nothing.
- Generation should be idempotent and executed on `transaction.on_commit`.
- If a template specifies a default assignee not on the project, generate as unassigned and log a warning in the response/telemetry.

## Backend Implementation Steps
1. **Models & migrations**
   - Add `DeliverableTaskTemplate` and `DeliverableTask` models under `backend/deliverables/models.py`.
   - Add validation helpers (regex for sheet number/name; status value checks).
   - Create migrations with indexes for `(deliverable, assigned_to)` and `(deliverable, completion_status)`.
2. **Choices & validation**
   - Add `IFC` to the global `DeliverablePhase` enum in `backend/core/choices.py`.
   - Add `DeliverablePhaseMappingSettings` singleton (see model above) with defaults.
   - Update `backend/core/deliverable_phase.py` to classify via **settings-driven mapping**:
     - Load settings (cached, with fallback to defaults if missing).
     - If `use_description_match`, check tokens for SD/DD/IFP/IFC in order.
     - Otherwise classify strictly by percentage ranges (including IFC exact).
   - Update any snapshot/analytics serializers or tables that rely on the enum; backfill or migrate existing rows if needed.
   - Define `CompletionStatus` and `QaStatus` enums (or allow free-text with max length). Decide upfront to avoid schema churn.
   - Implement validation to ensure assigned/complete actions are limited to project members.
3. **Services**
   - New `DeliverableTaskService.generate_for_deliverable(deliverable)`:
     - Resolve phase by description then percentage using the **shared DeliverablePhase classifier** (single source of truth).
     - Load active templates for the phase.
     - Create tasks from templates (skip duplicates).
4. **Signals**
   - Extend `backend/deliverables/signals.py` to call the task generation service on deliverable create.
   - Consider regenerating tasks when `description` or `percentage` changes (optional; see open questions).
5. **Permissions & membership helper (explicit)**
   - Add `backend/assignments/utils/project_membership.py` (or similar) with helper:
     - `is_current_project_assignee(person_id, project_id, on_date=None)` → bool
     - Uses `Assignment` rows: `project_id`, `person_id`, `is_active=true`, and (if present) `start_date <= on_date <= end_date`.
   - Add custom DRF permission class for deliverable tasks, e.g. `DeliverableTaskPermission`:
     - SAFE methods: allow if user can view the project (same rule as current project access).
     - Writes: allow only if user’s linked `Person` is a current project assignee (helper above) **or** admin/manager.
   - Apply permission to all Deliverable Task endpoints (list/detail/update/assign/complete).
   - Add object-level checks to ensure `assigned_to` changes only target current project assignees.
   - Enforce queryset scoping: list endpoints must filter to projects where the user is currently assigned (unless admin/manager).
   - If the user has no linked `Person` record, deny assignment/completion with a clear error.
6. **API**
   - Add viewsets/serializers for:
     - Task templates (admin settings CRUD + reorder).
     - Deliverable tasks (list by deliverable/project; update status; assign; mark complete).
   - Ensure permissions:
     - Templates: admin/manager only.
     - Tasks: project members can read/update; non-members read denied.
7. **Template edit/delete behavior (explicit)**
   - Template updates **do not** mutate existing tasks automatically (avoid data loss).
   - Template deletes should not cascade to existing tasks:
     - Set FK `template` on `DeliverableTask` to `SET_NULL` (keep historical tasks) or `PROTECT` (prevent delete).
   - Add explicit admin action/command to regenerate tasks per project or per phase:
     - Management command: `backfill_deliverable_tasks` with filters (`project_id`, `phase`, `dry_run`).
     - Optional Settings UI button: “Regenerate tasks for project” (confirm impact).
8. **Project-scoped endpoint**
   - Add `/api/projects/{id}/deliverable_tasks/` (or `/api/deliverables/tasks/by_project/`) to return all tasks for a project in one request.
   - Include deliverable metadata (id, description, date, percentage), department, and assignee to avoid N+1 UI fetches.
   - Ensure queryset prefetches `deliverable`, `department`, `assigned_to`.
9. **Status standardization**
   - Decide and implement one of:
     - **Enum-based**: `CompletionStatus` + `QaStatus` in `backend/core/choices.py` with fixed values.
     - **Settings-driven**: new `DeliverableTaskStatusSettings` singleton listing allowed values for completion + QA.
   - Validate on create/update in serializers; UI should render dropdowns from the same source.
10. **Schema/Docs**
   - Update `frontend/src/api/schema.src.json` if required and expose new endpoints.
   - Regenerate OpenAPI schema + frontend types (`make openapi-schema` + `make openapi-client`).
11. **Phase mapping settings API + caching**
   - Add serializer/view/URL for `DeliverablePhaseMappingSettings` (singleton) in `backend/core/serializers.py`, `backend/core/views.py`, `backend/core/urls.py`.
   - Cache the mapping settings in `backend/core/deliverable_phase.py` and invalidate cache on update.
12. **Assignment lifecycle cleanup**
   - Add a service/signal to unassign open tasks when an `Assignment` becomes inactive or falls outside date range:
     - Preserve completed tasks (keep `assigned_to`, `completed_by`, `completed_at`).
     - For incomplete tasks, set `assigned_to = null` and leave task active.
   - Trigger on Assignment save (status/date change) and on delete.

## Settings UI (Spreadsheet Style)
- Add a new Settings section, e.g., `Deliverable Phase Mapping`:
  - Admin-only singleton editor.
  - Spreadsheet-style form (rows for SD/DD/IFP/IFC) with columns: Description Tokens, Min %, Max %, IFC Exact.
  - Inline validation: contiguous ranges, IFC exact value, tokens not empty when description matching enabled.
  - Persist to `DeliverablePhaseMappingSettings`.
  - This becomes the **single source of truth** for task generation and analytics phase classification.
- Add a second Settings section, e.g., `Deliverable Task Templates`:
  - Use `SettingsSectionFrame` and add metadata in `frontend/src/pages/Settings/sections/index.tsx`.
  - Table layout similar to `ProjectPreDeliverableSettings` with inline inputs and row add/remove.
  - Columns: Phase, Department, Sheet #, Sheet Name, Scope, Completion Status, QA Status, Active, Sort.
  - Inline validation with clear error messaging (regex for sheet fields, required department).
- Update `docs/settings-sections.md` and add regression scenarios.

## Project Dashboard UI
- Add a `Deliverable Tasks` card under `frontend/src/pages/Projects/ProjectDashboard.tsx`:
  - Group by deliverable (and show deliverable label + date).
  - Show tasks in a compact table (department, sheet info, scope, status, QA, assignee).
  - Inline status/QA dropdowns; assign/unassign via project member picker.
  - Completion action available to any project member.
  - Include empty state if no tasks generated yet.

## Permissions & Validation Rules
- Tasks are created **unassigned**. Assignment is always manual (user can assign or remove assignment).
- `assigned_to` (when set) must be a **current project assignment** from `assignments.Assignment` where `project_id` matches and `is_active = true`.
- “Currently assigned” is defined by Assignment rows (not DeliverableAssignment). If `start_date`/`end_date` are present, enforce today within range; if dates are null, treat as active when `is_active = true`.
- Completion only allowed by people currently assigned to the project; record `completed_by` + timestamp.
- Ensure tasks remain read-only for users without project access.

## Backfill & Regeneration
- Add management command for backfilling tasks for existing deliverables that match phase rules.
- Optional: add a “Regenerate tasks for project” admin action (similar to pre-deliverables backfill).

## Implementation Checklist (with file locations)
- Models: add `DeliverableTaskTemplate` + `DeliverableTask` in `backend/deliverables/models.py`.
- Migrations: new migration files in `backend/deliverables/migrations/`.
- Phase mapping settings: add `DeliverablePhaseMappingSettings` in `backend/core/models.py`.
- Phase classifier: update mapping logic in `backend/core/deliverable_phase.py`.
- Enum updates: add IFC to `backend/core/choices.py`; update snapshot/event choices + migrations in `backend/assignments/models.py`.
- Task permissions: add membership helper in `backend/assignments/utils/project_membership.py` and permission class in `backend/deliverables/permissions.py` (or `backend/deliverables/views.py`).
- Task services: implement generation in `backend/deliverables/services.py`.
- Signals: hook generation on deliverable create in `backend/deliverables/signals.py`.
- API endpoints: add viewsets/serializers in `backend/deliverables/serializers.py` and `backend/deliverables/views.py`; routes in `backend/deliverables/urls.py`.
- Project-scoped endpoint: implement in `backend/projects/views.py` or `backend/deliverables/views.py` (and route in `backend/projects/urls.py` or `backend/deliverables/urls.py`).
- Admin UI: register new models in `backend/deliverables/admin.py` (optional).
- Settings UI: add sections in `frontend/src/pages/Settings/sections/` and register in `frontend/src/pages/Settings/sections/index.tsx`.
- Settings docs: update `docs/settings-sections.md`.
- Project dashboard UI: add Deliverable Tasks card in `frontend/src/pages/Projects/ProjectDashboard.tsx`.
- Frontend API client: add endpoints in `frontend/src/services/api.ts`.
- OpenAPI + types: regenerate `backend/openapi.json` + `frontend/src/api/schema.ts` (via `make openapi-schema` and `make openapi-client`).

## Tests
- **Backend**
  - Task generation matches description first, then percentage.
  - Correct template expansion and idempotency.
  - Validation: assignee must be on project; completion by non-member rejected.
  - API permissions for templates and tasks.
- **Frontend**
  - Settings table CRUD flows, validation errors.
  - Project dashboard rendering, inline edit, assign/unassign.

## IFC Everywhere Update (Decision)
We will **extend the existing DeliverablePhase enum** and analytics to include `IFC`, rather than using a separate task-only phase enum. This means:
- `backend/core/choices.py`: add `IFC = "ifc", "IFC"` to `DeliverablePhase`.
- `backend/core/deliverable_phase.py`: update `_classify_from_desc_pct` to use **DeliverablePhaseMappingSettings** (description tokens + percentage ranges). IFC should be recognized by description and by exact percent mapping.
- `backend/assignments/models.py` (and migrations): update `deliverable_phase` choices in `WeeklyAssignmentSnapshot` and `AssignmentMembershipEvent` to include IFC.
- `backend/assignments/views.py` serializers that expose `DeliverablePhase.choices` will automatically include IFC but tests must be updated.
- Any analytics queries, reports, or UI displays that enumerate phases should be updated to include IFC in ordering/labels.

## Open Questions
1. Should changes to deliverable description/percentage regenerate or append tasks? (Default recommendation: no auto-regen without explicit action to avoid data loss.)
2. Are completion/QA statuses fixed enums (preferred) or free text?
3. Should template assignee be a person or a role? If person, what happens when they are not on a given project?
4. Should task rows include due dates or offsets relative to deliverable date?
