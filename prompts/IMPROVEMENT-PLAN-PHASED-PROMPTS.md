# Workload Tracker — Phased Improvement Plan (UX, Performance, Security, Mobile)

This plan breaks improvements into focused phases. Each step is a prescriptive prompt you can re-feed to the AI-Agent. Steps emphasize lean programming (minimal, focused changes), explicit backend/frontend coordination, and strict serializer usage for snake_case ↔ camelCase mapping.

For each step, a short description explains the goal in plain engineering terms. Testing phases include what the AI-Agent can run, plus separate manual UI checks you can perform.

Notes:
- Keep changes small and focused. Avoid refactors unrelated to the step.
- When touching API contracts, update both backend and frontend in the same phase/step.
- Use serializers to map names; do not manually map in views/components.
- Guard production-only changes with environment flags.
- Always run commands inside containers using `docker compose exec <service>` — avoid host-level `npm`, `node`, `pip`, or `manage.py`.
  - Frontend examples: `docker compose exec frontend npm install` | `docker compose exec frontend npm ci` | `docker compose exec frontend npm run build` | `docker compose exec frontend npm audit` | `docker compose exec frontend npx lhci autorun`.
  - Backend examples: `docker compose exec backend python manage.py check` | `docker compose exec backend sh -lc "pip install -q pip-audit && pip-audit -r requirements.txt --desc"`.
- When adding Python packages, add them to `backend/requirements.txt` and rebuild the backend image (`docker compose build backend`). When adding frontend packages, update `frontend/package.json` and rebuild the frontend image (`docker compose build frontend`).

---

## Phase 0 — Repo Hygiene & Dependency Audit

### Step 0.1 — Add .gitignore and remove committed .env
- Prompt: "Add a project-level `.gitignore` (Python, Django, Node, Vite, logs, builds). Remove tracked `.env` from version control. Keep `.env.example` as the source of truth. Do not delete any actually required runtime files from disk—only stop tracking them."
- Description: Prevent accidental secret leakage and keep the repo clean.

### Step 0.2 — Rotate secrets and set env per environment
- Prompt: "Rotate `SECRET_KEY` and any credentials that may have leaked via `.env`. Ensure development, staging, and production use separate env files. Do not hardcode secrets in code."
- Description: Avoid using the same secrets across environments.

### Step 0.3 — Upgrade frontend dev dependencies with known advisories
- Prompt: "Update `vite` to ≥ 5.4.19 (current is 5.4.8) and `eslint` to ≥ 9.35.0 (current is 9.12.0) to resolve security advisories. Run `npm install`, `npm audit` and ensure build still succeeds. Rebuild the frontend Docker image so future deployments include updated modules. Do not introduce breaking config changes."
- Description: Patch known vulnerabilities in tooling.
- Commands (Docker): `docker compose exec frontend npm install`; `docker compose exec frontend npm audit`; `docker compose exec frontend npm run build`.

### Step 0.4 — Verify backend dependencies are on secure patches
- Prompt: "Check `backend/requirements.txt` for latest security patches of Django, DRF, SimpleJWT, and Sentry SDK. Target patch-level upgrades within the current major/minor (e.g., Django 5.0.x → latest 5.0.x). Do not upgrade across major versions without explicit approval."
- Description: Keep backend libs current without risky upgrades.

### Step 0.5 — Update or remove `serve` (frontend)
- Prompt: "Update `serve` to ≥ 14.2.5 (addresses transitive `compression` advisory) or remove it if not used in the workflow. Re-run `npm audit` to confirm resolution. Rebuild the frontend Docker image so production builds succeed with the correct dependency set."
- Description: Close additional advisories flagged by `npm audit`.
- Commands (Docker): `docker compose exec frontend npm audit`.

### Step 0.6 — Run Python security audit
- Prompt: "Run `pip-audit` inside the backend container (e.g., `docker compose exec backend sh -lc \"pip install -q pip-audit && pip-audit -r requirements.txt --desc\"`). Propose safe patch updates that do not introduce code changes, and record results in a short SECURITY_NOTES.md."
- Description: Identify Python CVEs early and plan safe patches.

