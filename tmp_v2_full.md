# Workload Tracker â€” Phased Prompts V2 (Finish Remaining Items)

This V2 plan contains prescriptive, lean prompts to finish the remaining items from the original phased plan. It excludes Phase 10.2 (OpenAPI typed client migration), which will be handled separately.

Principles for every prompt:
- Use lean programming (small, focused diffs). No shortcuts or bandâ€‘aids.
- Preserve existing behavior and API contracts unless explicitly stated.
- Guard new behavior with feature flags or environment variables where appropriate.
- Add only the minimal docs/tests needed to validate the change.
- Run all commands inside Docker containers (`docker compose exec <service> â€¦`).

---

## Phase 3 â€” Backend Performance (Shortâ€‘TTL Caching for Dashboard)

### Step 3.1 â€” Add shortâ€‘TTL caching to Dashboard (featureâ€‘flagged)
- Prompt: "Add a shortâ€‘TTL cache to `backend/dashboard/views.py` for the GET response when `SHORT_TTL_AGGREGATES=true`. Use `cache.get/set` keyed by `(weeks, department)` and a TTL (e.g., 30s, env override `DASHBOARD_CACHE_TTL=30`). When Redis is unavailable, fall back gracefully to computation. Do not change response shape. Keep code lean: wrap the final payload in a small cache read/write block; avoid deep refactors."
- Description: Reduce repeated computation and DB hits for a commonly viewed page.
- Testing (AIâ€‘Agent)
  - `docker compose exec backend python manage.py check`
  - `docker compose exec backend curl -sS "http://localhost:8000/api/dashboard/?weeks=4" | head -c 120`
  - Toggle `SHORT_TTL_AGGREGATES=true` and repeat; confirm consistent payload. Optionally log timings to verify a hit after first request.

---

## Phase 4 â€” Frontend UX Consistency

### Step 4.1 â€” Centralize toasts on remaining pages
- Prompt: "Replace pageâ€‘local `<Toast>` state renderings with centralized toast bus (`ToastHost` + `showToast`) in Assignments, People, Projects (only where inline, adâ€‘hoc toasts remain). Keep messages and semantics identical. Do not alter unrelated UI."
- Notes: App already mounts `ToastHost` globally; prefer `showToast()` over perâ€‘page `<Toast>` components.
- Testing (AIâ€‘Agent)
  - Build: `docker compose exec frontend npm run -s build`
  - Manual trigger: perform actions that previously showed inline toasts (e.g., assignment save/delete) and confirm toasts still appear.

### Step 4.2 â€” Timezone/date handling contract + minimal util
- Prompt: "Document the date/time contract: backend emits ISOâ€‘8601 UTC; frontend formats for display in the userâ€™s local time. Add a small utility (e.g., `src/utils/dates.ts` with `formatUtcToLocal(iso: string, opts?: Intl.DateTimeFormatOptions)`) and use it in 2â€“3 visible places that render dates (e.g., Dashboard recent assignments, Projects dates, Deliverables dates). Add a short `docs/DATE-TIME-CONTRACT.md` (or a section in README) with the rules and examples."
- Testing (AIâ€‘Agent)
  - `docker compose exec frontend npm run -s build`
  - Verify at least two pages display dates via the new util and match expected local formatting.

---

## Phase 5 â€” Mobile & A11y

### Step 5.1 â€” Responsive â€œcardsâ€ on small screens for a wide list
- Prompt: "Convert one highâ€‘impact wide list (e.g., Settings/Role list section or a Projects summary block) to render as stacked cards below `sm` breakpoint. Keep the existing desktop layout untouched. Do not change data or actions; only responsive markup/CSS."
- Testing (AIâ€‘Agent)
  - `docker compose exec frontend npm run -s build`
  - Manual: emulate small screen and verify readability/actions on cards.

