# CI and Docker Build Recovery Plan (Clean Version)

Purpose: Resolve TypeScript build failures breaking Docker Hub builds, align frontend–backend contracts, and harden the GitHub Actions/Docker pipeline. Apply lean programming best practices: minimal, focused changes; no shortcuts or band‑aids; preserve clarity and correctness.

Guiding principles:
- Prefer small, verifiable diffs and incremental validation per step.
- Maintain strict FE–BE contract alignment; never guess API shapes.
- Remove dead or unreachable code instead of patching around it.
- Keep naming consistent and descriptive; avoid duplication.
- Add explicit fail‑fast abort conditions to stop and request confirmation when a change risks broad refactors or unclear ownership (e.g., backend schema drift, missing secrets, or environment mismatch).

Editing Rules (enforced):
- Use apply_patch for all file changes. Preserve formatting and existing line endings.
- Do not use shell writes (Set‑Content/echo/sed) to modify code. Do not insert literal "\\r\\n" sequences; let the patch handle newlines.
- Avoid bulk regex replacements; submit minimal, contextual patches.
- After each edit, run the frontend type check/build to validate: `cd frontend && npx tsc --noEmit && npm run -s build`.
- Only use best‑practice programming; do not apply shortcuts or band‑aids to make tests pass, and never remove functionality solely to satisfy tests.

---

## Phase 0 — Preconditions and Guardrails

Prompt:
- "Confirm local build prerequisites and guardrails: use Node LTS, install workspace dependencies with `npm ci` in `frontend`, and avoid global overrides. All fixes must be minimal and typed. Do not introduce new libraries unless strictly necessary."

Verification:
- Run `cd frontend && npm ci && npm run -s build` to ensure baseline reproduction of errors.

Additional guardrail:
- "Pin Node to the same LTS (20.x) across local, CI, and Docker. Verify `node -v` locally and ensure Actions runners and Docker base images use Node 20.x."

Abort conditions:
- "If Node is not 20.x in any environment (local, CI runner, or Docker), stop and request approval to pin versions before continuing."
- "If the frontend cannot build locally after `npm ci`, stop to avoid diagnosing CI‑only failures without a baseline."

---

## Phase 1 — Reproduce and Capture Failure Context

Prompt:
- "Reproduce the frontend build locally to capture exact TypeScript errors. Execute:
  - `cd frontend && npm run -s build`
  - If the build fails, also run `npx tsc --noEmit` to get precise file:line diagnostics.
  - Copy the error list into a scratch note and sort by file. Do not fix yet; only collect."

Verification:
- The error list matches the CI/Hub output, including any missing imports, prop type mismatches, and number/string issues.

Hardening steps:
- "Confirm CI builds the intended commit. Record `GITHUB_SHA` from CI logs and ensure it matches `git rev-parse origin/main`."
- "Validate path alias resolution and case sensitivity:
  - Confirm `tsconfig.json` paths `@/* -> src/*` and `vite.config.ts` alias match.
  - Search for import casing mismatches that would fail on Linux CI."

Abort conditions:
- "If CI SHA and local HEAD differ, stop to avoid fixing the wrong revision."
- "If alias/case checks show Linux‑only import failures, stop and plan targeted, minimal renames to match filesystem casing before moving forward."

---

## Phase 2 — Fix Missing or Misplaced Components (Status Dropdown)

Prompt:
- "Audit the import `@/components/projects/ProjectStatusDropdown` in `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx`. Verify the component exists at `frontend/src/components/projects/ProjectStatusDropdown.tsx` and exports a default React component with the expected props. If missing, restore or create it exactly in that path. Ensure the import path uses the configured TS path alias `@`."

Sub‑steps:
- "If the component exists locally but is untracked, `git add` it and commit with a clear message."
- "If path differs, update the import in `ProjectDetailsPanel.tsx` to the correct relative or aliased path."
- "Verify via `git ls-files` that `frontend/src/components/projects/ProjectStatusDropdown.tsx` is tracked so CI can resolve it."

