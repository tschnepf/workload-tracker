# Workload Tracker — Phased Prompts V2 (Finish Remaining Items)

This V2 plan contains prescriptive, lean prompts to finish the remaining items from the original phased plan. It excludes Phase 10.2 (OpenAPI typed client migration), which will be handled separately.

Principles for every prompt:
- Use lean programming (small, focused diffs). No shortcuts or band-aids.
- Preserve existing behavior and API contracts unless explicitly stated.
- Guard new behavior with feature flags or environment variables where appropriate.
- Add only the minimal docs/tests needed to validate the change.
- Run all commands inside Docker containers (`docker compose exec <service> ...`).

---

## Phase 3 — Backend Performance (Short-TTL Caching for Dashboard)

### Step 3.1 — Add short-TTL caching to Dashboard (feature-flagged)
- Prompt: "Add a short-TTL cache to `backend/dashboard/views.py` for the GET response when `SHORT_TTL_AGGREGATES=true` (use `settings.FEATURES['SHORT_TTL_AGGREGATES']`). Use `cache.get/set` keyed by `(weeks, department)` and a TTL. Prefer reusing `AGGREGATE_CACHE_TTL` and allow `DASHBOARD_CACHE_TTL` to override when present (fallback to `AGGREGATE_CACHE_TTL` or a small default, e.g., 30s). When Redis is unavailable, the configured LocMem cache will be used; fall back gracefully to computation. Do not change response shape. Keep code lean: wrap the final payload in a small cache read/write block; avoid deep refactors."
- Description: Reduce repeated computation and DB hits for a commonly viewed page.
- Testing (AI-Agent)
  - `docker compose exec backend python manage.py check`
  - `docker compose exec backend curl -sS "http://localhost:8000/api/dashboard/?weeks=4" | head -c 120`
  - Toggle `SHORT_TTL_AGGREGATES=true` and repeat; confirm consistent payload. Optionally log timings to verify a hit after first request.

---

## Phase 4 — Frontend UX Consistency

### Step 4.1 — Centralize toasts on remaining pages
- Prompt: "Replace page-local `<Toast>` state renderings with centralized toast bus (`ToastHost` + `showToast`) in Assignments, People, Projects (only where inline, ad-hoc toasts remain). Keep messages and semantics identical. Do not alter unrelated UI. Specifically update `frontend/src/pages/People/PeopleList.tsx`, `frontend/src/pages/Projects/ProjectsList.tsx`, and `frontend/src/pages/Assignments/AssignmentGrid.tsx`."
- Notes: App already mounts `ToastHost` globally; prefer `showToast()` over per-page `<Toast>` components.
- Testing (AI-Agent)
  - Build: `docker compose exec frontend npm run -s build`
  - Manual trigger: perform actions that previously showed inline toasts (e.g., assignment save/delete) and confirm toasts still appear.

### Step 4.2 — Timezone/date handling contract + minimal util
- Prompt: "Document the date/time contract: backend emits ISO-8601 UTC (Django `USE_TZ=True`, `TIME_ZONE='UTC'`); frontend formats for display in the user's local time. Add a small utility `frontend/src/utils/dates.ts` with `formatUtcToLocal(iso: string, opts?: Intl.DateTimeFormatOptions)` and use it in 2–3 visible places that render dates (e.g., Dashboard recent assignments, Projects list dates, Deliverables dates). Add `docs/DATE-TIME-CONTRACT.md` with the rules and examples."
- Testing (AI-Agent)
  - `docker compose exec frontend npm run -s build`
  - Verify at least two pages display dates via the new util and match expected local formatting.

---

## Phase 5 — Mobile & A11y

### Step 5.1 — Responsive cards on small screens for a wide list
- Prompt: "Convert one high-impact wide list to render as stacked cards below `sm` breakpoint. Recommend the Roles list at `frontend/src/pages/Settings/components/RoleList.tsx`: add a stacked card view for small screens (e.g., `block sm:hidden`) and keep the table/grid for `sm` and up (e.g., `hidden sm:block`). Keep the existing desktop layout untouched. Do not change data or actions; only responsive markup/CSS."
- Testing (AI-Agent)
  - `docker compose exec frontend npm run -s build`
  - Manual: emulate small screen and verify readability/actions on cards.

### Step 5.2 — Reduced motion + contrast pass
- Prompt: "Respect `prefers-reduced-motion` on loaders and animated elements; ensure all critical text meets contrast guidelines on dark backgrounds. Make minimal Tailwind class tweaks or tokens updates as needed. Add `motion-reduce:animate-none` to remaining spinners (e.g., the Projects list spinner)."
- Testing (AI-Agent)
  - Build and visually verify spinner/loader has `motion-reduce:animate-none`; adjust any low-contrast text.

---

## Phase 7 — Serializer & Naming Discipline

### Step 7.2 — Docs + lint guidance for serializer-only mapping
- Prompt: "Verify `docs/NAMING-DISCIPLINE.md` is present and linked in the README. The rule remains: never hand-map snake_case+camelCase in views or components; use serializers and typed models. Optionally add a light ESLint rule (no-restricted-imports or no-restricted-syntax) to warn on use of ad-hoc mapping helpers (if any exist). Keep the rule as a warning initially to avoid noise."
- Testing (AI-Agent)
  - Build/lint: `docker compose exec frontend npm run -s lint`
  - Confirm docs are discoverable and the rule (if added) warns as intended.

---

---

## Phase 9 — Background Jobs (Production)

### Step 9.1 — Add production Celery worker service
- Prompt: "Add a `worker` service to `docker-compose.prod.yml` using the backend production image/stage. Provide the same env (`DJANGO_SETTINGS_MODULE=config.settings`, `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`) and any shared volumes required for job files. Use `celery -A config worker -l info --concurrency=2` as the command. Add a basic healthcheck or rely on logs. Ensure `ASYNC_JOBS=true` in production when enabling."
- Description: Async exports/imports require a production worker.
- Testing (AI-Agent)
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml build`
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
  - Trigger an async export/import; verify `jobId` returned and worker logs show task execution; `GET /api/jobs/<id>/` returns `SUCCESS` and download works.

---

## Phase 11 — E2E in CI

### Step 11.1 — Add GitHub Actions job to run Playwright tests
- Prompt: "Add a CI workflow (e.g., `.github/workflows/e2e.yml`) to run Playwright tests against the dev stack. Steps: checkout + set up Node + bring up docker-compose services + wait for backend readiness at `/api/readiness/` + `npx playwright install chromium` + run `npm run e2e` (in the frontend container or on the runner using `PLAYWRIGHT_BASE_URL=http://localhost:3000`). Upload Playwright traces/screenshots on failure."
- Testing (AI-Agent)
  - Open a PR to trigger the workflow; verify tests run headless and artifacts appear on failures.

---

## Consolidated Acceptance Criteria (V2 scope)
- Dashboard uses short-TTL cache when enabled; payloads unchanged.
- Inline page toasts are unified via the toast bus; no duplicate in-page `<Toast>` blocks.
- Date/time contract documented; at least two visible views use the shared UTC-to-local format util.
- One wide list renders as stacked cards on small screens; reduced-motion/contrast verified.
- Serializer naming discipline documented; optional lint warns on manual mapping patterns.
- Production worker service exists; async jobs run end-to-end in prod stack.
- Playwright E2E suite runs in CI, failing the build on regressions and uploading artifacts.

---

## How to Use These Prompts
- Feed one prompt at a time to the AI-Agent.
- For each, apply minimal code changes, update docs where noted, and run the listed tests.
- Ask for review after each step if you want validation before proceeding.

