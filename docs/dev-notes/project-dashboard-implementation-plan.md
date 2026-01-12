# Project Dashboard (Dept Tracker) Implementation Plan

## Goal
Implement a schedule-first project dashboard with project info, assignments by department, deliverable schedule, department task panels (template-driven), and project risks.

## Scope Summary
- New dashboard page for projects (based on `project-dashboard-sky-15-dept-tracker.html`).
- Template-driven department tasks (deliverable + QA) with per-project instances.
- Risks register for schedule/cost visibility.
- Reuse existing project/assignment/deliverable/department data.
- **Note:** Pre-deliverables are unrelated to these tasks and remain unchanged.
- Tasks are **per-project** instances generated from **user-defined presets** tied to deliverable types.

## Existing Data You Can Reuse
- **Project**: name/code, client, status, dates, phase (if present).
- **People/Departments**: via `departmentsApi`, `peopleApi`, and assignment APIs.
- **Assignments**: by project, grouped by department with project roles.
- **Deliverables**: list with due dates/owners.

## Required Schema Updates
### 1) ProjectRisk (new)
Tracks schedule/cost risk items.
- `id`
- `project_id` (FK)
- `type` (enum: `schedule`, `cost`, `scope`, `other`)
- `severity` (enum: `low`, `medium`, `high`)
- `status` (enum: `open`, `mitigating`, `closed`)
- `owner_id` (FK to person, nullable)
- `title`
- `description` (nullable)
- `impact` (nullable)
- `due_date` (nullable)
- `created_at`, `updated_at`

### 2) TaskTemplate (new)
Prebuilt template task definitions per department.
- `id`
- `name`
- `department_id` (FK)
- `task_type` (enum: `deliverable`, `qa`)
- `phase` (nullable)
- `default_due_offset_days` (int, relative to deliverable date)
- `default_owner_role_id` (FK to department project role, nullable)
- `required` (bool)
- `is_active` (bool)
- `created_at`, `updated_at`

### 3) DeliverableTaskPreset (new)
User-defined presets that associate tasks with deliverable kinds.
- `id`
- `name` (e.g., "SD Deliverables Tasks")
- `canonical_label` (e.g., "DD")
- `aliases` (array/JSON; e.g., ["DD", "Design Development", "DD OFR"])
- `min_percentage` (nullable; e.g., 0)
- `max_percentage` (nullable; e.g., 40)
- `is_active` (bool)
- `created_at`, `updated_at`

### 4) DeliverableTaskPresetItem (new)
Join table between presets and tasks.
- `preset_id` (FK)
- `template_id` (FK)

### 5) ProjectTaskInstance (new)
Instantiated tasks for a specific project and deliverable.
- `id`
- `project_id` (FK)
- `template_id` (FK)
- `deliverable_id` (FK, nullable)
- `department_id` (FK)
- `task_type` (enum: `deliverable`, `qa`)
- `status` (enum: `planned`, `in_progress`, `blocked`, `done`)
- `owner_id` (FK to person, nullable)
- `due_date` (date, nullable; default from template + deliverable)
- `notes` (nullable)
- `created_at`, `updated_at`

## Backend/API Changes
### Endpoints
- `GET /projects/{id}/dashboard/` (aggregate endpoint)
  - project info
  - assignments grouped by department
  - deliverables
  - risks
  - task instances grouped by department + task_type
- `GET /projects/{id}/risks/` (list)
- `POST /projects/{id}/risks/` (create)
- `PATCH /projects/{id}/risks/{risk_id}/` (update)
- `GET /task_templates/` (admin/config)
- `GET /deliverable_task_presets/` (admin/config)
- `POST /deliverable_task_presets/` (admin/config)
- `PATCH /deliverable_task_presets/{id}/` (admin/config)
- `GET /projects/{id}/tasks/` (instances)
- `PATCH /projects/{id}/tasks/{task_id}/` (status/owner/due override)

### Task Instance Generation
- On **deliverable create/update**: generate instances from matching **presets** using:
  - `Deliverable.description` (case-insensitive match against preset aliases), else
  - `Deliverable.percentage` within `[min_percentage, max_percentage]`.
- A single deliverable can match multiple presets; ensure idempotent generation.
- If template updated: do not auto-mutate existing instances unless explicitly resynced.

### Matching Precedence (to avoid overlaps)
- **Priority rule**: check description matches first; if **any** description preset matches, use **only** those and **skip** percentage presets.
- **Ordering**: apply exact alias matches first, then word-boundary/contains alias matches.
- **Fallback**: only when **no** description presets match, apply percentage-range matches.
- **Tie-breaker**: prefer the **longest alias** (more specific) when multiple aliases match.
- **De-duplication**: if multiple presets include the same task template, only create one instance per deliverable/template pair.

## Frontend Implementation
### Route/Page
- New page under `frontend/src/pages/Projects/ProjectDashboard.tsx`.
- Fetch aggregate endpoint and render sections:
  - Project info card
  - Assignments by department
  - Deliverable schedule (single source)
  - Risks list
  - Right column: department tasks (template instances grouped by dept + type)

### UI Notes
- Remove “Focus” concept; show **Project Role** only.
- Task cards show template name, due date, owner, status.
- Include quick actions: mark task done, reassign, change due date.

## Data Seeding / Templates
- Seed default templates for core departments (Design, Engineering, Mechanical, Electrical, Fire).
- Provide at least one preset per **deliverable kind** with aliases (SD/IFP/IFC/ADC).
- Provide optional percentage-range presets (e.g., 0–40% tasks for early-phase deliverables).
- Example: SD preset with aliases ["SD", "Schematic Design"] plus 3 deliverable tasks + 2 QA tasks per department, matched via alias or `percentage 0–40`.

## Permissions / Roles
- PMs: create/update risks and tasks.
- Department leads: update tasks in their department.
- All assigned staff: view-only.

## Migration Plan
1. Create new tables (ProjectRisk, TaskTemplate, DeliverableTaskPreset, DeliverableTaskPresetItem, ProjectTaskInstance).
2. Add settings UI for presets (deliverable description + optional percentage range).
3. Seed default templates/presets.
3. Add aggregate dashboard endpoint.
4. Implement frontend page.
5. Backfill tasks for existing projects with deliverables.

## Testing
- Unit tests for task instance generation rules.
- API tests for risks/tasks endpoints.
- Snapshot tests for dashboard layout.

## Rollout
- Feature flag the page (if needed) until templates are seeded.
- Enable for internal users first, then company-wide.
