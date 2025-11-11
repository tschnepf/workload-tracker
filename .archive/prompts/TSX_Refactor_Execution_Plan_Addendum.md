# TS/TSX Refactor Execution Plan — Hardening Addendum (Fool‑Proof Updates)

This addendum strengthens the original Execution Plan with additional guardrails and sequencing to avoid regressions while refactoring.

---

Phase 0 — Preconditions and Guardrails
- Step 0.0 — Lint strategy & resolver
  - Add npm script `lint:soft` mirroring `lint` but without `--max-warnings 0`. Use `lint:soft` during development; keep `lint` strict for CI.
  - Plan to add `eslint-plugin-import` and `eslint-import-resolver-typescript`. Configure ESLint settings: `import/resolver: { typescript: { project: 'frontend/tsconfig.json' } }` to resolve `@` alias.
- Step 0.3 (amend)
  - Include the resolver settings and the additional devDependency above in `prompts/eslint-guardrails.diff`.
- Step 0.4 — Freeze keys and topics
  - Record React Query keys/invalidation calls in AssignmentGrid (e.g., `['capacityHeatmap']`, `['workloadForecast']`).
  - Record `subscribeGridRefresh` signature and usage; and note default exports for moved components. Append to `prompts/analysis-baseline.txt`.

Phase 2 — In‑Place Extraction
- Step 2.1 (amend)
  - Presentational seams must NOT call data hooks (react-query, `useCapabilities`), subscribe to global busses, or alter focus/blur timings.
- Step 2.1.1 — DOM/a11y snapshot
  - Capture first element type, role, aria-attrs, tabIndex, data-testid, and positioning before and after extraction; abort on mismatch.
- Step 2.3.1 — Hook order assertion
  - Verify no new conditional hooks; ensure hook call order unchanged. Run typecheck.

Phase 3 — Moves With Stable APIs
- Step 3.1/3.2 (amend)
  - Align with existing `grid/*` layout: do NOT relocate existing files in fast mode; only add new ones to reduce churn.
- Step 3.3.1 — Deliverables util guard
  - Extract `classifyDeliverableType` and color mappings with identical signatures and defaults; add one unit test to confirm mappings.
- Step 3.M.1 — API split guard (services/api.ts)
  - If splitting, place helpers in `services/internal/*` and re-export from `services/api.ts` to keep imports stable; avoid deep renames and cycles.

Phase 4 — ESLint & Cleanup
- Step 4.1 (amend)
  - Configure plugin-import TS resolver; run `npm --prefix frontend run lint:soft` and adjust only new extractions. Leave unrelated files unchanged in fast mode.
- Step 4.1.1 — Alias resolution check
  - Verify `@` alias resolution via tsconfig, vite config, and ESLint resolver; fail early on unresolved import warnings.

Phase 5 — Contracts
- Additional check
  - Verify no public API client symbol names changed; if any do, report exact identifiers and files.

Phase 6 — Tests & Acceptance
- Step 6.0 — Unit seeds for new extractions
  - Add minimal tests for new grid components/hooks and `util/deliverables.ts` (render/props/simple interaction). Avoid network.
- Step 6.2 (amend)
  - Gate Playwright on a live backend or MSW; allow skipping in CI via `BACKEND_URL`/`CI_SMOKE` to avoid flakes.

Phase 7 — Optional Reducer
- Step 7.0 — Reducer guard (pre-check)
  - Run risk detectors for contexts/providers, singletons, and hook order. Abort reducer consolidation if risk detected; defer to a dedicated PR.

---

Notes
- Apply this addendum together with the original Execution Plan. Where steps are “amended”, the addendum takes precedence.
