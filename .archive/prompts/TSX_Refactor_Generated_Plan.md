# TS/TSX Refactor Generated Plan  Phased, Prescriptive, Repo-Wide (Fast Mode)

Generated at: 2025-10-07
Commit: d5c207c0d988002a1190789aa5826fd5762478c9
Mode: fast (top candidates by size/priority)
Scope: frontend/src/**/*.{ts,tsx} (excluding generated, tests, stories, mockups)

Lean rules: no shortcuts, no band-aids, safe increments, stable contracts, verify continuously.

---

## Phase 0  Preconditions and Baseline

Step 0.0  Lint strategy and resolver setup

Prompt:
```
AI-Agent, set up a safe lint strategy for refactors:
- Add a new npm script `lint:soft` that runs the same command as `lint` but without `--max-warnings 0`.
- Keep `lint`/`lint:ci` strict for CI. Use `lint:soft` during Phases 2–4 to avoid blocking on new warnings.
- Prepare to add `eslint-plugin-import` and configure a TS resolver so alias `@` imports are correctly resolved.
Notes: Do not alter unrelated lint rules or project code yet.
```

Step 0.1  Verify environment and capture baseline

Prompt:
```
AI-Agent, verify the dev environment and capture a baseline:
- Run frontend typecheck and unit tests: `npm --prefix frontend run build` then `npm --prefix frontend run test:run`.
- Record baseline commit SHA and timestamp.
- Save current sizes (bytes) of top 10 largest TS/TSX files under `frontend/src`, path + size only.
- Confirm `frontend/tsconfig.json` path aliases are respected (baseUrl, paths) and Vite aliases are configured.
- Output a short report in prompts/analysis-baseline.txt with the above.
Requirements: Do not modify code. If anything fails, stop and report exact error.
```

Step 0.2  Confirm generated/backends coordination

Prompt:
```
AI-Agent, ensure backend/frontend contracts stay aligned:
- Confirm backend OpenAPI file exists: `backend/openapi.json`.
- Regenerate frontend OpenAPI types without modifying any other code: `npm --prefix frontend run openapi:types`.
- Verify that no changes outside `frontend/src/api/schema.ts` occur.
- If the generated file changes significantly, note the diff size and warn.
Constraints: Never edit backend endpoints or serializers during refactor; treat OpenAPI types as read-only generated code.
```

Step 0.3  Prepare ESLint guardrails (diff only)

Prompt:
```
AI-Agent, prepare ESLint guardrails (diff only):
- Use prompts/eslint-guardrails.diff as the proposed patch for:
  - Adding devDependencies: eslint-plugin-react, eslint-plugin-import, eslint-import-resolver-typescript
  - Updating frontend/eslint.config.js with: max-lines (warn 400), max-lines-per-function (warn 200), complexity (warn 10), max-depth (warn 3), react/jsx-max-depth (warn 3), import/no-cycle (warn)
  - Add `settings` for `import/resolver: { typescript: { project: 'frontend/tsconfig.json' } }` so `@` paths resolve
- Do not apply yet; keep for Phase 4.
```

Step 0.4  Freeze critical keys and event topics

Prompt:
```
AI-Agent, record contracts to remain unchanged during refactor:
- React Query: capture all keys and invalidation calls in AssignmentGrid (e.g., ['capacityHeatmap'], ['workloadForecast']).
- Event bus: capture `subscribeGridRefresh` topic/signature and where it is subscribed.
- Export surfaces: note default exports for moved components.
Deliverable: Append the list to prompts/analysis-baseline.txt and reference it as a Safety Gate.
```

---

## Phase 1  Deterministic Analysis (Artifacts Only)

Step 1.1  Schemas and examples

Prompt:
```
AI-Agent, confirm analysis schemas and examples exist:
- `analysis/schemas/metrics.schema.json` and `analysis/schemas/plan.schema.json`
- `analysis/examples/metrics.example.json` and `analysis/examples/plan.example.json`
- If missing, create them; keep strict types/enums/ranges and environment fields.
```

Step 1.2  CLI runner spec