### Step 5.2 â€” Reduced motion + contrast pass
- Prompt: "Respect `prefers-reduced-motion` on loaders and animated elements; ensure all critical text meets contrast guidelines on dark backgrounds. Make minimal Tailwind class tweaks or tokens updates as needed."
- Testing (AIâ€‘Agent)
  - Build and visually verify spinner/loader has `motion-reduce:animate-none`; adjust any lowâ€‘contrast text.

---

## Phase 7 â€” Serializer & Naming Discipline

### Step 7.2 â€” Docs + lint guidance for serializerâ€‘only mapping
- Prompt: "Add a short doc (e.g., `docs/SERIALIZER-NAMING-DISCIPLINE.md`) describing the rule: never handâ€‘map snake_caseâ†”camelCase in views or components; use serializers and typed models. Link this doc in CONTRIBUTING/README. Optionally add a light ESLint rule (noâ€‘restrictedâ€‘imports or noâ€‘restrictedâ€‘syntax) to warn on use of adâ€‘hoc mapping helpers (if any exist). Keep the rule as a warning initially to avoid noise."
- Testing (AIâ€‘Agent)
  - Build/lint: `docker compose exec frontend npm run -s lint`
  - Confirm docs are discoverable and the rule (if added) warns as intended.

---

## Phase 8 â€” Deployment (Compression)

### Step 8.3 â€” Brotli enablement (optional, safeâ€‘fallback)
- Prompt: "Enable Brotli in Nginx only if the module is available; otherwise keep gzip. Update `nginx/nginx.conf` accordingly (uncomment `brotli` settings) and verify the image includes the module, or document that gzip remains active if not."
- Testing (AIâ€‘Agent)
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml build`
  - Run prod stack; `curl -H "Accept-Encoding: br" -I http://localhost/ | grep -i content-encoding` should show `br` when Brotli is active; otherwise `gzip`.

---

## Phase 9 â€” Background Jobs (Production)

### Step 9.1 â€” Add production Celery worker service
- Prompt: "Add a `worker` service to `docker-compose.prod.yml` using the backend production image/stage. Provide the same env (REDIS_URL, CELERY_*) and shared volumes required for job files (if any). Add a basic healthcheck or rely on logs. Ensure `ASYNC_JOBS=true` in production when enabling."
- Description: Async exports/imports require a production worker.
- Testing (AIâ€‘Agent)
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml build`
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
  - Trigger an async export/import; verify `jobId` returned and worker logs show task execution; `GET /api/jobs/<id>/` returns `SUCCESS` and download works.

---

## Phase 11 â€” E2E in CI

### Step 11.1 â€” Add GitHub Actions job to run Playwright tests
- Prompt: "Add a CI workflow (e.g., `.github/workflows/e2e.yml`) to run Playwright tests against the dev stack. Steps: checkout â†’ set up Node â†’ bring up dockerâ€‘compose services â†’ wait for backend readiness (`/api/readiness/`) â†’ `npx playwright install chromium` â†’ `npm run e2e` in the frontend container (or on the runner using baseURL). Upload Playwright traces/screenshots on failure."
- Testing (AIâ€‘Agent)
  - Open a PR to trigger the workflow; verify tests run headless and artifacts appear on failures.

---

## Consolidated Acceptance Criteria (V2 scope)
- Dashboard uses shortâ€‘TTL cache when enabled; payloads unchanged.
- Inline page toasts are unified via the toast bus; no duplicate inâ€‘page `<Toast>` blocks.
- Date/time contract documented; at least two visible views use the shared UTCâ†’local format util.
- One wide list renders as stacked cards on small screens; reducedâ€‘motion/contrast verified.
- Serializer naming discipline documented; optional lint warns on manual mapping patterns.
- Nginx serves Brotli when available; gzip remains as fallback; prod Compose builds cleanly.
- Production worker service exists; async jobs run endâ€‘toâ€‘end in prod stack.
- Playwright E2E suite runs in CI, failing the build on regressions and uploading artifacts.

---

## How to Use These Prompts
- Feed one prompt at a time to the AIâ€‘Agent.
- For each, apply minimal code changes, update docs where noted, and run the listed tests.
- Ask for review after each step if you want validation before proceeding.