### Testing (AI-Agent)
- Run `docker compose exec frontend npm run build` and ensure success.
- Run `docker compose exec frontend npm audit` and confirm the flagged advisories are mitigated where possible.
- Run `docker compose exec backend sh -lc "pip install -q pip-audit && pip-audit -r requirements.txt --desc"` and document actionable items.
- Run `docker compose exec backend python manage.py check` to ensure no Django config errors.

### Manual UI Checks (You)
- Confirm no `.env` is tracked in git; application still runs with your local env.

---

## Phase 1 — UX Consistency & Navigation

### Step 1.1 — Provide “Coming Soon” pages for dead links
- Prompt: "Create a reusable `ComingSoon.tsx` page in `frontend/src/pages/ComingSoon/ComingSoon.tsx` with accessible semantics (e.g., `role="main"`, clear heading) and a link back to the Dashboard. Add a lazy-loaded route for `/help` in `frontend/src/App.tsx` to render `ComingSoon`. Keep the `/help` link in `Sidebar.tsx`."
- Description: Avoid broken navigation while signaling future functionality.

### Step 1.2 — Outline the “Coming Soon” features in FUTURE_FEATURES.md
- Prompt: "Add a section to `FUTURE_FEATURES.md` documenting the `/help` page scope, intended content, and any related future UX (e.g., searchable docs, quick tips). Include rough milestones and dependencies."
- Description: Track intent and roadmap for features behind placeholders.

### Step 1.3 — Standardize buttons/inputs on shared UI components
- Prompt: "Replace ad-hoc `<button>`/`<input>` styles in Settings, Profile, ProjectsList, and PeopleList with `components/ui/Button.tsx` and `components/ui/Input.tsx`. Ensure `Input` supports common attributes (type, autoComplete, etc.). Do not change behavior, only presentation. Keep prop names and interactions identical."
- Description: Consistent look/feel and accessibility.

### Step 1.4 — Add a unified `Loader` component and use across pages
- Prompt: "Create `components/ui/Loader.tsx` (accessible spinner + text, `aria-live="polite"`). Replace inline 'Loading...' spinners in RequireAuth, Login, Settings, Projects, and People pages with this component."
- Description: One consistent loading experience.

### Step 1.5 — Remove legacy `.js.bak` files from `src`
- Prompt: "Remove `*.js.bak` and other legacy duplicates from `frontend/src/**`. Only remove files that have a `.tsx` successor and are not imported anywhere. Do not touch backend files in this step."
- Description: Reduce confusion and accidental imports.

### Testing (AI-Agent)
- Run `docker compose exec frontend npm run build` and ensure type checks pass.
- Grep for `Loading` and ensure references now use the Loader component.
- Verify `App.tsx` has a `/help` route and it renders the Coming Soon page.

### Manual UI Checks (You)
- Navigate between Dashboard, Settings, Projects, People; confirm consistent buttons/inputs.
- Click Help in the sidebar; confirm the Coming Soon experience renders.

---

## Phase 2 — Security Hardening

### Step 2.1 — Django production hardening flags
- Prompt: "In `backend/config/settings.py`, add production guards: `SECURE_HSTS_SECONDS`, `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_PROXY_SSL_HEADER`, and `CSRF_TRUSTED_ORIGINS`. Wrap inside `if not DEBUG:` or equivalent. Do not alter dev behavior."
- Description: Enforce HTTPS and secure cookies in production.

### Step 2.2 — Align CORS with authentication strategy
- Prompt: "If keeping header-based JWT only, set `CORS_ALLOW_CREDENTIALS=False` and restrict `CORS_ALLOWED_ORIGINS` by environment. If adopting cookie-based refresh (Step 2.3), enable `CORS_ALLOW_CREDENTIALS=True` for the refresh flow and keep allowed origins explicit via env vars. Document and apply the toggle per environment (dev/stage/prod)."
- Description: Minimize cross-site risk while supporting the chosen auth.