Prompt:
```
AI-Agent, confirm prompts/analysis-runner-spec.md exists and documents flags, exit codes, determinism, and partial results policy. If missing, create it.
```

Step 1.3  Risk detectors doc

Prompt:
```
AI-Agent, extend prompts/TSX_Refactor_Plan_Critique_and_Steps.md with a "Risk Detectors" subsection and `risks[]` in plan.json proposals, covering contexts/providers, event bus/singletons, and react-query keys.
```

---

## Phase 2  Safe In-Place Extraction (Per File)

Use the following step templates for each file. For `.tsx` UI files, use the Component template; for `.ts` modules, use the Module template.

Component Template: Step 2.1  Identify seams (no moves)
```
AI-Agent, inspect <FILE> and identify pure presentational seams suitable for in-place extraction without changing behavior:
- Candidates: small visual pieces (cells, dropdowns, badges), repeated JSX chunks, simple wrappers.
- Produce a minimal prop contract for each (explicit props only, no implicit globals).
- Output a summary in prompts/<SAFE_NAME>-seams.md: component name, props, responsibilities, DOM/a11y constraints.
Constraints: Do NOT edit code yet. Prioritize smallest safe seams. Presentational seams must NOT call data hooks (react-query, useCapabilities), subscribe to global busses, or change focus/blur timing. Lean only; no shortcuts.
```

Component Template: Step 2.2  Extract presentational subcomponents in place
```
AI-Agent, in <FILE>, perform in-file extraction of the agreed pure presentational subcomponents.
Rules:
- No behavior changes; preserve DOM structure, a11y attributes, focus/blur behavior, absolute/relative positioning.
- Use explicit props only.
- Keep list key semantics identical.
Validation:
- `npm --prefix frontend run build` and `npm --prefix frontend run test:run`
- (If available) smoke: main screen interactions still work as before.
Deliverable: Report LOC decrease in the main component and list new in-file component definitions.
```

Component Template: Step 2.1.1  DOM/a11y snapshot check
```
AI-Agent, before and after extraction, assert that targeted seams keep their first rendered element, role, aria-attrs, tabIndex, data-testid, and wrapper/positioning unchanged. Abort if any mismatch.
```

Component Template: Step 2.3  Introduce pure hooks in place
```
AI-Agent, in <FILE>, extract pure hooks in place (same file) for local interaction logic (selection, editing, keyboard handling, derived options).
Rules:
- Inputs/outputs explicit; no hidden state; no new conditional hook calls; preserve hook call order.
- Keep react-query key usage unchanged.
Validation: same as Step 2.2. Deliverable: prompts/<SAFE_NAME>-hooks.md listing hook signatures and responsibilities.
```

Component Template: Step 2.3.1  Hook order assertion
```
AI-Agent, after extracting hooks, confirm hook call order is identical and no new conditional calls were introduced. Run typecheck to validate.
```

Module Template: Step 2.M  Identify and extract pure utilities (no moves)
```
AI-Agent, inspect <FILE> and identify pure utility seams suitable for in-place extraction:
- Candidates: formatting, mapping, validation, key factories, small reusable helpers.
- Define minimal function signatures (explicit args, typed returns). Avoid side effects.
- Do NOT change behavior. Output summary to prompts/<SAFE_NAME>-module-seams.md.
```

---

## Phase 3  Move to Files, Keep APIs Stable (Per File)