Verification:
- `npx tsc --noEmit` shows no module‑not‑found errors for ProjectStatusDropdown.

Abort condition:
- "If the component does not exist and requirements are unclear, stop and request confirmation of desired UI/UX before implementation."

---

## Phase 2.5 — Backend Prechecks Gate (Before Docker Builds)

Prompt:
- "Add a `backend-check` job that runs before Docker builds. Keep it lean:
  - Set up the correct runtime for the backend (Node, Python, etc.) pinned to supported versions.
  - Run formatter/lint/tests/build in that order; if no tests exist, add a build‑only gate now and schedule tests later.
  - Add `needs: [backend-check]` to Docker jobs so they won’t run if backend fails."

Verification:
- Backend issues stop the pipeline before images are built or pushed.

Abort condition:
- "If the backend stack/version is unclear, stop and request confirmation of supported toolchain and test strategy."

---

## Phase 3 — Prop Contract Audit and Alignment (roleSearchResults vs personSearchResults)

Prompt:
- "Search the codebase for `roleSearchResults` usage. For each occurrence:
  - If it is passed to `ProjectDetailsPanel`, replace with `personSearchResults` or add an explicit prop to the `Props` interface only if a distinct meaning is intended.
  - Remove any unused or unknown props passed to `AssignmentRow` or other children to match their defined prop types.
  - Keep naming consistent across parent/child components."

Sub‑steps:
- "Open `frontend/src/pages/Projects/ProjectsList.tsx` and confirm the prop names passed to `ProjectDetailsPanel` match its `Props` signature."
- "Open `frontend/src/pages/Projects/list/components/ProjectDetailsPanel.tsx` and confirm only documented props are referenced."
- "Open `frontend/src/pages/Projects/list/components/AssignmentRow.tsx` and confirm the passed props match its `AssignmentRowProps`."

Lean constraint:
- "Do not perform global renames. Prefer fixing mismatched call sites to match existing `Props` definitions. Only add a new prop if it represents a distinct concept and wire it end‑to‑end."

Verification:
- `npx tsc --noEmit` passes without ‘Property X does not exist on type Props’ errors.

---

## Phase 4 — Number/String Type Consistency

Prompt:
- "From the collected error list, locate each ‘Argument of type number is not assignable to parameter of type string’ error. For each site:
  - If the target API/rendered prop expects a string (e.g., text input), convert with `String(value)`.
  - If the target API is semantically numeric (e.g., role IDs), update the function signature and downstream types to accept `number | null` as appropriate.
  - Update callers and callee together to keep the contract coherent; do not cast to `any`."

Verification:
- `npx tsc --noEmit` shows no number/string mismatches.

Contract stabilization:
- "Create and use a shared type alias for role selection to prevent drift:
  - Export `type OnRoleSelect = (roleId: number | null, roleName: string | null) => void;`
  - Apply in `ProjectDetailsPanel` and `AssignmentRow` prop types and their callers."

Abort condition:
- "If fixing types requires broad component refactors, stop and propose a minimal interface shim to avoid breaking changes."

---

## Phase 5 — Frontend–Backend Contract Validation (Roles API)

Prompt:
- "Validate that the frontend roles hooks align with backend endpoints. Specifically:
  - `frontend/src/roles/hooks/useProjectRoles.ts` calls `/projects/project-roles/` via the typed `apiClient`. Confirm the backend exposes this route and response shape: `{ id: number; name: string; is_active: boolean; sort_order: number; department_id: number }`.
  - If the backend uses different casing or field names, either map responses to the FE `ProjectRole` shape in a single place or regenerate types from OpenAPI if available.
  - Do not change backend or frontend in isolation; update both ends or add a mapper to maintain separation of concerns."