### Step 2.3 — Safer token storage with httpOnly refresh cookie (feature-flagged)
- Prompt: "Add a feature flag `FEATURES['COOKIE_REFRESH_AUTH']=True|False`. When enabled:
  1) Override the SimpleJWT obtain/refresh views to set/rotate an httpOnly, `Secure` (prod only), `SameSite=Lax` refresh cookie; do not return the refresh in JSON. In local HTTP dev, omit `Secure` to allow testing.
  2) Keep access token in memory on the frontend; on 401, call refresh with `credentials: 'include'` to obtain a new access token.
  3) Update `frontend/src/store/auth.ts` to stop persisting refresh in `localStorage` when the flag is on; retain access token in memory only.
  4) Add CSRF protection for refresh if cookies are used (CSRF trusted origins + anti-CSRF header or double-submit token), or strictly limit origins and methods; document the approach and test accordingly.
  5) Ensure `CORS_ALLOWED_ORIGINS` and `CORS_ALLOW_CREDENTIALS` are aligned with the cookie approach.
"
- Description: Reduce XSS impact by keeping refresh out of JS-accessible storage.

### Step 2.4 — Strengthen Nginx security headers
- Prompt: "In `nginx/nginx.conf`, add headers: a strict CSP (start with `default-src 'self'`; add `connect-src` for Sentry if used; if keeping Google Fonts preconnects from `frontend/index.html`, include the necessary `font-src`/`style-src` origins or remove the preconnects), `Strict-Transport-Security`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, and a conservative `Permissions-Policy`. Apply in production only."
- Description: Browser-side protections against common attacks.

### Step 2.5 — Expand throttling for hot/sensitive endpoints
- Prompt: "Add DRF throttles for sensitive endpoints (password change, user create/delete) and ensure `HotEndpointThrottle` scopes are set via env. Keep limits reasonable and configurable."
- Description: Reduce brute force and abuse surfaces.

### Step 2.6 — Add basic Nginx rate limiting (optional)
- Prompt: "Add IP-based request rate limiting for `/api/token/` and `/api/auth/*` routes in Nginx to complement DRF throttles. Document limits and burst."
- Description: Defense-in-depth for auth endpoints.

### Step 2.7 — Auth lockout under feature flag (optional)
- Prompt: "Add login protection under a feature flag using `django-axes` (or similar) to lock accounts temporarily after repeated failed logins. Configure safe defaults, admin whitelist, and alerting. Add the package to `backend/requirements.txt` and rebuild the backend image. Expose env vars to tune thresholds per environment."
- Description: Prevent brute force without risking accidental admin lockout.

### Step 2.8 — Admin audit trail for sensitive actions
- Prompt: "Add lightweight audit logging for admin actions (user create/delete, password set, role changes). Use a simple model/table with who/when/what fields and log from existing views. Provide a read-only endpoint for admins to query recent actions."
- Description: Accountability and traceability in multi-user setups.

### Testing (AI-Agent)
- Run `docker compose exec backend python manage.py check --deploy` and fix any reported security settings.
- With feature-flag off: header-token auth works. With flag on: refresh cookie flow works in local dev (use non-Secure cookies on http). Verify CORS/CSRF settings on refresh.

### Manual UI Checks (You)
- Log in/out. Attempt password change. Validate navigation and edits with the feature flag toggled.

---

## Phase 3 — API Performance Improvements

### Step 3.1 — Tune DRF pagination defaults
- Prompt: "Lower `REST_FRAMEWORK` `PAGE_SIZE` to 50–100 and `MAX_PAGE_SIZE` to 200 in `backend/config/settings.py`. Preserve `page_size` query param support, and audit key UI screens to request larger `page_size` where needed to preserve UX."
- Description: Reduce heavy payloads by default.

### Step 3.2 — Remove artificial delays in streaming exports
- Prompt: "Delete or guard `time.sleep(0.1)` in `backend/people/views.py` and `backend/projects/views.py` so it only runs when `DEBUG=True`."
- Description: Faster exports in production.

### Step 3.3 — Cache department descendant resolution
- Prompt: "Add a utility in the `departments` app that computes descendant IDs using a recursive CTE or efficient iteration and caches results per root ID, with invalidation on department change. Use this utility in People `list`, `capacity_heatmap`, and `workload_forecast`. If you choose a third-party helper (e.g., a CTE library), add it to `backend/requirements.txt` and rebuild the backend image."
- Description: Avoid repeated N+1 lookups for hierarchies.

