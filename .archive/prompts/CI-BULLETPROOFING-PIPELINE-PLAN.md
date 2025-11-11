# CI Pipeline Bulletproofing Plan (Backend Prechecks, Diagnostics, Multi‑Arch, Runtime Config, Cache Clarity)

Purpose: Elevate the reliability of builds and deployments by adding targeted, best‑practice improvements to CI/CD. This plan follows lean programming principles: minimal, focused changes; no shortcuts, quick fixes, or band‑aids; maintain clarity and correctness; and keep frontend–backend coordination explicit to avoid mismatches.

Editing rules (must follow in every step):
- Use apply_patch for all file changes. Preserve formatting and existing line endings.
- Do not use shell writes (Set‑Content/echo/sed) to modify code. Do not insert literal "\r\n" sequences; let the patch handle newlines.
- Avoid bulk regex replacements; make minimal, contextual edits.
- After each code change, validate with appropriate checks (TypeScript build, tests, or CI dry run).
- Only use best‑practice programming; never remove functionality or add hacks just to make tests pass.

---

## Phase 0 — Baseline Alignment & Guardrails

Prompt:
- "Confirm environment baselines and guardrails before making changes:
  - Pin Node LTS (20.x) across local machines, GitHub Actions, and Docker base images.
  - Verify that frontend path aliases (tsconfig paths and Vite aliases) match and respect case sensitivity.
  - Ensure Dockerfiles already use deterministic installs (`npm ci`) and `HUSKY=0` in container contexts.
  - Do not introduce new packages unless strictly necessary. Keep diffs minimal."

Verification:
- Local `node -v` shows 20.x; Actions setup-node uses 20; Dockerfiles use `node:20-*`.
- Frontend builds successfully locally with `npx tsc --noEmit && npm run -s build` before proceeding.

---

## Phase 1 — Add Backend Prechecks Job (Runs Before Docker Builds)

Prompt:
- "Add a `backend-check` job to `.github/workflows/docker-publish.yml` that runs before Docker builds. Keep it lean and phased:
  1) Add a Node 20 setup step for the backend job (or Python if backend is Python; match the backend stack precisely).
  2) If the backend has tests, run formatter/lint/tests/build in this order; otherwise add a basic `build` or `lint` placeholder that can be expanded later.
  3) Configure `build-and-push` to depend on `backend-check` with `needs: backend-check`.
  4) Do not modify application logic to satisfy tests; fix root causes only."

Verification:
- GitHub Actions runs `backend-check` first; `build-and-push` waits for it.
- When a server‑side regression is introduced, the pipeline stops before Docker builds start.

---

## Phase 2 — Capture Diagnostics as CI Artifacts (Fast Triage)

Prompt:
- "Enhance the existing `frontend-check` (and `backend-check` if applicable) to upload concise error diagnostics when a step fails:
  1) Wrap TypeScript check and test steps with error capture to a file (e.g., `ts-errors.txt`), limited to the first ~100 lines.
  2) Use the `actions/upload-artifact` step to attach the file when the job fails.
  3) Keep logs lean and focused. Do not dump entire logs; preserve only actionable portions."

Verification:
- On failure, CI artifacts include `ts-errors.txt` (and backend equivalents if used) for quick download and analysis.

---

## Phase 3 — Multi‑Arch Docker Builds (If Required)

Prompt:
- "Extend Docker builds to support multiple CPU architectures only if there is a real requirement (e.g., Apple Silicon and x86 servers):
  1) Add `setup-qemu-action` and `setup-buildx-action` with platform support.
  2) Configure `docker/build-push-action` to build for `linux/amd64,linux/arm64`.
  3) Ensure all base images and dependencies support the selected platforms.
  4) Keep the change isolated behind a flag or separate job if needed to manage build time.
  5) Do not degrade reproducibility; keep lockfiles stable."

Verification:
- CI logs show multi‑platform builder active; Docker Hub lists multi‑arch manifests; images pull and run on both x86_64 and ARM64.

