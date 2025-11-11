# Projects Inline Edit Migration Plan

Goal: Eliminate the dedicated project edit page by moving all edit fields and the Pre‑Deliverable Settings card into the Projects page’s Project Details panel with safe, lean, and accessible inline editing. No shortcuts or band‑aids. Backend and frontend must remain strictly coordinated.

Key targets (current code):
- Frontend
  - `frontend/src/pages/Projects/ProjectsList.tsx`
  - `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx`
  - `frontend/src/pages/Projects/ProjectForm.tsx` (to deprecate/remove)
  - `frontend/src/components/projects/ProjectPreDeliverableSettings.tsx`
  - `frontend/src/hooks/useProjects.ts` (update mutation already exists)
  - `frontend/src/services/api.ts` (`projectsApi`, `assignmentsApi`)
- Backend
  - `backend/projects/views.py` (project `pre_deliverable_settings` endpoints exist)
  - `backend/projects/serializers.py` (ensure fields parity)

Non-goals:
- Changing project model semantics or pre‑deliverable business rules.
- Re‑theming the details panel beyond minimal alignment.

Feature flag (optional but recommended for safe rollout): `INLINE_PROJECT_EDIT_ENABLED` (default true). If you add it, ensure the UI gracefully disables inline edit when false and keeps a fallback link to the legacy editor.

---

## Phase 0 — Baseline Verification

Step 0.1 — Confirm file locations and APIs
- Prompt: “Scan the repo to ensure these files and APIs exist exactly as referenced: ProjectDetailsPanel.tsx, ProjectsList.tsx, ProjectForm.tsx, ProjectPreDeliverableSettings.tsx, useProjects.ts, services/api.ts (projectsApi.get/update/getClients), services/projectsSettings.ts (projectSettingsApi.get/update). Do not proceed if any file is missing—report paths and stop.”

Step 0.2 — Validate backend endpoints and field mappings
- Prompt: “Verify backend has `PUT/GET /projects/{id}/pre-deliverable-settings/` and that `ProjectSerializer` exposes: id, name, status, client, description, start_date, end_date, estimated_hours, project_number. Confirm FE camelCase ↔ BE snake_case mapping is preserved in typed client. If mismatches are found, list them and stop.”

---

## Phase 1 — Inline Edit Building Blocks

Step 1.1 — Add a minimal, reusable InlineEdit primitive
- Prompt: “Create `frontend/src/components/ui/InlineEdit.tsx` exporting small, focused primitives: `InlineText`, `InlineTextarea`, `InlineSelect`, and `InlineDate`. Requirements:
  - Props: `value`, `onCommit(newValue)`, `placeholder?`, `format?(in:string)=>string`, `parse?(in:string)=>any`, `disabled?`, `ariaLabel`, `className?`.
  - Behavior: display mode by default; click or Enter switches to edit; Escape or blur cancels; Enter on inputs commits; on blur commits (except when value unchanged). No global edit mode.
  - Keep logic lean, no context or reducers; one component per control with internal `editing` + `draft` state.
  - Accessibility: set `role="button"` on display mode with `tabIndex=0`, `aria-label` from props; inputs link to labels via `aria-labelledby` when available.
  - Do not add styling frameworks—use existing classes consistent with details panel (variables: `--text`, `--muted`, `--surface`, `--border`).”

Step 1.2 — Wrap project update with a tiny helper hook
- Prompt: “Add `frontend/src/hooks/useInlineProjectUpdate.ts` exposing `useInlineProjectUpdate(projectId: number)` that returns `commit(field: keyof Project, value: any): Promise<void>`. Implementation must:
  - Use `useUpdateProject()` mutation.
  - Accepts a single field update per call and forwards to `projectsApi.update(id, { [field]: value })`.
  - Surface friendly errors via the existing toast bus (`showToast`), mapping 412 to ‘record changed—refresh’. No additional caching beyond `useUpdateProject`’s optimistic update.
  - No debounced network calls—commit is on explicit user commit; keep logic lean.”