Component Template: Step 3.1  Move subcomponents
```
AI-Agent, move extracted presentational components from <FILE> to:
- frontend/src/pages/**/grid/components/
- Update imports in <FILE> accordingly.
Rules:
- Prefer alias paths (e.g., @/pages/.../grid/components/<Name>) over deep relatives; avoid import cycles.
- Behavior and exports must remain stable; re-export if needed.
 - Align with existing `grid/*` layout: do not relocate existing files; only add new files to avoid churn.
Validation: build + unit + smoke.
```

Component Template: Step 3.2  Move hooks
```
AI-Agent, move hooks to:
- frontend/src/pages/**/grid/hooks/
- Update imports in <FILE> accordingly.
Rules: preserve signatures, call order, and side-effects.
Notes: If the app already keeps hooks directly under `grid/`, colocate new hooks there to match the current pattern and reduce import churn.
Validation: build + unit + smoke.
```

Component Template: Step 3.3  Extract shared utils (optional)
```
AI-Agent, create or update shared util modules (e.g., frontend/src/util/deliverables.ts) and replace inline implementations in <FILE> with imports. Do not modify generated types or API services.
Validation: build + unit + smoke.
```

Component Template: Step 3.3.1  Deliverables util guard
```
AI-Agent, when extracting `classifyDeliverableType` and deliverable color mappings, keep signatures and default/fallback logic identical. Add a minimal unit test to confirm existing classifications map to the same labels/colors.
```

Component Template: Step 3.4  Extract major row/container (if present)
```
AI-Agent, move major subcomponent (e.g., AssignmentRow) to grid/components/<Name>.tsx with a typed props interface. Update <FILE> to import it.
Rules: preserve overlay positioning, focus/blur timing, and list keys.
Validation: build + unit + smoke.
```

Module Template: Step 3.M  Move utilities to module files
```
AI-Agent, create a sibling `utils/` or `internal/` folder appropriate to <FILE>s domain and move extracted pure functions there. Add index.ts barrel if ergonomics improve and no cycles are introduced.
- Public API must remain stable; add re-exports to maintain import paths.
Validation: build + unit.
```

Module Template: Step 3.M.1  API split guard (services/api.ts)
```
AI-Agent, if splitting `frontend/src/services/api.ts`, move helpers into `services/internal/*` and re-export from `services/api.ts` so existing imports remain valid. Run an import cycle check and avoid deep renames in fast mode.
```

---

## Phase 4  Guardrails and Cleanup

Step 4.1  Apply ESLint guardrails
```
AI-Agent, apply the ESLint guardrails using prompts/eslint-guardrails.diff:
- Add devDependencies and update ESLint rules as specified.
- Configure `import/resolver` for TypeScript project so alias imports resolve.
- Run `npm --prefix frontend run lint:soft` during refactor to avoid blocking on warnings. Adjust only newly extracted code to satisfy warnings. Do not refactor unrelated files.
Validation: build + unit + lint (soft); smoke.
```

Step 4.1.1  Alias resolution check
```
AI-Agent, confirm `@` alias resolution is intact in both `tsconfig.json` and `vite.config.ts`, and in ESLint import resolver. Abort if unresolved import warnings appear.
```

Step 4.2  Dead code removal and prop tightening
```
AI-Agent, remove dead code and tighten types in newly extracted components/hooks/modules only. Do not change behavior or public exports.
Validation: build + unit + smoke.
```

---

## Phase 5  Backend/Frontend Contract Verification

Step 5.1  Post-refactor contract check
```
AI-Agent, verify alignment:
- Re-run `npm --prefix frontend run openapi:types`. Only `frontend/src/api/schema.ts` should change if backend OpenAPI changed.
- Ensure API clients and react-query hooks compile and tests pass.
- Confirm alias resolution intact; no broken imports.
 - Verify no public API client symbol names changed; report offending identifiers/files if any do.