Sub‑steps:
- "If OpenAPI is authoritative, regenerate client types: `cd frontend && npm run openapi:types`, then reconcile any type changes in FE code."

Migration gating:
- "If regeneration causes broad changes, gate migration behind `VITE_OPENAPI_MIGRATION_ENABLED=false` for production builds. Introduce minimal adapter functions to map backend field casing to FE expectations without invasive refactors."

Additional enforcement:
- "Add a `contract-check` step or job that compiles against generated types or runs unit tests for adapter functions. Fail the build if the contract changes unexpectedly."

Abort condition:
- "If the backend responses diverge from spec and cannot be adapted minimally, stop and request backend schema clarification before proceeding."

---

## Phase 5.5 — Contract Check (Typed or Adapter-Based)

Prompt:
- "Enforce frontend–backend contract consistency with a dedicated check:
  - OpenAPI approach: regenerate types from the backend spec and compile; gate deployment behind a migration flag until fully wired.
  - Adapter approach: add a single, tested mapper that converts backend fields (e.g., snake_case) to frontend types, with unit tests that fail on drift.
  - Add a `contract-check` job (or step) that compiles against generated types or runs adapter tests, failing on unexpected contract changes."

Verification:
- The contract check fails fast on schema drift; fixes are applied centrally (spec or adapter) with minimal code churn.

Abort condition:
- "If backend responses diverge from the documented spec and cannot be adapted minimally, stop and request schema clarification before proceeding."

---

## Phase 6 — Remove Dead/Unreachable Code (Lean Cleanup)

Prompt:
- "Remove any unreachable branches and dead variables discovered during Phase 3–4 (e.g., leftover ‘return’ paths that hide create flows or logging after returns). Keep diffs minimal and scoped."

Verification:
- No functional changes except eliminating dead code; builds and behavior remain correct.

Specific cleanup target:
- "In `frontend/src/pages/People/PersonForm.tsx`, remove unreachable code after early returns and eliminate empty branches, keeping create vs update symmetric and minimal."

---

## Phase 7 — Local Validation Tests

Prompt:
- "Run the local validation battery:
  1) `cd frontend && npm run -s build`
  2) `npx tsc --noEmit`
  3) `npm run -s lint`
  4) `npm run -s test:run` (if meaningful unit tests exist)
  5) Optional: `npm run -s e2e` if Playwright tests are configured for CI.
  Record and resolve any remaining issues before proceeding."

Verification:
- All commands pass with zero TypeScript errors and no critical lint failures.

Additional checks:
- "Run file health scans to catch encoding/line‑ending issues: `npm run -s check:health` (frontend) and `node scripts/scan-file-health.mjs` (repo root). Fix any flagged anomalies."
- "Add a minimal Playwright smoke test for the Projects page to open the status dropdown and role dropdown, using MSW to stub APIs if needed."

Abort condition:
- "If smoke tests indicate user‑visible regressions, stop and fix root causes; do not disable tests or remove features."

---

## Phase 8 — Docker Build Verification (Local)

Prompt:
- "Validate Docker builds locally to mirror Docker Hub:
  - Backend: `docker build -f docker/backend/Dockerfile ./backend`
  - Frontend: `docker build -f docker/frontend/Dockerfile ./frontend`
  Use BuildKit‑enabled Docker. Fix any Dockerfile issues (missing deps, build commands) without adding ad‑hoc hacks."

Verification:
- Both images build successfully locally.

Hardening steps for Dockerfiles:
- "Set `ENV HUSKY=0` in the builder stages to prevent Husky from running during `npm ci` in containers."
- "Use `npm ci` consistently in non‑interactive Docker stages (builder and, if used, dev) for deterministic installs."
- "Decide and document `VITE_API_URL` handling for images. Either pass `--build-arg VITE_API_URL=...` at build‑time or rely on same‑origin. Ensure this is aligned with runtime deployment."