### Step 3.4 — Ensure `select_related()/prefetch_related()` and `only()` on list endpoints
- Prompt: "Audit `people`, `projects`, `assignments`, and `roles` ViewSets. For list endpoints, add `select_related`/`prefetch_related` and restrict fields with `.only()` where safe. Do not change response shapes."
- Description: Prevent N+1 and shrink payloads.

### Step 3.5 — Simplify ETag validators
- Prompt: "Where generating ETags on list endpoints, prefer `max(updated_at)` and avoid `count()` where it adds load. Keep conditional request support (If-None-Match/If-Modified-Since)."
- Description: Keep conditional caching cheap.

### Step 3.6 — Add database indexes for common filters
- Prompt: "Add/verify DB indexes on frequently filtered/ordered columns: `Person(is_active, department_id, updated_at)`, `Project(is_active, updated_at)`, and date fields used by deliverables/assignments. Create migrations without altering behavior."
- Description: Improve query performance for common scenarios.

### Step 3.7 — Add People autocomplete backend endpoint
- Prompt: "Create `GET /api/people/autocomplete/?search=` returning a limited array of `{ id, name, department, weekly_capacity }` using `only()` and appropriate indexes. Limit results (e.g., top 20). Reuse a serializer (or create a lightweight one) to ensure camelCase mapping via serializers, not views."
- Description: Support efficient UI autocomplete without loading all people.

### Step 3.8 — Database connection pooling
- Prompt: "Enable DB connection reuse by setting `DATABASES['default']['CONN_MAX_AGE']=60` and `CONN_HEALTH_CHECKS=True` in `backend/config/settings.py` (guarded by env)."
- Description: Reduce connection overhead and improve reliability under load.

### Step 3.9 — Short‑TTL cache for hot aggregate endpoints (feature-flagged)
- Prompt: "Introduce short‑TTL caching for hot aggregate endpoints (e.g., `/projects/filter-metadata/`, heatmaps/forecasts) using Redis (`django-redis`). Add invalidation hooks (signals on save/delete of related models) and a feature flag to toggle server-side cache. Document TTLs and invalidation strategy."
- Description: Improve responsiveness while keeping data fresh.

### Testing (AI-Agent)
- Measure response sizes/times before/after defaults change (sample endpoints). Ensure no shape changes.
- Exercise the new `/people/autocomplete/` endpoint with/without search.

### Manual UI Checks (You)
- Open People/Projects pages and confirm snappy loads with default pagination. Try export flows.

---

## Phase 4 — Frontend Data & Rendering Performance

### Step 4.1 — Replace bulk `listAll` with paginated queries
- Prompt: "In `frontend/src/services/api.ts` and hooks/pages (PeopleList, ProjectsList), replace `listAll` usage with paginated APIs. Implement infinite scroll or 'Load more' with React Query. Keep URL params and response types consistent with DRF pagination."
- Description: Reduce initial payloads and memory usage.

### Step 4.2 — Virtualize large lists/tables
- Prompt: "Introduce lightweight list virtualization (e.g., `react-virtual`) on People and Projects lists when item count exceeds a threshold (e.g., 200). Add the dependency to `package.json` when implementing and rebuild the frontend image so deployments include it. Keep DOM small and scrolling smooth."
- Description: Improve rendering performance.

### Step 4.3 — Adjust React Query defaults minimally
- Prompt: "Prefer per-query overrides (e.g., `refetchOnMount: false`) for screens sensitive to refetches, instead of blanket defaults. Keep `staleTime` sensible and `retry=1`."
- Description: Avoid unnecessary refetch bursts without risking stale data globally.

### Step 4.4 — Strip debug logging in production
- Prompt: "Wrap `console.log`/debug prints with `if (import.meta.env.DEV)` or remove. Ensure `services/api.ts` debug prints are dev-only."
- Description: Reduce noise and overhead.

### Step 4.5 — Wire autocomplete to backend endpoint
- Prompt: "Add `peopleApi.autocomplete(search)` to call `/people/autocomplete/`. Replace `getForAutocomplete()` usages with the new function. Remove the old `listAll`-based implementation once all call sites are migrated."
- Description: Eliminate large client-side scans for autocomplete.