Validation: build + unit.
```

---

## Phase 6  Testing and Acceptance

Step 6.0  Unit seeds for new extractions
```
AI-Agent, add minimal unit tests for newly extracted grid components/hooks and deliverables utils. Keep tests lean (render/props/interaction) and avoid network.
```

Step 6.1  Unit and type tests
```
AI-Agent, add/update minimal unit tests for extracted components/hooks/modules only. Keep tests lean and focused.
Validation: `npm --prefix frontend run test:run` passes.
```

Step 6.2  Smoke e2e (critical flows)
```
AI-Agent, run smoke flows for affected screens (e.g., Assignments grid):
- Edit weekly hours and save
- Change project role via dropdown (mouse + keyboard)
- Change project status and see badge update
- Remove an assignment and confirm cache/UI update
Validation: All pass without flakiness.
Notes: If a live backend is unavailable, run with MSW mocks or skip Playwright in CI (gate on BACKEND_URL/CI_SMOKE).
```

Step 6.3  Metrics delta and LOC reduction
```
AI-Agent, report improvements:
- Compute LOC reduction for each refactored file and list new files LOC.
- Confirm =15% LOC reduction on each targeted file without behavior changes.
- Write prompts/refactor-metrics-delta.md.
```

---

## Phase 7  Optional State Unification

Step 7.1  Local reducer (optional)
```
AI-Agent, optionally unify scattered UI state with a local useReducer in complex screens. Keep public callbacks/props unchanged and preserve memoization. Abort if hooks order/providers risk is detected.
Validation: build + unit + smoke.
```

Step 7.0  Reducer guard (pre-check)
```
AI-Agent, before adding reducers, run risk detectors for contexts/providers and hook-order sensitivity. Abort this step if any risk is detected; defer to a dedicated PR.
```

---

## Phase 8  Rollout and Baseline Update

Step 8.1  Update baselines and docs
```
AI-Agent, finalize:
- Update analysis/baseline artifacts and metrics deltas.
- Summarize confirmed Safety Gates in prompts/TSX_Refactor_Plan_Critique_and_Steps.md.
- Queue follow-ups for the next top candidates.
```

---

## Per-File Worklist (Fast Mode)

Below, repeat Phases 23 templates for each file. Use Component template for .tsx, Module template for .ts.

1) frontend/src/pages/Assignments/AssignmentGrid.tsx  Component
- Apply Steps: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4
- Notes: interactions heavy; preserve focus/blur and absolute menus; react-query keys and gridRefreshBus must remain unchanged. Do not relocate existing `grid/*` helpers; add new files only. Extract deliverables util behind stable API.

2) frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx  Component
- Apply Steps: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4
- Notes: similar risks to AssignmentGrid; prioritize subcomponents first; align with existing `grid/*` structure (do not relocate existing files in fast mode).

3) frontend/src/pages/Projects/ProjectsList.tsx  Component
- Apply Steps: 2.1, 2.2, 2.3, 3.1, 3.2, (3.3 if shared utils emerge)

4) frontend/src/pages/People/PeopleList.tsx  Component
- Apply Steps: 2.1, 2.2, 2.3, 3.1, 3.2

5) frontend/src/services/api.ts  Module
- Apply Steps: 2.M, 3.M
- Notes: split key factories, error mapping, caching/etag helpers, and fetch wrapper into internal modules with re-exports. Public API unchanged.

6) frontend/src/pages/Assignments/AssignmentForm.tsx  Component
- Apply Steps: 2.1, 2.2, 2.3, 3.1, 3.2

7) frontend/src/pages/Dashboard.tsx  Component
- Apply Steps: 2.1, 2.2, 2.3, 3.1

8) frontend/src/pages/Skills/SkillsDashboard.tsx  Component
- Apply Steps: 2.1, 2.2, 2.3, 3.1

9) frontend/src/components/layout/Sidebar.tsx  Component
- Apply Steps: 2.1, 2.2, 3.1 (menu items, sections)

10) frontend/src/components/deliverables/DeliverablesSection.tsx  Component
- Apply Steps: 2.1, 2.2, 3.1; consider moving deliverable type utils to shared `util/deliverables.ts` (3.3)

11) frontend/src/pages/Departments/ReportsView.tsx  Component
- Apply Steps: 2.1, 2.2, 3.1

12) frontend/src/pages/Settings/Settings.tsx  Component
- Apply Steps: 2.1, 2.2, 3.1

13) frontend/src/pages/Departments/DepartmentsList.tsx  Component
- Apply Steps: 2.1, 2.2, 3.1

14) frontend/src/pages/People/PersonForm.tsx  Component
- Apply Steps: 2.1, 2.2, 3.1

15) frontend/src/pages/Projects/ProjectForm.tsx  Component
- Apply Steps: 2.1, 2.2, 3.1

16) frontend/src/utils/monitoring.tsx  Module (TSX utils)
- Apply Steps: 2.M, 3.M; centralize monitoring helpers, avoid duplication.

---

Notes
- Generated files (frontend/src/api/schema.ts) are excluded from refactor.
- Mockup components are excluded by default.
- Fast mode targets the highest-impact files first; switch to full mode for exhaustive coverage.
