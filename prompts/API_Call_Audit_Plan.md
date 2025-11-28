# API Call Inventory & Bulk Consolidation Audit Plan

_Last updated: November 27, 2025 — owner: Workload Tracker Engineering_

## Mission Statement
- Deliver a phase-based audit that captures every API touchpoint inside `frontend/src/pages/**` and shared hooks so we can replace bursty per-component requests with deliberate bulk endpoints.
- Feed each phase outcome directly into `prompts/API_Bulk_Consolidation_Tracker.md`, ensuring backend+frontend coordination, typed contract snapshots, and regression testing plans exist before any code change ships.

## Non-Negotiable Guardrails
1. **Lean programming only** – Every task must explicitly state: “Using lean programming best practices (shortcuts, quick fixes, and band-aid solutions are not acceptable).”
2. **Fact-based documentation** – No assumptions. Each call graph entry must cite `file.tsx:line` and be reproducible via committed scripts under `reports/api-audit/`.
3. **Backend alignment** – Do not propose a bulk endpoint without a documented confirmation (meeting notes or issue link) from backend owners. Capture confirmations in the tracker with date + contact.
4. **Risk & rollback awareness** – Maintain a per-phase risk register covering rate limits, auth scopes, pagination, cache invalidations, and rollback levers (feature flags, dual writes).
5. **Two-layer validation** – (a) Automation: run the prescribed scripts/tests; (b) Human review: at least two reviewers sign off before a phase closes.
6. **Testing discipline** – Each phase ends with a distinct testing step describing Playwright/Vitest/unit coverage plus monitoring hooks required before implementation begins.

## Global Workflow & Gating Checklist
For every phase below, the AI Agent must follow this templated flow and only move on when all boxes are checked:
1. **Instrumentation Prompt** – Create/refresh scripts producing machine-readable inventories (`reports/api-audit/phaseN/*.json`).
2. **Analysis Prompt** – Document findings with exact file:line references and trigger conditions.
3. **Tracker Prompt** – Update `API_Bulk_Consolidation_Tracker.md` via PR-ready diff (draft first, then reviewed entry).
4. **Backend Coordination Prompt** – Record confirmation that backend agrees with the proposed consolidation scope + payload sketch.
5. **Testing Prompt** – Define automated/manual validation the AI Agent (or CI) must execute when implementing the consolidation.
6. **Risk Register Prompt** – Append/refresh `reports/api-audit/risks.md` with new risks + mitigations.

The prompts below are written so they can be re-run verbatim. Break a step into sub-steps whenever the action would otherwise mix tooling, analysis, and coordination.

---

## Phase 0 – Baseline Instrumentation & Governance (Week 1)
Scope: entire repo (services, hooks, routed pages). Goal: stand up automation, governance artifacts, and tracker scaffolding before touching individual features.

1. **Step 0.1 – "Using lean programming best practices (shortcuts, quick fixes, and band-aid solutions are not acceptable), script a repo-wide service + hook inventory that enumerates every export from `frontend/src/services/**/*.ts` and `frontend/src/hooks/**/*.ts` that performs I/O, writing JSON + CSV outputs under `reports/api-audit/phase0/` along with the exact `rg` commands used."**
2. **Step 0.1a – "Using lean programming best practices (no shortcuts), capture canonical response samples for each service client by recording live/mock JSON payloads (sanitize secrets) and storing them in `reports/api-audit/contracts/<service>.json` so future bulk proposals cannot drift from current contracts."**
3. **Step 0.2 – "Using lean programming best practices (no shortcuts), draft `reports/api-audit/checklist-phase0.md` listing verification steps (scripts executed, reviewers assigned, backend contacts) and do not close the phase until every box is checked."**
4. **Step 0.3 – "Using lean programming best practices (no shortcuts), scaffold `prompts/API_Bulk_Consolidation_Tracker.md` sections (Assignments, Projects, People, Dashboard, Reports, Settings/Auth) and log the current automation outputs + open backend questions in the tracker change log."**
5. **Step 0.4 – Testing Prompt – "Using lean programming best practices (no shortcuts), run `npm run lint`, `npm run test -- --runInBand`, and `npm run typecheck` inside `frontend/` to guarantee the instrumentation changes did not regress the build; store logs under `reports/api-audit/phase0/tests`."**
6. **Step 0.5 – Risk Register Prompt – "Using lean programming best practices (no shortcuts), create `reports/api-audit/risks.md` capturing at least auth, pagination, and caching risks discovered during Phase 0 along with mitigation + rollback strategies."**

---

