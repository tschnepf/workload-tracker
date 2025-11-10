# Project Notes – TipTap + JSON (Canonical) Implementation Plan

Purpose: Replace the current scratch‑pad with a robust TipTap editor that stores canonical ProseMirror JSON (`notesJson`) while preserving HTML (`notes`) for backwards compatibility. Follow lean programming best practices: minimal, cohesive changes; explicit interfaces; no shortcuts or band‑aids. Every step below is a prescriptive prompt that can be fed to the AI‑Agent.

---

## Phase 0 — Guardrails & Prereqs

1) Prompt: “Before changing code, scan repo for any existing references to project notes fields (`notes`, `notes_json`, `notesJson`). Produce a short inventory of backend models/serializers/views and frontend components that touch notes. Do NOT modify code in this step.”

2) Prompt: “Adopt lean best practices for this work: keep diffs small and cohesive per step; preserve existing behavior while incrementally introducing new capabilities; never remove working paths until a deprecation plan is executed; avoid speculative features. Confirm understanding.”

---

## Phase 1 — Backend Schema & Serializer

3) Prompt: “Add `notes_json` to `backend/projects/models.py` on `Project` as `models.JSONField(blank=True, null=True)`. Do not change or remove the existing `notes` TextField. Create a new migration `projects.0013_add_notes_json.py` that adds this column.”

4) Prompt: “Update `backend/projects/serializers.py` `ProjectSerializer` to expose a new field `notesJson = serializers.JSONField(required=False, allow_null=True)`. Ensure existing `notes` (HTML) remains exposed. Update `Meta.fields` to include both `notes` and `notesJson`. Keep validation lean: do not coerce formats, accept null. Maintain partial update semantics.”

5) Prompt: “Annotate serializer docstrings: `notesJson` is canonical TipTap JSON; `notes` HTML is deprecated but maintained. Do not introduce server‑side HTML → JSON conversion now.”

6) Prompt: “Run `makemigrations` locally to generate the migration. Validate it only adds the JSON column. Do not modify unrelated models. Provide the migration file path that was created.”

7) Prompt: “Apply migrations in dev: `python manage.py migrate`. Confirm the new column exists. Do not proceed until DB is in sync.”

---

## Phase 2 — OpenAPI & Typed Frontend Models

8) Prompt: “Regenerate OpenAPI schema (`backend/openapi.json`) and ensure `Project` now includes `notesJson` (JSON) and `notes` (string). Address naming or enum warnings only if related; do not refactor unrelated endpoints.”

9) Prompt: “Regenerate frontend typed API/schema if used. Update `frontend/src/types/models.ts` `Project` interface to include `notesJson?: any`. Keep `notes?: string`.”

---

## Phase 3 — Frontend Dependencies (TipTap)

