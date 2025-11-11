Utilization Scheme (Hour Range Color Mapping)

Overview
- Purpose: unify utilization coloring across the app using fixed, editable hour ranges.
- Defaults (inclusive):
  - Blue: 1–29h
  - Green: 30–36h
  - Orange: 37–40h
  - Red: ≥41h
  - Zero hours: blank label when `zero_is_blank = true` (default)

Backend
- Model: `core.models.UtilizationScheme`
  - Fields: `mode` (`absolute_hours|percent`), `blue_min/blue_max`, `green_min/green_max`, `orange_min/orange_max`, `red_min`, `zero_is_blank`, `version`, `updated_at`.
  - Validation: contiguous, non-overlapping, ordered ranges; lower bounds ≥ 1.
  - Singleton accessor: `UtilizationScheme.get_active()` creates defaults if missing.

- API: `/api/core/utilization_scheme/`
  - GET: returns the current scheme with `version` and `updated_at`, sets `ETag` and `Last-Modified`.
    - When feature flag `UTILIZATION_SCHEME_ENABLED` is False, returns default values (read-only output) while still emitting a valid ETag.
    - Supports `If-None-Match` → `304 Not Modified`.
  - PUT: admin-only, requires `If-Match` ETag, validates payload, bumps `version`, audit-logs before/after; returns `412` on mismatch.

- Feature Flag & Rollback
  - `settings.FEATURES['UTILIZATION_SCHEME_ENABLED'] = True` (default).
  - When False: GET returns defaults (read-only), PUT returns `403`.
  - Rollback options:
    1) Set the feature flag to `False` to freeze reads at defaults.
    2) Restore a prior scheme JSON via management command: `python manage.py load_utilization_scheme --file scheme.json`.

- Management Commands
  - Dump: `python manage.py dump_utilization_scheme --file scheme.json`
  - Load: `python manage.py load_utilization_scheme --file scheme.json`
    - Validates ranges and increments `version` upon save.

- Observability & Guardrails
  - Dashboard classification clamps negative allocated hours to 0 and logs a warning (`monitoring` logger).
  - Percent mode safely falls back to thresholds (70/85/100) if used.

Frontend
- Unified Util Helpers: `frontend/src/util/utilization.ts`
  - `resolveUtilizationLevel({ hours, capacity, percent, scheme })`
  - `utilizationLevelToClasses(level)` → Tailwind classes for pills/badges
  - `utilizationLevelToTokens(level)` → `{ bg, text, border? }` tokens for dark theme components
  - `formatUtilizationLabel(hours, zeroIsBlank)`
  - `getUtilizationPill({ hours, capacity, scheme, output: 'classes'|'token' })`

- Dual Output Guidance
  - Tailwind pills/badges (e.g., Assignments, list chips): use `output: 'classes'`.
  - Token consumers (e.g., heatmaps, compact strips): use `output: 'token'`.

- Settings UI
  - `Settings → Utilization Scheme` editor provides client-side validation and a live preview of sample hours (0, 15, 30, 36, 37, 40, 41).
  - Saving requires admin and uses ETag to prevent overwrites.

- OpenAPI Types
  - Regenerate types for the endpoint when backend changes: from `frontend/` run
    - `npm run openapi:regen`

Testing & Verification
- Backend: unit tests for model validation, API ETag handling, classification boundaries, and dump/load round-trip.
- Frontend: unit tests of boundary classification and zeroIsBlank; manual checks in Assignments, Dashboard, Reports, and Settings preview.

