# Utilization Range Color Mapping — Implementation Plan (Cleaned)

Goal: Switch utilization coloring to fixed hour ranges (blue 1–29, green 30–36, orange 37–40, red ≥ 41), make the ranges editable from Settings, and apply consistently across Assignments, Heatmap, Dashboard, Reports, and badges. The work must be lean, centralized, and fully coordinated between backend and frontend—no one‑off hacks.

Canonical boundary semantics (inclusive):
- Blue: 1–29
- Green: 30–36
- Orange: 37–40
- Red: ≥ 41
- Zero: exactly 0; render blank if `zeroIsBlank = true`, otherwise use a neutral “zero” level

Pill dimensions (all uses):
- Use a fixed shell: `inline-flex items-center justify-center h-6 px-2 min-w-[40px] rounded-full text-xs font-medium text-center`
- Neutral classes for empty/zero: `bg-[var(--surface)] text-[var(--muted)] border border-[var(--borderSubtle)]` (or `text-transparent` if preferred)

Phases
- 0) Preflight & Repo Alignment (encoding cleanup + inventory)
- 1) Centralize Mapping (discovery + design)
- 2) Backend Support (model + API + validation)
- 3) Frontend Data Flow (fetch/store + settings UI)
- 4) Frontend Rendering Unification (one mapper everywhere)
- 5) Migrate Features/Pages
- 6) Testing & Verification
- 7) Rollout, Docs, and Guardrails

Each step below is a prescriptive prompt you can paste back to the AI agent. Steps are intentionally small to avoid risky changes and keep implementation lean and reversible.

---

## Phase 0 — Preflight & Repo Alignment

Step 0.1 — Encoding cleanup and guardrail checklist

Prompt:
- Run repo encoding scanners to find and remove replacement characters (e.g., U+FFFD) so new strings/tooltips don’t propagate artifacts. Use the existing helper scripts at repo root (e.g., `scan_fffd.js`, `fix_all_fffd.js`) and re‑scan until clean.
- Produce a utilization‑related inventory with ripgrep for all current color thresholds and usages. Save it as an artifact (e.g., `security/utilization-color-inventory.txt`) to drive the migration and later assert cleanup.
- Define a PR checklist item: “No stray hardcoded percent thresholds (70/85/100) or ad‑hoc color branches remain in utilization rendering paths.”

Step 0.2 — Rollout flag naming and defaults

Prompt:
- Add a feature flag consistent with existing settings: `FEATURES['UTILIZATION_SCHEME_ENABLED'] = True`. When False, the API should serve defaults via GET and reject writes via PUT (403) while the frontend falls back to baked‑in defaults.

---

## Phase 1 - Centralize Mapping (Discovery + Design)

Step 1.1 — Inventory all utilization color usages

Prompt:
- Search the repo for every usage that colors utilization by percent or hours. Produce a checklist of files and exact lines to change. Include: Assignments grids, Project grid, Dashboard (heatmap and summary), Reports, UtilizationBadge, MyScheduleStrip, CapacityTimeline, and any ad hoc color logic.
- Run ripgrep queries for: `UtilizationBadge`, `utilization`, `utilization_percent`, `peak_utilization`, `getUtilizationBadgeStyle`, `amber|emerald|red|blue`, `heatmap`, `capacity`.
- Output a consolidated list with file:line and a one-line summary per hit. Do not change code yet.
- Deliver a PR checklist asserting “no stray hardcoded thresholds remain” after migration.

Step 1.2 — Draft the unified mapping contract

Prompt:
- Propose a TypeScript contract for a `UtilizationScheme` supporting hour/percent modes:
  - `mode: 'absolute_hours' | 'percent'` (default `absolute_hours`).
  - `ranges: Array<{ id: 'blue'|'green'|'orange'|'red', min: number, max?: number }>` (ordered, contiguous, non-overlapping; `max` optional for open upper bound).
  - `zeroIsBlank: boolean` (default true).