### Step 4.6 — Optimistic UI updates with safe rollback
- Prompt: "Use React Query optimistic updates for common edits (e.g., People name, Project fields). Implement rollback on error and show toasts for success/error. Keep server as the source of truth by refetching the affected record after mutation settles."
- Description: Snappier UX while preserving consistency.

### Step 4.7 — Skeleton loaders and empty states
- Prompt: "Add skeleton components for list/detail panes and explicit empty states (e.g., 'No people match your filters') to improve perceived performance and clarity."
- Description: Reduce perceived latency and confusion.

### Step 4.8 — Centralized toasts and error mapping
- Prompt: "Standardize notifications through `components/ui/Toast.tsx`. Map common API error shapes (HTTP 400/401/403/409/500) to friendly messages. Remove ad‑hoc inline status strings."
- Description: Consistent, readable feedback across the app.

### Step 4.9 — Timezone and date handling
- Prompt: "Normalize all dates from backend as ISO (UTC). In the frontend, format dates in the user's local timezone only for display. Document this contract and audit affected pages for consistency."
- Description: Avoid off‑by‑one date bugs and user confusion.

### Step 4.10 — Accessibility & keyboard navigation
- Prompt: "Ensure modals trap focus and close on Escape; add `aria-*` attributes for loaders and Coming Soon pages; implement basic keyboard navigation in list views (↑/↓ to move, Enter to open)."
- Description: Improve usability and accessibility.

### Testing (AI-Agent)
- Run Lighthouse (LHCI) inside the frontend container on a production build: `docker compose exec frontend npm run build` then `docker compose exec frontend npx lhci autorun`.
- After adding or updating dependencies (frontend or backend), run `docker compose build` (or targeted `build frontend|backend`) to ensure future deployments pull in the changes.

### Manual UI Checks (You)
- Scroll through long People/Projects lists; confirm smoothness and incremental fetch behavior.

---

## Phase 5 — Mobile Responsiveness

### Step 5.1 — Responsive sidebar
- Prompt: "Refactor `components/layout/Sidebar.tsx` to collapse into an off-canvas drawer on `<md` with a hamburger toggle. Maintain icon-only sidebar for `md+`. Keep routes and icons unchanged."
- Description: Free up space on mobile.

### Step 5.2 — Responsive tables to cards on small screens
- Prompt: "For Settings 'Users' table and any wide tables, add a stacked card layout for small screens (`sm` breakpoint). Preserve the same data fields and admin-only constraints (e.g., prevent self-delete) in the card actions; do not change APIs."
- Description: Improve readability on phones.

### Step 5.3 — Touch targets and form inputs
- Prompt: "Ensure minimum 44×44px tappable areas for buttons and inputs. Use appropriate input types (`email`, `tel`, `number`) and `autocomplete` attributes across forms. Use shared `Button`/`Input`."
- Description: Better mobile ergonomics.

### Step 5.4 — Reduced motion and contrast checks
- Prompt: "Respect `prefers-reduced-motion` in loaders/animations and verify contrast for secondary text on dark backgrounds. Adjust Tailwind classes/tokens if necessary."
- Description: Accessibility improvements for mobile.

### Testing (AI-Agent)
- Run responsive visual snapshots for `sm`, `md`, `lg` on key pages (if tooling available).

### Manual UI Checks (You)
- On a phone or device emulator, verify the sidebar toggle, table card views, form usability, and readability.

---

## Phase 6 — Concurrency & Data Integrity

### Step 6.1 — Add ETag on detail GET + If-Match on mutations
- Prompt: "Add ETag headers on object detail GET responses (e.g., People, Projects) using `updated_at`. On PATCH/PUT/DELETE, require `If-Match` and return `412 Precondition Failed` if the ETag does not match. Keep response shapes unchanged."
- Description: Enable optimistic concurrency to prevent silent overwrites.

### Step 6.2 — Frontend conditional updates
- Prompt: "Capture `ETag` from GET responses and include `If-Match` on subsequent PATCH/DELETE in `services/api.ts`. On 412, show a friendly conflict message and offer to reload."
- Description: Coordinate client with server for safe edits.