## Phase 1 – Assignments Surfaces (Week 2)
Scope: `frontend/src/pages/Assignments/**/*` plus supporting hooks/services; objective: eliminate per-row/per-project fan-out by designing bulk assignment payloads with airtight validation.

1. **Step 1.1 – "Using lean programming best practices (shortcuts, quick fixes, and band-aid solutions are not acceptable), expand the Phase 0 scripts to emit per-file API call graphs for `frontend/src/pages/Assignments`, `frontend/src/services/projectAssignmentsApi.ts`, and `frontend/src/pages/Assignments/grid/**/*`, persisting both graphviz and JSON representations to `reports/api-audit/phase1/call-graphs`."**
2. **Step 1.1a – "Using lean programming best practices (no shortcuts), annotate each graph node with trigger conditions (hover, scroll, filter change) and estimated frequency derived from analytics or telemetry stubs, saving the metadata next to the call graphs."**
3. **Step 1.2 – "Using lean programming best practices (no shortcuts), produce a prescriptive dossier per routed page (`ProjectAssignmentsGrid`, `AssignmentGrid`, `AssignmentList`, `AssignmentForm`) that lists: file:line of every API call, current caching layer, data contract snapshot path, and observed redundancy; commit dossiers under `reports/api-audit/phase1/pages/`."**
4. **Step 1.3 – "Using lean programming best practices (no shortcuts), draft tracker updates describing the proposed `/assignments/project-grid`, `/assignments/person-grid`, `/assignments/list-with-metadata`, and `/assignments/form-bootstrap` payloads, but keep them in a staging diff until backend confirmation is logged."**
5. **Step 1.4 – "Using lean programming best practices (no shortcuts), run a backend coordination checklist: share the Phase 1 dossier with backend owners, record their feedback + approvals (or blockers) inside `reports/api-audit/phase1/backend-approvals.md`, and only then promote tracker entries from draft to ready."**
6. **Step 1.5 – Testing Prompt – "Using lean programming best practices (no shortcuts), specify the automated tests needed once bulk endpoints exist: (a) Vitest unit tests for `useAssignmentsSnapshot`, `useAssignmentsInteractionStore`; (b) Playwright touch-mode runs for grid, list, and form flows at 390px/1024px using mocked bulk endpoints; (c) React Query contract tests ensuring cache hydration equals legacy payloads. Document under `reports/api-audit/phase1/testing-plan.md`."**
7. **Step 1.6 – Risk Register Prompt – "Using lean programming best practices (no shortcuts), update `reports/api-audit/risks.md` with assignments-specific risks (e.g., partial success handling, optimistic update rollbacks, deliverable marker mismatches) and mitigation strategies."**

---

## Phase 2 – Projects & Deliverables (Week 3)
Scope: `frontend/src/pages/Projects/**/*`, `frontend/src/pages/Deliverables/Calendar.tsx`, and shared hooks; focus on bundling project lists + deliverable previews without starving virtualization.

1. **Step 2.1 – "Using lean programming best practices (shortcuts, quick fixes, and band-aid solutions are not acceptable), extend the instrumentation scripts to cover `frontend/src/pages/Projects` and `frontend/src/pages/Deliverables`, capturing call graphs, response samples, and filter triggers for `useProjects`, `useProjectAssignments`, `useProjectDeliverablesBulk`, `usePersonSearch`, and deliverable calendar hooks."**
2. **Step 2.2 – "Using lean programming best practices (no shortcuts), map dependencies between project list selections and the deliverables calendar by producing a shared dependency diagram stored at `reports/api-audit/phase2/projects-deliverables-deps.md`, highlighting where both features rely on the same endpoints."**
3. **Step 2.3 – "Using lean programming best practices (no shortcuts), craft prescriptive prompts for `/projects/list?include=*` and `/deliverables/calendar-plus` (or equivalent) that specify required fields, paging strategy, cache keys, and backward-compat flags; log drafts in the tracker but gate finalization on backend sign-off."**
4. **Step 2.4 – "Using lean programming best practices (no shortcuts), obtain backend approvals documenting schema versioning + rollout (dual endpoints vs. param-based expansion) and record them in `reports/api-audit/phase2/backend-approvals.md` before editing the tracker."**
5. **Step 2.5 – Testing Prompt – "Using lean programming best practices (no shortcuts), define the regression matrix covering virtualization, inline edits, deliverable previews, and quick view interactions: include React Testing Library suites for hook consumers, Playwright deep-link navigation tests, and snapshot comparisons of deliverable timelines. Store under `reports/api-audit/phase2/testing-plan.md`."**
6. **Step 2.6 – Risk Register Prompt – "Using lean programming best practices (no shortcuts), log risks around oversized payloads, deliverable range overlaps, and quick view prefetch timing; propose mitigations such as incremental fetching, abort controllers, and telemetry dashboards."**