---

## Phase 4 — Runtime Configuration Clarity (VITE_API_URL & Reverse Proxy)

Prompt:
- "Document and verify runtime configuration for the frontend:
  1) Decide how `VITE_API_URL` is set for dev, staging, and prod. Align Dockerfile `ARG/ENV` with the deployment method (build‑time arg vs same‑origin behind a reverse proxy).
  2) Create a short checklist in `docs/` or `README.md` for deploying the frontend container behind a reverse proxy (paths, CORS, headers). Include examples.
  3) Validate in a staging environment that requests resolve to the intended API.
  4) Keep documentation concise and authoritative; don’t duplicate content."

Verification:
- A new/updated doc exists describing VITE_API_URL and reverse‑proxy deployment; staging validation confirms correct API routing.

---

## Phase 5 — Cache Clarity & Lockfile Stability (Faster, Predictable Builds)

Prompt:
- "Ensure the CI uses build caches effectively and deterministically:
  1) Confirm buildx steps specify `cache-from: type=gha` and `cache-to: type=gha,mode=max` consistently.
  2) Keep lockfiles (package-lock.json, etc.) under source control and stable; do not mutate them in CI.
  3) Confirm Actions `setup-node` uses `cache: npm` with the correct `cache-dependency-path`.
  4) Document the cache strategy briefly in `README.md` to set expectations for build times and cache behavior."

Verification:
- Subsequent CI runs show reduced build times; caches are hit as expected; no unintended lockfile changes occur.

---

## Phase 6 — Frontend–Backend Contract Sync (No Mismatches)

Prompt:
- "Re‑validate FE–BE contracts after pipeline changes:
  1) For roles/assignments endpoints, confirm the frontend’s expected fields match backend responses. If needed, add small adapter functions (mapping snake_case→camelCase) in one place. Do not scatter conversions across files.
  2) If using OpenAPI, only regenerate types when backend spec changes, and gate larger migrations behind a feature flag to avoid breaking stable flows.
  3) Update documentation for any contract changes."

Verification:
- TypeScript types align with actual API responses; no runtime mapping surprises; unit or smoke tests pass for key flows.

---

## Phase 7 — Testing & Validation Phases

Prompt:
- "Add clear validation phases the agent can run:
  A) Local FE validation: `cd frontend && npx tsc --noEmit && npm run -s build && npm run -s lint`
  B) Local BE validation (stack‑appropriate): run lint/tests/build for the backend.
  C) Minimal E2E smoke tests (optional but recommended): load Projects page, open Status dropdown, open Role dropdown; use MSW or test doubles to keep the test lean and stable.
  D) Docker builds locally (optional): build frontend/backend images to mirror CI.
  E) CI dry run: trigger `workflow_dispatch` to confirm prechecks, diagnostics, and image pushes."

Verification:
- All validation phases succeed or produce concise artifacts for quick triage; images are published when all gates pass.

---

## Phase 8 — Rollout & Monitoring

Prompt:
- "Roll out the enhanced pipeline gradually and observe:
  1) Merge to a feature branch; run CI; verify that prechecks and diagnostics behave as expected.
  2) Merge to main; verify Docker Hub receives new images with the expected tags and (if enabled) multi‑arch manifests.
  3) Capture learnings and update the plan/docs minimally where needed."

Verification:
- Stable runs on feature branches and main; improved signal when failures occur; faster builds due to cache alignment; successful multi‑arch pulls if enabled.

---

Deliverables after executing this plan:
- Backend precheck job precedes Docker builds.
- CI artifacts provide quick error diagnostics on failure.
- Optional multi‑arch builds configured and verified (if required).
- Clear runtime configuration guidance for VITE_API_URL and reverse proxy.
- Documented, effective caching strategy with stable lockfiles.
- Re‑validated FE–BE contracts and lean adapters where necessary.
- Repeatable validation phases for local and CI environments.