### Testing (AI-Agent)
- Add minimal API tests simulating concurrent updates (two clients, one stale). Verify 412 behavior.

### Manual UI Checks (You)
- Open the same item in two tabs, edit in both, and confirm the second fails with a conflict and guidance.

---

## Phase 7 — Serializer & Naming Discipline

### Step 7.1 — Enforce serializer-based name mapping
- Prompt: "Audit serializers to ensure snake_case ↔ camelCase mapping happens in serializers only (not in views). Confirm all frontend models align with serializer outputs. Do not alter API field names; adjust serializers if mismatches exist."
- Description: Avoid manual name translation bugs.

### Step 7.2 — Add lint rules/docs
- Prompt: "Document the rule: never hand-map field names in views/components; use serializers and typed models. Optionally add eslint checks or types to catch mismatches early."
- Description: Institutionalize the practice.

### Testing (AI-Agent)
- Build the frontend inside the container and run TypeScript checks (e.g., `docker compose exec frontend npm run build`); ensure model types match serialized fields.

### Manual UI Checks (You)
- Spot-check pages (People, Projects) for properly displayed names and fields.

---

## Phase 8 — Deployment, Monitoring, and Source Maps

### Step 8.1 – Sentry integration and sourcemaps hygiene
- Prompt: "Ensure frontend sourcemaps are uploaded to Sentry in production builds (configure `@sentry/vite-plugin` with CI env vars) and are not publicly served. Keep `sourcemap: true` only for the CI step that uploads maps. Confirm backend Sentry is enabled in production with PII off by default."
- Description: Enable error triage without exposing internals.

### Step 8.1b – Sentry Python SDK 2.x Upgrade
- Prompt: "Upgrade backend `sentry-sdk[django]` to `2.37.0`. Verify `sentry_sdk.init` options (DjangoIntegration, LoggingIntegration), `send_default_pii=False`, and traces/profiles sample rates. Deploy to staging, trigger test errors/transactions, and confirm they appear in Sentry with expected metadata."
- Description: Adopt latest Sentry SDK with migration validation.

### Step 8.2 — Disable Silk in production
- Prompt: "Ensure `SILK_ENABLED=False` for production via env and that `/silk/` is not routed."
- Description: Avoid shipping profiling tools to prod.

### Step 8.3 — Static asset caching and Brotli compression
- Prompt: "In Nginx, set long‑lived `Cache-Control: public,max-age=31536000,immutable` for hashed assets (Vite outputs). Keep shorter cache for HTML. Enable Brotli (and keep gzip) where supported. Test asset updates with a cache‑busting deploy."
- Description: Faster loads via caching and better compression.

### Step 8.4 — Request IDs and structured logs
- Prompt: "Add middleware to inject an `X-Request-ID` (preserve incoming if set) and log structured JSON including request id, user id, path, status, and latency. Correlate with Sentry by including the request id."
- Description: Easier debugging and traceability in production.

### Step 8.5 — Readiness endpoint and healthchecks
- Prompt: "Add `/api/ready/` that verifies DB and cache connectivity (fast checks). Update Docker healthchecks to use readiness for the backend, improving accuracy over mere process liveness."
- Description: More reliable container orchestration.

### Step 8.6 — CSP rollout strategy (report‑only → enforce)
- Prompt: "Introduce a `Content-Security-Policy-Report-Only` header in staging to capture violations without breaking pages. After resolving issues (e.g., fonts), switch to enforcing `Content-Security-Policy` in production."
- Description: Reduce risk of CSP rollouts breaking the UI.

### Testing (AI-Agent)

### Testing (AI-Agent)
- Simulate a handled error in a staging build to verify Sentry receives events and source maps resolve.

### Manual UI Checks (You)
- Confirm no `/silk/` in production; verify Sentry dashboards populate with meaningful stack traces.

---

## Phase 9 — Background Jobs & Heavy Workflows (Feature‑flagged)