Step 1.3 — Client suggestions service reuse
- Prompt: “Confirm `projectsApi.getClients()` returns a deduped list. Add a lightweight client autocomplete utility in `InlineText` usage rather than a new component. Keep it simple: fetch on focus once, filter in-memory as user types, show dropdown list under the input. Do not add new dependencies.”

---

## Phase 2 — Apply Inline Editing to Project Details Panel

Step 2.1 — Inline‑editable Name, Client, Project Number
- Prompt: “Edit `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx`:
  - Import `InlineText` and `useInlineProjectUpdate`.
  - Replace the static title `<h2>{project.name}</h2>` with `InlineText` that commits to `name`.
  - Replace ‘Client: {project.client}’ with `InlineText` wired to client suggestions and commit to `client`.
  - Replace ‘Project Number: {project.projectNumber}’ with `InlineText` committing to `projectNumber`.
  - Keep Status as-is using `ProjectStatusDropdown` (already inline-edit). Do not alter its behavior.”

Step 2.2 — Inline‑editable Description and Start Date
- Prompt: “In the same file, add two fields below the top grid (aligned to screenshot):
  - `Description`: `InlineTextarea` bound to `description`.
  - `Start Date`: `InlineDate` bound to `startDate` (ISO `YYYY-MM-DD`). Ensure parse/format functions convert safely and treat empty as `null` to clear the date.
  - Use existing typography and spacing; do not introduce a new card.”

Step 2.3 — Inline‑editable Estimated Hours (if present)
- Prompt: “If `project.estimatedHours` exists on the FE type, add a numeric `InlineText` with `parse` that coerces blank to `undefined` and non-negative integers via `Math.max(0, Number(...))`. Commit to `estimatedHours`. If the type is absent, skip and leave a code comment explaining omission.”

Step 2.4 — Capability guard
- Prompt: “Respect capabilities: if a user cannot edit projects (check existing `useCapabilities()` or equivalent), render display-only spans and hide interactive affordances. Do not duplicate capability logic; use the same predicate across all inline fields.”

Step 2.5 — Remove the ‘Edit’ button
- Prompt: “Remove the `<Link to={/projects/${project.id}/edit}>Edit</Link>` button from `ProjectDetailsPanel.tsx`. Do not remove the delete button.”

---

## Phase 3 — Embed Pre‑Deliverable Settings in Details

Step 3.1 — Render existing card in details
- Prompt: “In `ProjectDetailsPanel.tsx`, import `ProjectPreDeliverableSettings` and render it below the Deliverables section (after `deliverablesSlot`), inside the same scrolling column. Pass `project.id` as `projectId`. No conditional rendering beyond `project.id` existence.”

Step 3.2 — Visual alignment
- Prompt: “Ensure the card uses its own internal `Card` styling; only add a surrounding container `div` with top margin consistent with neighboring sections (e.g., `mt-4`).”

---

## Phase 4 — Deep‑linking and Route Cleanup

Step 4.1 — Add selection via query param
- Prompt: “Edit `frontend/src/pages/Projects/list/hooks/useProjectSelection.ts` to optionally initialize selection from a `projectId` query parameter: on first load, read `new URLSearchParams(window.location.search).get('projectId')`, find that project in `sortedProjects`, and set it as selected. Preserve current keyboard behavior. Keep the logic minimal and side‑effect free after initial selection.”

Step 4.2 — Redirect legacy edit route to details
- Prompt: “Edit `frontend/src/main.tsx`: replace the `projects/:id/edit` route element that currently renders `ProjectForm` with a small component that reads `id` and immediately navigates to `/projects?projectId=${id}` using `<Navigate replace>`. Keep the `projects/new` route intact.”

Step 4.3 — Deprecate or remove `ProjectForm.tsx`
- Prompt: “Delete only the edit pathway usage. Keep the file for ‘create’ if it’s shared. If the file is shared for both new/edit, refactor so the ‘edit’ code path is unreachable, and leave a TODO header comment explaining the deprecation and final removal plan.”