10) Prompt: “Add TipTap dependencies to `frontend/package.json`:
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-text-align`, `@tiptap/pm`, and `dompurify`.
Run `npm install`. Do not add unused extensions.”

11) Prompt: “Build frontend to verify dependency graph compiles (`npm run build`). Do not continue if build fails.”

---

## Phase 4 — TipTap Editor Component

12) Prompt: “Create `frontend/src/components/projects/ProjectNotesEditor.tsx` implementing a TipTap editor:
- Initialize with `content`: prefer `initialJson` (ProseMirror JSON). If absent, fallback to `initialHtml`.
- Extensions: `StarterKit`, `Underline`, `Link`, `Placeholder('Write notes…')`, `TextAlign({ types: ['heading', 'paragraph'] })`.
- Toolbar: Bold, Italic, Underline, Bullet List, Ordered List, Blockquote, H1/H2/H3, Align left/center/right, Undo/Redo.
- Debounced dirty state via `onUpdate` (≈250ms).”

13) Prompt: “Sanitize only the HTML when saving: `const html = DOMPurify.sanitize(editor.getHTML())`. Extract JSON: `const json = editor.getJSON()`. Send both in a single PATCH: `{ notesJson: json, notes: html }` via `projectsApi.update(id, payload)`. Never sanitize or mutate JSON; sanitation is applied to HTML only.”

14) Prompt: “Keyboard behavior: ensure TipTap default keymaps are active (Tab/Shift‑Tab indent/outdent within lists; Enter behaviors). Stop propagation of keys to parent grids/shortcuts while editor focused. Maintain accessibility: `role="textbox" aria-multiline="true"`.”

15) Prompt: “Styling: add basic ProseMirror styles to `frontend/src/index.css` under a `.ProseMirror` or `.pm-editor` scope. Ensure `ul/ol` use `list-style: disc/decimal` with left padding, H1–H3 spacing, code/blockquote visual parity with current theme variables. Keep styles minimal and theme‑aware.”

---

## Phase 5 — Integration Into Project Details

16) Prompt: “Replace the current scratch pad in `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx` with `ProjectNotesEditor`:
- Props: `projectId`, `initialHtml={(project as any).notes}`, `initialJson={(project as any).notesJson}`, `canEdit` (based on auth). 
- Remove or bypass the old scratch pad component. Keep surrounding layout unchanged.”

17) Prompt: “Run a frontend build. Fix any type or import errors introduced by integration. Do not change unrelated components.”

---

## Phase 6 — Testing (Backend + Frontend)

18) Prompt: “Backend tests — add or extend tests to validate:
- PATCH /api/projects/{id}/ with only `notesJson` succeeds and persists JSON.
- PATCH with only `notes` succeeds and persists HTML.
- PATCH with both persists both; subsequent GET returns both.
- Serializer rejects neither null nor unknown keys (lean schema).
Keep tests focused; do not refactor APIs.”

19) Prompt: “Frontend tests — add lightweight tests:
- Editor initializes from JSON; when absent, from HTML.
- Toggling Bullet/Ordered list updates JSON structure and HTML string (contains `<ul><li>` or `<ol><li>`).
- Save emits a PATCH containing both `notesJson` and sanitized `notes`.
Use component tests or integration tests as appropriate. Avoid brittle snapshot testing for full HTML.”

20) Prompt: “Manual QA script:
- Open a project; verify existing HTML notes render.
- Type text, toggle Bullet and Numbered lists; use Tab/Shift‑Tab to indent/outdent.
- Save; refresh; confirm content persists. Inspect network payload for both fields.
- Remove all content; save; confirm fields can be null/empty without errors.”

---

## Phase 7 — Deployment & Migrations

21) Prompt: “Dev migration: run `python manage.py migrate`. Confirm `notes_json` exists. Build frontend, launch app. Verify Project details render TipTap and save works.”

22) Prompt: “Prod migration plan:
- Rebuild backend image to include the migration file.
- With `RUN_MIGRATIONS_ON_START=true`, restart backend (or run `manage.py migrate`).
- Rebuild frontend image with TipTap deps.
- Post‑deploy smoke: open a project, type a bullet list, save, refresh.”

---

## Phase 8 — Optional Backfill & Deprecation

23) Prompt: “(Optional) Create a management command that backfills `notes_json` from existing `notes` (HTML): use a safe client‑side converter or a small Node utility with TipTap server‑side. Run in batches; dry‑run first. Do not run automatically.”

24) Prompt: “(Optional) Mark `notes` HTML as deprecated in API docs. Plan eventual read‑only of `notes` after adoption metrics indicate JSON is in steady use. Do not remove `notes` until consumers are audited.”

---

## Phase 9 — Future Enhancements (Out of Scope for MVP)

25) Prompt: “Collect requirements for attachments, checklists, @mentions, and collaborative editing. Do not implement in this phase. Record as future items.”

26) Prompt: “Evaluate richer security: server‑side HTML sanitization/allowlist if HTML rendering occurs outside the editor. Ensure CSP headers prevent risky inline scripts. Do not change CSP in this phase.”

---

## Success Criteria

- Project model exposes `notes_json` and continues to accept/serve `notes` HTML.
- TipTap editor loads JSON (preferred) or HTML (fallback), and saves both.
- Bullet/numbered lists, indentation, and core formatting work reliably.
- Backend and frontend builds pass; migrations applied safely; manual and automated tests green.

---

## Rollback Plan

- If issues arise, revert the UI to the previous scratch‑pad component and stop writing `notesJson`. Keep `notes` HTML as the active field. Migration is additive and safe to keep in place.

## Adjustments & Safeguards (Must-Do Refinements)

- Serializer mapping: expose `notesJson` with an explicit source mapping so API camelCase maps to the DB column
  - `notesJson = serializers.JSONField(source='notes_json', required=False, allow_null=True)`

- Migration ordering: since `0012_add_project_notes` already exists, add JSON as `0013_add_notes_json`. Verify only the new column is added.

- OpenAPI + Types in lockstep: after regenerating `backend/openapi.json`, also regenerate the frontend typed client (if used) and update `frontend/src/types/models.ts` to include `notesJson?: any`. Search the repo for `notesJson` to confirm consistent usage.

- TipTap toolbar focus: use BubbleMenu/FloatingMenu or prevent `mousedown` default on custom buttons so selection/focus is retained when toggling lists/formatting.

- Editor key handling: stop key event propagation while the editor is focused so app-level shortcuts and grid key handlers do not interfere.

- Styling scope: ensure bullets/numbering render by scoping styles under `.ProseMirror`/`.pm-editor` (e.g., `ul { list-style: disc; padding-left: 1.25rem }`, `ol { list-style: decimal; ... }`).

- Save contract: always send both fields on save — canonical `notesJson` (unsanitized) and sanitized `notes` HTML.

- Concurrency: keep ETag/If-Match behavior for `projectsApi.update`. On `412 Precondition Failed`, show a friendly message and prompt to reload/merge.

- Deploy order: enable `RUN_MIGRATIONS_ON_START=true` only on the backend; restart order is backend (migrates) → worker/beat → frontend. Confirm via `showmigrations` that `0013` applied.

- Size & telemetry (optional but recommended): log a warning for unusually large notes payloads; capture minimal error telemetry on save failures (status, size bins) to detect regressions post-deploy.

*** End of Plan ***