- Define helpers (signatures only for now):
  - `resolveUtilizationLevel({ hours, capacity, scheme }): 'empty'|'blue'|'green'|'orange'|'red'` (interprets by mode; clamps negatives to 0; handles missing capacity safely; percent fallback specified below).
  - `utilizationLevelToClasses(level): string` returning Tailwind classes aligned to theme.
  - `utilizationLevelToTokens(level): { bg: string; text: string; border?: string }` returning token/hex CSS values for darkTheme‑driven components.
  - `formatUtilizationLabel(hours, zeroIsBlank): string` returning `"Nh"` or empty.
  - `getUtilizationPill({ hours, capacity, scheme, output }: { output: 'classes'|'token' })` returning `{ level, classes? string, tokens? object, label }`.
- Percent fallback policy: when `mode='absolute_hours'` but only percent exists (and `capacity` is missing), classify via a default percent scheme (matching current behavior: `<=70`, `<=85`, `<=100`, `>100`).
- Return design and signatures for approval; do not write code yet.

---

## Phase 2 — Backend Support (Model + API + Validation)

Step 2.1 — Add UtilizationScheme model and migration (singleton)

Prompt:
- In `backend/core/models.py`, add a `UtilizationScheme` singleton model with fields:
  - `mode` (choices: `absolute_hours`, `percent`; default `absolute_hours`).
  - `blue_min`, `blue_max`, `green_min`, `green_max`, `orange_min`, `orange_max`, `red_min` (integers; `red_min` is lower bound for open-ended).
  - `zero_is_blank` (bool, default True).
  - `version` (positive integer, starts at 1), `updated_at` (auto_now).
- Add model `clean()` that enforces contiguous, non-overlapping, ordered ranges and `min <= max`.
- Constraints: keep DB‑level checks portable (SQLite + Postgres). Do NOT encode contiguity as equality constraints in the DB. Limit DB constraints to monotonic bounds (`min <= max`) and enforce contiguity/overlap/order rules in `clean()` and the serializer. Enforce singleton via a unique constraint (e.g., constant slug or primary key) and add a safe getter to auto‑create defaults.
- Create an initial data migration with defaults: blue=1–29, green=30–36, orange=37–40, red=41+, `zero_is_blank=True`, `version=1`.
- Ensure a safe getter always returns a scheme (auto-create defaults if missing) to prevent 404s.

Step 2.2 — Expose DRF API endpoints with ETag/If-Match

Prompt:
- In `backend/core/serializers.py`, add `UtilizationSchemeSerializer` mirroring the validation in `clean()` (reject gaps, overlaps, invalid order).
- In `backend/core/views.py`, add `UtilizationSchemeView` with:
  - `GET /api/utilization_scheme/` returns the single scheme with `version` and `updated_at` and sets `ETag`.
  - `PUT` requires `IsAdminUser`, compares `If-Match` ETag, and increments `version` on success; otherwise 412.
  - On PUT, write an AdminAuditLog entry with before/after diff.
- Mount in `backend/core/urls.py` at `/api/utilization_scheme/`.
- Update `backend/openapi.json` via spectacular; document fields, defaults, and ETag usage.
- Regenerate the typed client in `frontend/src/api/schema.ts` (openapi‑typescript) so the frontend can consume the endpoint without drift.

Step 2.3 — Apply scheme server-side

Prompt:
- Update `backend/dashboard/views.py` to compute distribution buckets using the active `UtilizationScheme` when `mode='absolute_hours'`. For `percent`, use capacity-based conversion or percent thresholds if defined (document fallback when capacity missing/zero).
- Keep response fields unchanged; only classification logic changes.
- Add simple in-process caching (e.g., 60s TTL) for the scheme to avoid hot-path DB hits.
- Add unit tests that classify 0, 1, 29, 30, 36, 37, 40, 41 correctly.