---

## Phase 5 — Backend Coordination Checks

Step 5.1 — Serializer parity and casing
- Prompt: “Open `backend/projects/serializers.py` and confirm fields serialize to FE expectations (`project_number` ↔ `projectNumber`, `start_date` ↔ `startDate`, etc.). If any field is missing or renamed, adjust serializer or FE types to match. Do not create ad‑hoc mapping layers.”

Step 5.2 — ETag/If‑Match behavior
- Prompt: “Confirm typed client injects `If-Match` for project updates (see `frontend/src/api/client.ts`). If not stored for project detail, seed a GET before PATCH (the client already handles this; do not duplicate it in hooks).”

---

## Phase 6 — Tests (AI‑Agent Runnable)

Step 6.1 — Unit tests for InlineEdit primitives
- Prompt: “Add `frontend/src/components/ui/__tests__/InlineEdit.test.tsx` using Vitest + React Testing Library. Cover: toggling edit mode, commit on Enter and on blur, cancel on Escape, disabled mode, and parsing/formatting. Keep tests focused and independent of network.”

Step 6.2 — ProjectDetailsPanel interaction tests
- Prompt: “Add `frontend/src/pages/Projects/list/components/__tests__/ProjectDetailsPanel.inline.test.tsx` that renders the panel with a fake project and mocks `useInlineProjectUpdate` to capture commits. Verify commits for name, client, projectNumber, description, startDate. Assert no renders of the old ‘Edit’ link.”

Step 6.3 — Redirect test
- Prompt: “Add a router test in `frontend/src/main.redirect.test.tsx` to ensure navigating to `/projects/123/edit` triggers a redirect to `/projects?projectId=123`.”

Step 6.4 — Pre‑deliverable smoke test
- Prompt: “Mock `projectSettingsApi.get` and render `ProjectPreDeliverableSettings` inside ProjectDetailsPanel. Assert rows render and Save button calls `update` with correct payload.”

Step 6.5 — Type and lint checks
- Prompt: “Run typecheck and lints. Fix only issues introduced by this change. Do not refactor unrelated areas.”

---

## Phase 7 — Manual QA Checklist

Step 7.1 — End‑to‑end flows
- Prompt: “Run the app. On Projects page: select a project; edit Name/Client/Project Number/Description/Start Date inline; confirm values persist after reload. Toggle Status via existing dropdown. Validate optimistic updates and that errors surface via toasts.”

Step 7.2 — Pre‑Deliverable Settings in context
- Prompt: “On the same details panel, modify Pre‑Deliverable Settings and Save. Confirm a subsequent reload shows persisted changes and that Deliverables still function as before.”

Step 7.3 — Legacy route
- Prompt: “Hit `/projects/:id/edit` in the address bar. Confirm redirect to `/projects?projectId=:id` and that the matching project is selected.”

Step 7.4 — Observability
- Prompt: “Track metrics for inline commits (success/fail, field, latency) and deep‑link filter adjustments using the existing monitoring utility. No new dependencies.”

---

## Phase 8 — Cleanups and Documentation

Step 8.1 — Remove dead ‘Edit’ references
- Prompt: “Search for links to `/projects/:id/edit` and delete them. Keep ‘new’ route links.”

Step 8.2 — Update README/Docs
- Prompt: “In `README.md` or a relevant docs page, replace references to the dedicated Project Edit page with the inline editing instructions. Note the deep link format `?projectId=`.”

---

## Implementation Notes (Lean Practices)
- Keep changes narrowly scoped to Project Details; do not generalize beyond what’s used.
- Avoid introducing new state managers or heavy abstractions; simple local state per inline control is enough.
- Preserve accessibility: labels, aria attributes, keyboard edit/commit/cancel.
- Respect existing optimistic update and ETag concurrency flows—do not duplicate logic.
- Defer expensive lists (client suggestions) until focus and cache in memory for the session.

---