Determinism & tagging:
- "Do not push a `latest` tag implicitly. Push semantic tags on version tags (vX.Y.Z) and branch‑specific tags for non‑release builds. Record image digests in CI logs."

---

## Phase 9 — GitHub Actions and Docker Hub Configuration Check

Prompt:
- "Confirm GitHub Actions secrets and image names are set correctly (no hardcoding in YAML):
  - Secrets: `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `DOCKER_REPO_BACKEND`, `DOCKER_REPO_FRONTEND`.
  - `REGISTRY` in workflow is `docker.io`; image names are `<namespace>/<repo>` without registry prefix.
  - Ensure the repos exist in Docker Hub or the account can create them on first push."

Verification:
- A manual workflow dispatch on the default branch logs in and tags to the expected `docker.io/<namespace>/<repo>` names.

Documentation improvements:
- "Document concrete examples for required secrets:
  - `DOCKER_USERNAME=tschnepf`, `DOCKER_PASSWORD=<token>`
  - `DOCKER_REPO_BACKEND=tschnepf/workload-tracker-backend`
  - `DOCKER_REPO_FRONTEND=tschnepf/workload-tracker-frontend`"

Secret gating (fail fast):
- "Remove fallback image names; require `DOCKER_REPO_BACKEND` and `DOCKER_REPO_FRONTEND`. Fail the workflow if any required secret is missing or empty."

---

## Phase 10 — CI Dry Run and Observability

Prompt:
- "Push a small branch with the fixes. Trigger the workflow via `workflow_dispatch`. Monitor the job logs for:
  - Successful TypeScript build and artifact bundling
  - Successful Docker buildx steps for backend and frontend
  - Pushed tags prefixed for branch/semver as configured by docker/metadata‑action.
  Add concise log notes to a `reports/ci-build-verification.md`."

Verification:
- Workflow completes successfully; Docker Hub shows fresh images.

Upfront TS gate and clearer logs:
- "Add a dedicated CI job before docker/buildx that runs `npm ci`, `npx tsc --noEmit`, and `npm run -s build` in `frontend`. Block Docker jobs unless it succeeds."
- "Improve diagnostics by failing fast and surfacing TypeScript errors (first 100 lines) as a job artifact."

Concurrency & safety:
- "Add a concurrency group to cancel in‑progress runs for the same branch."
- "Restrict image pushing to `main` and tags; for other branches, build but skip push."

Abort conditions:
- "If CI behaves differently from local (e.g., path casing), stop and fix the root cause; do not disable checks."

---

## Phase 11 — Post‑Fix Regression Checks

Prompt:
- "Open the app locally (or in your deployed environment) and perform smoke tests:
  - Projects page: ensure status dropdown renders and works; role selection updates persist.
  - People page: add/edit person; ensure no console errors; skill panels still load.
  - Any routes that rely on roles endpoint continue to function.
  Capture observations in `reports/post-fix-smoke-test.md`."

Verification:
- No regressions observed; UI interactions work as expected.

Rollback readiness:
- "Document the process to revert to the last green SHA if regressions slip through. Ensure image tags/digests allow quick rollback."

---

## Phase 12 — Documentation and Knowledge Capture

Prompt:
- "Document the FE–BE contracts for roles and assignments: endpoint names, fields, and any frontend mappers. Update `README.md` or `docs/` to reflect the current pipeline (secrets, image naming, how to run local Docker builds). Keep it short and accurate."

Verification:
- Docs describe exactly how the CI pushes to Docker Hub and how FE consumes BE role data.

Governance:
- "Enable branch protection to require `frontend-check`, `backend-check`, and (if added) `contract-check` to pass before merging to `main`."

---

Deliverables after executing this plan:
- All TypeScript build errors cleared.
- Consistent component props and types across ProjectsList + ProjectDetailsPanel + AssignmentRow.
- Verified FE–BE alignment for roles and assignment updates.
- Reliable Docker image builds locally and via GitHub Actions to Docker Hub.