Step 2.4 — Backup/restore utilities

Prompt:
- Add management commands:
  - `dump_utilization_scheme --file path.json`
  - `load_utilization_scheme --file path.json` (validates then saves; bumps version)
- Document rollback using these commands.

---

## Phase 3 — Frontend Data Flow (Fetch/Store + Settings UI)

Step 3.1 — Client types and scheme store

Prompt:
- Generate typed client bindings for `/api/utilization_scheme/` (GET/PUT) in the existing API layer.
- Add `frontend/src/state/utilizationScheme.ts` with:
  - `scheme`, `loading`, `error`, `version`.
  - `loadScheme()` reads once on app init; `saveScheme(next)` sends `If-Match` ETag and handles 412 by refetch + notify.
  - Expose a selector that returns a memoized function `resolveUtilizationLevel` bound to the current scheme.

Step 3.2 — Settings UI (editable + preview)

Prompt:
- In `frontend/src/pages/Settings/Settings.tsx`, add a “Utilization Scheme” section using `frontend/src/components/settings/UtilizationSchemeEditor.tsx`.
- The editor must provide:
  - Inputs for blue 1–29, green 30–36, orange 37–40, red ≥ 41; toggle `zeroIsBlank`.
  - Strict client-side validation mirroring backend; disable Save until valid.
  - Live preview row of pills: 0, 15, 30, 36, 37, 40, 41 using the same util module.
- On Save: call `saveScheme(next)`, then reload store state and toast success; handle 412 with a friendly retry prompt.
- If feature flag is off or user is not admin: render read-only view with defaults and disabled controls.

---

## Phase 4 — Frontend Rendering Unification

Step 4.1 — Implement the unified util

Prompt:
- Add `frontend/src/util/utilization.ts` implementing:
  - `resolveUtilizationLevel({ hours, capacity, scheme })` with exact boundary handling and safe fallbacks (clamp negatives; if capacity missing in percent mode, return 'empty').
  - `utilizationLevelToClasses(level)` returning theme-aligned classes for `blue|green|orange|red|empty`.
  - `formatUtilizationLabel(hours, zeroIsBlank)` returning `"Nh"` or empty.
- Export `getUtilizationPill({ hours, capacity, scheme })` returning `{ level, classes, label }`.
- Add unit tests for boundary values.

Step 4.1a — Dual outputs and pill API

Prompt:
- Add `utilizationLevelToTokens(level)` returning `{ bg, text, border? }` for darkTheme/token consumers.
- Update the exported helper to `getUtilizationPill({ hours, capacity, scheme, output })` where `output` is `'classes'|'token'`, returning `{ level, classes?|tokens?, label }`.

Step 4.2 — Remove ad-hoc logic and standardize pills

Prompt:
- Replace local coloring functions in:
  - `frontend/src/pages/Assignments/AssignmentGrid.tsx`
  - `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`
  - `frontend/src/components/ui/UtilizationBadge.tsx` (support Deprecated `percentage` prop by routing via scheme mode; keep backwards compatibility).
  - `frontend/src/pages/Dashboard.tsx` (heatmap + summary chips)
  - `frontend/src/pages/Departments/ReportsView.tsx`
  - `frontend/src/pages/Projects/ProjectsList.tsx`
  - `frontend/src/components/personal/MyScheduleStrip.tsx`
  - `frontend/src/components/charts/CapacityTimeline.tsx`
- Ensure all pills use the fixed shell classes and the util for classes/labels.
- Delete or deprecate old helpers like `getUtilizationBadgeStyle`.

Step 4.2a — Token consumers and output selection

Prompt:
- For Tailwind pills/badges, use `output: 'classes'`.
- For darkTheme/inline‑token heatmaps and strips, use `output: 'token'` (e.g., `frontend/src/components/dashboard/CapacityHeatmap.tsx`, `TeamHeatmapCard.tsx`, `CompactHeatStrip.tsx`).