## Rollout Strategy
- Default to inline edit enabled. Keep the legacy route as a redirect for one release. After validation, remove the edit route entirely and, if possible, delete the edit code path from `ProjectForm.tsx`.

---

## Addendum — Hardening Updates (Required)

The following updates refine and strengthen the original plan based on repository analysis, preventing edge‑case failures and ensuring a clean rollout. Treat these as authoritative replacements/additions to the relevant phases/steps above.

### Phase 1 — Building Blocks

- Replace Step 1.3 — Clients suggestions
  - Prompt: “Prefer `projectsApi.listAll()` to build the unique client list in memory and cache it for the session. If `listAll` is too heavy in your environment, start with page 1 and lazily fetch remaining pages on demand. Do not block inline editing on suggestions.”

- Add Step 1.4 — Commit safety, parsing, and error semantics
  - Prompt: “In `InlineText`, `InlineTextarea`, and `InlineDate`:
    - Commit only when the `draft` value differs from the original (avoid chatty PATCHes on blur).
    - Strings: trim before commit. Empty string remains empty for free‑text fields; for date, commit `null` when cleared.
    - Date: treat as plain `YYYY-MM-DD` string; do not instantiate Date objects or apply timezone conversions.
    - Numbers (e.g., `estimatedHours`): coerce to integer, clamp to `>= 0`; cancel if `NaN`.
    - Error handling: rely on `apiClient` to toast 412/401; only toast for other errors via `friendlyErrorMessage`. Do not duplicate 412 toasts.”

- Add Step 1.5 — Serialize per‑project commits
  - Prompt: “Implement a minimal in‑memory mutex keyed by `projectId` inside `useInlineProjectUpdate`. Queue concurrent commits for the same project to avoid PATCH races and redundant 412 retries during rapid multi‑field edits. Keep it lean (no external deps).”

- Clarify Step 1.3 — Practical caching
  - Prompt: “Cache the client list with a module‑local variable and a timestamp (TTL ~10 minutes). For large datasets, defer fetching additional pages until the user types the second character.”

### Phase 2 — Inline Editing in Details

- Replace Step 2.4 — Capability guard
  - Prompt: “Use `useAuth()` to gate editing permission. General project field edits are allowed for authenticated users unless your policy says otherwise. For Pre‑Deliverable settings, updates require `user?.is_staff`; when not staff, render the card read‑only and disable Save with an explanatory tooltip. Do not use `useCapabilities()` for auth.”

- Add Step 2.6 — Keep details in sync after updates
  - Prompt: “Update `frontend/src/pages/Projects/list/hooks/useProjectSelection.ts` to store `selectedProjectId` (and `selectedIndex` as a fallback) and derive `selectedProject` from `sortedProjects` on list changes. Always key by `projectId` and ignore index unless id is absent. This ensures inline edits reflect immediately in the right panel and prevents selection jumping when sort changes.”

- Add Step 2.7 — Remove Edit link and dead imports
  - Prompt: “Delete the Edit link in `ProjectDetailsPanel.tsx` and remove the unused `Link` import. Preserve Delete button behavior.”

- Add Step 2.8 — Field‑level error surfaces
  - Prompt: “Show inline error text adjacent to each edited control when a commit fails (e.g., ‘Project Number must be unique’). Clear the error as soon as the user changes the draft value. Reserve global toasts for unexpected errors only.”

- Add Step 2.9 — Focus management and ARIA confirmations
  - Prompt: “After commit or cancel, return focus to the display element; announce success/failure via an `aria-live="polite"` region. Ensure Enter commits and Escape cancels across all inline controls without conflicting with grid keyboard handlers.”

- Add Step 2.10 — Optimistic rollback clarity
  - Prompt: “If a commit fails, immediately revert the visible value to the last server‑truth. Maintain the user’s draft only within the control until blur completes to avoid ‘ghost’ states.”

- Add Step 2.11 — Status dropdown coherence
  - Prompt: “When `selectedProject` changes (id or status), ensure the status dropdown closes automatically to prevent cross‑project interactions with an open menu.”