### Step 9.1 — Introduce Celery workers for heavy tasks
- Prompt: "Add Celery + Redis for Excel import/export and other heavy tasks. Add `celery` to `backend/requirements.txt` and rebuild the backend image. Add a `worker` service to docker-compose (dev/prod) and a basic `celery.py` app wiring. Keep synchronous endpoints by default; add a feature flag (`FEATURES['ASYNC_JOBS']`) to switch to async job submission + status polling."
- Description: Prevent request timeouts and keep the UI responsive for heavy operations.

### Step 9.2 — Async API contract and UI status
- Prompt: "When async jobs are enabled, return a job id from import/export endpoints and add a `GET /api/jobs/<id>/` status endpoint. In the frontend, show job progress and allow retry/download when complete."
- Description: Clear UX for long‑running operations.

### Testing (AI-Agent)
- Run a large export/import with the feature flag off (sync) and on (async). Verify no regressions. If using Docker, bring up the worker service and observe logs.

### Manual UI Checks (You)
- Trigger large imports/exports and confirm the UI stays responsive and shows progress.

---

## Phase 10 — API Schema & Typed Clients (Optional)

### Step 10.1 — Add OpenAPI schema generation
- Prompt: "Integrate `drf-spectacular` (or `drf-yasg`) to serve `/schema/` and `/schema/swagger/`. Add the package to `backend/requirements.txt` and rebuild the backend image."
- Description: Authoritative API documentation from code.

### Step 10.2 — Generate TypeScript clients (incremental adoption)
- Prompt: "Add a script to generate TypeScript clients from the OpenAPI schema (e.g., `openapi-typescript`). Add the generator as a devDependency and rebuild the frontend image. Migrate selected modules to the generated client incrementally to avoid large churn."
- Description: Reduce drift between FE/BE and improve type safety.

### Testing (AI-Agent)
- Validate the schema endpoint loads and clients type‑check. Ensure no breaking API changes were introduced.

### Manual UI Checks (You)
- Exercise a migrated module and confirm requests/responses align with the schema.

---

## Phase 11 — E2E Tests (Optional)

### Step 11.1 — Add Playwright tests for critical flows
- Prompt: "Add Playwright as a devDependency in the frontend. Create tests for login, People list/edit, Projects list/edit. Run headless in CI and locally via Docker: `docker compose exec frontend npx playwright test`."
- Description: Catch regressions in user-critical paths.

### Testing (AI-Agent)
- Run the E2E suite headless locally and in CI. Capture screenshots on failures.

### Manual UI Checks (You)
- Skim the recorded videos (if enabled) to confirm flows and timing.

---

## Phase 12 — Docker Image Hardening (Optional)

### Step 12.1 — Multi‑stage builds and non‑root runtime
 - Prompt: "Convert backend and frontend Dockerfiles to multi-stage builds to produce smaller runtime images. Run containers as a non-root user. Validate volume permissions and entrypoints. Roll out on main with environment-gated toggles and feature flags, and test both dev and prod compose flows before enabling in production."
- Description: Smaller, more secure deployable images with fewer privileges.

### Testing (AI-Agent)
- Build new images, run the stack with compose, and verify migrations, static collection, and frontend serve still work.

### Manual UI Checks (You)
- Validate that dev workflow is unaffected and production smoke tests pass.

---

## Consolidated Acceptance Criteria

- Navigation has no dead links; Help renders a Coming Soon page; future items are documented in FUTURE_FEATURES.md.
- UI uses shared components; a unified loader is present.
- Default page loads are faster (pagination/virtualization); exports are not artificially delayed.
- Security is hardened: HTTPS-only cookies in prod, CORS aligned with auth, strict headers in Nginx.
- No secrets tracked in git; dependencies updated to patch advisory CVEs; Python audit items resolved where safe.
- Mobile UX is usable: responsive sidebar, card views, proper touch targets.
- Optimistic concurrency prevents silent overwrites; client handles 412 gracefully.
- Serializer discipline is documented; frontend models match API responses.

---

## How to Use These Prompts

Feed steps to the AI-Agent one at a time. For complex steps (e.g., cookie-based refresh, autocomplete endpoint), use the sub-tasks in the prompt and validate each change with the associated testing checklist before moving to the next step. Keep diffs small and focused.