---

## Phase 3 – People, Departments, Skills (Week 4)
Scope: `frontend/src/pages/People/**/*`, `frontend/src/pages/Departments/**/*`, `frontend/src/pages/Skills/**/*`, shared bulk actions hooks, and metadata caches.

1. **Step 3.1 – "Using lean programming best practices (shortcuts, quick fixes, and band-aid solutions are not acceptable), generate a consolidated metadata inventory showing every place departments, roles, skills, and pagination cursors are fetched; save findings to `reports/api-audit/phase3/metadata-matrix.csv`."**
2. **Step 3.2 – "Using lean programming best practices (no shortcuts), document state synchronization requirements (bulk actions, pagination cursors, filters) and specify how a `/people/list?include=departments,roles,skills` or `/departments/tree-with-meta` payload would version caches; output to `reports/api-audit/phase3/state-sync.md`."**
3. **Step 3.3 – "Using lean programming best practices (no shortcuts), stage tracker entries for People/Departments/Skills bulk endpoints plus any shared bootstrap (e.g., `/skills/bootstrap`), and include explicit cache version + invalidation rules in each entry prior to backend review."**
4. **Step 3.4 – "Using lean programming best practices (no shortcuts), coordinate with backend on metadata versioning + pagination constraints, obtaining approvals in `reports/api-audit/phase3/backend-approvals.md` before finalizing tracker updates."**
5. **Step 3.5 – Testing Prompt – "Using lean programming best practices (no shortcuts), define tests ensuring infinite scroll, bulk actions, and skills management stay consistent when consuming consolidated payloads: Playwright scripts for bulk edits, Vitest suites for hooks, and contract tests for cache hydration. Save plan to `reports/api-audit/phase3/testing-plan.md`."**
6. **Step 3.6 – Risk Register Prompt – "Using lean programming best practices (no shortcuts), capture risks around stale metadata, partial bulk updates, and permissions mismatches, outlining monitoring and rollback levers."**

---

## Phase 4 – Dashboard & Personal Surfaces (Week 5)
Scope: `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Personal/PersonalDashboard.tsx`, shared analytics widgets, `useCapacityHeatmap`, `useDeliverablesCalendar`, and `usePersonalWork`.

1. **Step 4.1 – "Using lean programming best practices (shortcuts, quick fixes, and band-aid solutions are not acceptable), instrument every effect inside Dashboard + Personal pages to log API dependencies, timing, and data overlap, persisting traces to `reports/api-audit/phase4/dashboard-traces.json`."**
2. **Step 4.2 – "Using lean programming best practices (no shortcuts), design a `/dashboard/bootstrap` and `personal/work+` schema proposal that enumerates required analytics cards, heatmap data, department lists, and widget payloads, including feature flags + telemetry fields; capture drafts under `reports/api-audit/phase4/payload-proposals.md`."**
3. **Step 4.3 – "Using lean programming best practices (no shortcuts), hold a backend review focused on caching strategy, TTLs, and authorization. Document approvals, cache key formats, and rollout sequence (dual-read, feature flag, kill-switch) inside `reports/api-audit/phase4/backend-approvals.md` before editing the tracker."**
4. **Step 4.4 – Testing Prompt – "Using lean programming best practices (no shortcuts), write a testing directive covering Playwright viewports (360/414/768/1024), mocked analytics payloads, and monitoring dashboards (latency + cache hit rates). Include instructions for diffing summary cards vs. existing data. Save to `reports/api-audit/phase4/testing-plan.md`."**
5. **Step 4.5 – Risk Register Prompt – "Using lean programming best practices (no shortcuts), log risks tied to stale heatmap caches, cross-route filter sync, and personal dashboard auth scoping, with mitigations like background refreshes and feature flag fallbacks."**

---

## Phase 5 – Reports & Analytics (Week 6)
Scope: `frontend/src/pages/Reports/**/*`, `hooks/useExperience.ts`, analytics cards reused elsewhere.