### Phase 3 — Pre‑Deliverable in Details

- Add Step 3.3 — Permission‑aware Save
  - Prompt: “In `ProjectPreDeliverableSettings.tsx`, use `useAuth()`; disable Save for non‑staff and show a tooltip. Expect 403 on backend when unauthorized; avoid relying on error for UX.”

- Add Step 3.4 — Resilient loading and saving
  - Prompt: “If loading or saving fails, show a clear inline error with a Retry button. Ensure requests are idempotent and re‑fetch after save succeeds. Never mask errors; do not auto‑retry silently.”

### Phase 4 — Deep‑Linking and Routing

- Replace/expand Step 4.1 — Selection via query param with filter alignment
  - Prompt: “In `ProjectsList.tsx`, if `projectId` is present but the project is not visible due to filters/search, perform a one‑time adjustment: clear search, switch to ‘Show All’ status. To support this, extend `useProjectFilters` to expose a programmatic setter (e.g., `forceShowAll()` or `setSelectedStatusFilters`). Then re‑attempt selection. Optionally show a one‑time inline banner: ‘Filters adjusted to show requested project.’ Do not repeatedly mutate filters.”

  - Guard: “Run this adjustment only after projects load and only once per navigation (use a ref flag). Never loop or toggle filters repeatedly.”

- Clarify Step 4.2 — Edit route redirect
  - Prompt: “Keep `projects/new` mapped to `ProjectForm` for creating. For `projects/:id/edit`, return `<Navigate replace to={\`/projects?projectId=${id}\`} />` and remove the `ProjectForm` import on that route.”

- Add Step 4.4 — Prefetch alignment
  - Prompt: “Update `frontend/src/routes/prefetch.ts` to stop prefetching `ProjectForm` for edit paths. Optionally prefetch `/projects` instead when such a path is encountered.”

  - Clarify: “Record a lightweight perf breadcrumb when an edit path triggers a Projects prefetch to validate redirect performance.”

- Add Step 4.5 — Deep‑link not‑found behavior
  - Prompt: “If the target `projectId` is not present in the dataset (deleted or unauthorized), show a non‑blocking banner ‘Project not found’ and avoid changing filters.”

### Phase 5 — Backend Coordination

- Add Step 5.3 — Required fields alignment
  - Prompt: “Do not enforce stricter validation than backend. `client` is optional server‑side; allow blank in inline edits. Keep `name` required.”

- Add Step 5.4 — Uniqueness errors surfaced clearly
  - Prompt: “When `projectNumber` conflicts (unique index), ensure the UI surfaces a clear message using `friendlyErrorMessage`. If the default mapper doesn’t include a field‑specific string, fall back to ‘Project Number must be unique.’ Do not add ad‑hoc mapping layers elsewhere.”

### Phase 6 — Tests

- Add Step 6.2.1 — Right‑panel resync test
  - Prompt: “Assert that after an inline commit (e.g., name), the details panel re‑renders with updated data without re‑selecting the project.”

- Add Step 6.6 — Deep‑link filter adjustment test
  - Prompt: “Simulate entering `/projects?projectId=<id>` with filters excluding the project; verify a one‑time filter reset to ‘Show All’ and auto‑selection of the target.”

- Add Step 6.7 — E2E coverage with Playwright
  - Prompt: “Automate deep‑link redirect + selection; inline edit for name/client/number/date with commit and failure rollback; and permission behavior for Pre‑Deliverables (staff vs. non‑staff). Keep tests lean and deterministic.”

### Phase 8 — Cleanups

- Add Step 8.3 — Remove dead prefetch logic
  - Prompt: “Remove any remaining edit‑route prefetch rules from `prefetch.ts` and ensure no edit links remain anywhere.”

- Add Step 8.4 — Operator notes and docs
  - Prompt: “Document deep‑link behavior, filter reset rules, permission boundaries (who can edit fields vs. Pre‑Deliverables), and common error recoveries (e.g., uniqueness conflicts). Keep it concise and accurate.”