---

## Phase 5 — Migrate Features/Pages

Step 5.1 — Assignments (people + projects views)

Prompt:
- Update both grids to use `getUtilizationPill()` for weekly totals and any badges; zero hours render blank text with fixed-size pills. Remove duplicate logic.

Step 5.2 — Dashboard (overview + heatmap + cards)

Prompt:
- Update heatmap color computation to use the unified util in `absolute_hours` mode. If only percent arrives and capacity is present, compute hours via `capacity * percent / 100`; if capacity missing, fall back to `percent` mode cleanly.
- Update distribution/summary chips to use `utilizationLevelToClasses`.
- Memoize a classifier closure derived from the current scheme and reuse it in render loops (heatmap cells, grid badges) to avoid per‑cell recomputation.

Step 5.3 — Reports, Projects list, personal components

Prompt:
- Replace percent-threshold CSS branches and any hardcoded color logic with the util across:
  - `frontend/src/pages/Departments/ReportsView.tsx`
  - `frontend/src/pages/Projects/ProjectsList.tsx`
  - `frontend/src/components/personal/MyScheduleStrip.tsx`
  - `frontend/src/components/ui/UtilizationBadge.tsx`
- Ensure all pull the scheme from the store and memoize derived functions.

---

## Phase 6 — Testing & Verification

Step 6.1 — Backend tests

Prompt:
- Unit tests for `UtilizationScheme.clean()` (gaps, overlaps, unordered bounds, invalid mins/maxes).
- API tests: GET/PUT, permissions, validation errors, ETag 412 conflict, version increments.
- Dashboard classification tests for boundary set: 0, 1, 29, 30, 36, 37, 40, 41.
- Management command tests for dump/load round-trip.

Step 6.2 — Frontend tests + manual checks

Prompt:
- Add unit tests for `utilization.ts` covering boundary values and `zeroIsBlank=true|false`.
- Manual checks:
  - Assignments (People view): zero totals show blank ovals with identical size; 15h blue, 30h green, 37h orange, 41h red.
  - Dashboard heatmap: colors match hour ranges; tooltips remain accurate.
  - Settings: adjust green to 32–38; confirm live preview; Save; all pages update without reload issues.
- Performance sanity: memoize scheme and classification closures; ensure no extra API calls in render loops.
 - Client typing: after backend changes, regenerate `frontend/src/api/schema.ts` and ensure the app type‑checks/builds.

---

## Phase 7 — Rollout, Docs, and Guardrails

Step 7.1 — Feature flag + rollback

Prompt:
- Add `FEATURES['UTILIZATION_SCHEME_ENABLED'] = True` default. When False: GET returns defaults (read-only); PUT returns 403 with message.
- Document rollback: set flag False, optionally restore previous dump with `load_utilization_scheme`.

Step 7.2 — Docs + Observability

Prompt:
- Create `docs/utilization-scheme.md` with the model, API contract, defaults, validation rules, ETag usage, and examples.
- Add Sentry/log warnings for negative hours or missing capacity encountered during classification (clamp and continue).
- Document the dual output approach (Tailwind classes vs theme tokens) with examples for each consumer, and include an “OpenAPI client regeneration” note.

---

## Definition Of Done

- Default ranges (blue 1–29, green 30–36, orange 37–40, red ≥ 41) active across the app; zero renders blank with consistent pill size.
- Settings page edits the scheme with client+server validation, ETag protection, audit logging, and immediate propagation.
- All pages (Assignments, Dashboard heatmap, Reports, Projects list, badges, personal components) use the shared util; no hardcoded thresholds remain (including 70/85/100 percent checks).
- Backend enforces valid schemes; API documented and tested; backup/restore commands work.
- Visual consistency: pills share identical shell classes; a11y focus rings preserved.
 - Dashboard percent distribution keys remain stable; any new hours buckets are additive.