1. **Step 5.1 – "Using lean programming best practices (shortcuts, quick fixes, and band-aid solutions are not acceptable), audit each report (RoleCapacity, TeamForecast, PersonExperience) to document overlapping aggregations with Dashboard/Assignments, preserving file:line references and data contract snapshots under `reports/api-audit/phase5/report-notes`."**
2. **Step 5.2 – "Using lean programming best practices (no shortcuts), propose shared bulk endpoints (e.g., `/reports/team-forecast?include=projects`, `/experience/person/bootstrap`) that reuse Dashboard/People caches, detailing fallback paths if data is stale; add drafts to the tracker pending backend review."**
3. **Step 5.3 – "Using lean programming best practices (no shortcuts), confirm backend alignment on aggregation reuse, caching windows, and pagination, logging signed approvals in `reports/api-audit/phase5/backend-approvals.md` before updating the tracker."**
4. **Step 5.4 – Testing Prompt – "Using lean programming best practices (no shortcuts), outline integration tests ensuring reports consume shared payloads without double-fetching: Vitest suites for hooks, Playwright PDF/export validation, and monitoring for calculation drift. Save to `reports/api-audit/phase5/testing-plan.md`."**
5. **Step 5.5 – Risk Register Prompt – "Using lean programming best practices (no shortcuts), document risks about report latency, historical data retention, and version skew vs. dashboard caches, pairing each risk with telemetry requirements."**

---

## Phase 6 – Settings & Auth Bootstrap (Week 7)
Scope: `frontend/src/pages/Settings/**/*`, `frontend/src/pages/Auth/**/*`, `useCapabilities`, `SettingsDataContext`, auth bootstrap flows.

1. **Step 6.1 – "Using lean programming best practices (shortcuts, quick fixes, and band-aid solutions are not acceptable), map every API call triggered when the app launches and when Settings sections mount, capturing traces/logs under `reports/api-audit/phase6/boot-sequence.json`."**
2. **Step 6.2 – "Using lean programming best practices (no shortcuts), design `/session/bootstrap` and `/settings/bootstrap` payload proposals that specify user profile, capabilities, department tree, admin resources, and feature flags, along with ETag/version fields to avoid stale caches; store drafts in `reports/api-audit/phase6/payload-proposals.md`."**
3. **Step 6.3 – "Using lean programming best practices (no shortcuts), validate proposals with backend, documenting auth + security considerations, rollout order (login -> bootstrap -> page render), and kill switches inside `reports/api-audit/phase6/backend-approvals.md` before touching the tracker."**
4. **Step 6.4 – Testing Prompt – "Using lean programming best practices (no shortcuts), define automated smoke tests for login/reset/set-password flows plus Settings split-pane rendering using mocked bootstrap payloads, ensuring capability changes propagate without extra requests. Save to `reports/api-audit/phase6/testing-plan.md`."**
5. **Step 6.5 – Risk Register Prompt – "Using lean programming best practices (no shortcuts), log bootstrap-specific risks (token expiry during bulk fetch, massive payload sizes, privacy of admin data) and specify mitigations such as incremental hydration and secure storage."**

---

## Phase 7 – Cross-Phase Validation & Exit Criteria (Week 8)
Scope: ensure the entire audit stayed accurate and action-ready before implementation kicks off.

1. **Step 7.1 – "Using lean programming best practices (shortcuts, quick fixes, and band-aid solutions are not acceptable), rerun every instrumentation script, diff the outputs against earlier snapshots, and flag any drift that must be reconciled before coding bulk endpoints; document results in `reports/api-audit/phase7/regression-diffs.md`."**
2. **Step 7.2 – "Using lean programming best practices (no shortcuts), perform a tracker quality gate: verify each entry lists (a) confirmed backend scope, (b) testing plan link, (c) rollback/feature-flag plan, and (d) owner/status; note gaps and assign follow-ups before sign-off."**
3. **Step 7.3 – "Using lean programming best practices (no shortcuts), convene a final backend+frontend review to approve the prioritized implementation order, documenting decisions, dependencies, and monitoring requirements in `reports/api-audit/phase7/final-approvals.md`."**
4. **Step 7.4 – Testing Prompt – "Using lean programming best practices (no shortcuts), prepare an aggregate testing roadmap describing how future PRs must reference the phase-specific testing plans, including CI hooks, Playwright nightly suites, and telemetry dashboards. Store under `reports/api-audit/phase7/testing-roadmap.md`."**
5. **Step 7.5 – Risk Register Prompt – "Using lean programming best practices (no shortcuts), close the risk register by marking mitigated items, elevating unresolved risks, and proposing monitoring dashboards required during implementation."**

---

## Success Metrics
- 100% of routed pages have machine-readable call graphs, contract snapshots, backend approvals, and testing plans before any code refactor begins.
- Tracker entries include owner, status, backend confirmation, testing references, and rollback notes.
- Risk register remains current, with no unresolved high-risk items entering implementation.

Adhering to this prescriptive, prompt-driven plan ensures the AI Agent operates with precise instructions, keeps backend + frontend perfectly aligned, and prevents code-breaking surprises when consolidating API calls into bulk endpoints.
