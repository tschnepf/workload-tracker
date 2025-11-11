# Responsive Dashboard Cards – Implementation Plan

Goal: Make dashboard cards dynamically reorganize as the browser width changes. Cards should wrap to new rows instead of getting too narrow, and inner content (charts, tables, legends) must adapt to prevent overlap or clipping.

Principles
- Follow lean programming best practices: minimal, cohesive changes; remove duplication; keep it simple and testable.
- No shortcuts, band‑aids, or quick fixes. Prefer systemic, reusable solutions (e.g., a single grid pattern and a shared width hook).
- Keep backend and frontend aligned. If any type or field is relied upon, verify against OpenAPI and regenerate types.
- Changes must be incremental and reversible; do not introduce unrelated refactors.

## Phase 0 — Context & Guardrails

- Prompt 0.1 — Repo scan and baselines
  - “Scan the dashboard layout and all used card components (AssignedHoursBreakdownCard, AssignedHoursByClientCard, AssignedHoursTimelineCard, RoleCapacityCard, Availability table, Team Members table). Identify grid containers and Tailwind classes controlling layout. Record current breakpoints, spans, and any hard‑coded sizes. Do not edit code yet; produce a short summary in comments in a new scratch doc ‘docs/dev-notes/responsive-dashboard-notes.md’.”

- Prompt 0.2 — Constraints and style guardrails
  - “Confirm Tailwind and React versions, tsconfig jsx mode, and existing CSS variables. Note any constraints that affect responsive behavior (e.g., min container widths, fixed chart sizes). Validate that changes will stay consistent with the existing design tokens.”

## Phase 1 — Grid System Upgrade (Structure)

- Prompt 1.1 — Choose and implement grid approach
  - “Implement a responsive grid for the dashboard using a 12‑column layout with dense packing. Apply `grid grid-cols-12 gap-6 grid-flow-dense` to the relevant wrappers. Ensure each card gets responsive spans (e.g., `col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3`) so cards wrap before content becomes cramped. Avoid altering card logic. Keep RoleCapacityCard as `col-span-12` at lg+ unless otherwise specified.”

- Prompt 1.2 — Establish consistent card minimums
  - “Add consistent minimum widths to card containers (e.g., `min-w-[18rem]`) and ensure the grid allows wrapping rather than squeezing. Do not hard‑code pixel widths inside components. Prefer Tailwind utilities; no global CSS overrides unless necessary.”

- Prompt 1.3 — Top vs. lower sections
  - “Split very wide components (e.g., RoleCapacityCard) into their own grid row below smaller cards when viewport width is insufficient. Keep layout rules declarative via responsive `col-span-*` classes; avoid JS layout logic.”

## Phase 2 — Width‑Aware Components (Behavior)

- Prompt 2.1 — Add a reusable `useContainerWidth` hook
  - “Create a hook `useContainerWidth(ref)` using ResizeObserver. It should return width, height, and a stable throttle to avoid layout thrash. Include cleanup and SSR guards. Place in `frontend/src/hooks/useContainerWidth.ts` and add unit tests.”

- Prompt 2.2 — Pie cards: adaptive sizing
  - “Refactor AssignedHoursBreakdownCard and AssignedHoursByClientCard to consume `useContainerWidth`. Compute chart diameter from container width (e.g., clamp between 96–180px). Suppress legends or long labels below a width threshold. Keep props compatible; no breaking changes. Ensure empty states render at all widths.”

- Prompt 2.3 — Timeline chart: density control
  - “In AssignedHoursTimelineCard, adapt tick density, label rotation, and margins based on container width. Use the width hook to pick from a small set of sane presets (e.g., compact/normal/roomy). Do not add ad‑hoc magic numbers scattered across the component.”

- Prompt 2.4 — RoleCapacityCard responsiveness
  - “Make RoleCapacityCard compute height from container width (e.g., 0.45–0.6 ratio with clamp). Hide or wrap legend under narrow widths. Expose a non‑breaking `responsive` boolean prop defaulting to true and honor existing `hideControls` flags.”

## Phase 3 — Tables & Text (Safety Nets)

- Prompt 3.1 — Table overflow and layout
  - “Ensure all tables used in dashboard cards (Availability, Team Members) have `overflow-x-auto`, `table-layout: fixed`, column width utilities, and text truncation with title tooltips for overflow. Confirm no clipping at 360–640px.”

- Prompt 3.2 — Typography and wrapping
  - “Audit headings and labels to use `whitespace-nowrap` only where required. Apply `break-words`/`truncate` strategically to prevent overlap. Avoid inline styles; use Tailwind utilities consistently.”

## Phase 4 — Accessibility & Semantics

- Prompt 4.1 — Chart a11y
  - “Verify charts include <title> and <desc> (already present). Ensure dynamic legends and toggles have accessible names. Do not regress keyboard or screen reader flows.”

- Prompt 4.2 — Landmark roles
  - “Where appropriate, mark major card groups with landmarks or aria‑labels for better navigation. Keep semantics minimal and relevant.”

## Phase 5 — Backend/Frontend Coordination

- Prompt 5.1 — API and types verification
  - “There are no API shape changes expected. Regenerate OpenAPI types (`npm run openapi:types`) and compile (`tsc --noEmit`) to verify that fields referenced by the cards (client names, role names, week keys) still align with backend. If mismatches appear, fix the usage rather than patching type definitions.”

- Prompt 5.2 — Error handling parity
  - “Ensure all cards render a graceful empty state and error state that does not break the grid. Do not swallow errors; keep current toast/inline patterns consistent.”

## Phase 6 — Testing & Verification

- Prompt 6.1 — Type and unit tests
  - “Run `npm ci && npm run build` locally and in CI. Add unit tests for `useContainerWidth` and any new sizing utilities with Vitest. Keep tests fast and focused.”

- Prompt 6.2 — Responsive e2e (Playwright)
  - “Add a Playwright test `frontend/tests/e2e/dashboard_responsive.spec.ts` that visits the dashboard and asserts: (a) no overlapping elements at widths [360, 640, 768, 1024, 1280, 1536], (b) card rows reflow by counting computed grid columns, (c) charts/tables are visible and not clipped (use bounding box checks and screenshot diffs if needed). Keep assertions resilient to data variance.”

- Prompt 6.3 — Visual sanity checks
  - “Optionally generate screenshots per breakpoint for manual review. Do not gate CI on pixel‑perfect diffs; rely on structural assertions primarily.”

## Phase 7 — Delivery & Rollback

- Prompt 7.1 — Commit, PR, and release notes
  - “Commit changes with clear, scoped messages. Open a PR summarizing the grid conversion and component responsiveness. Include a short ‘How to verify’ section with commands and breakpoints. Do not bundle unrelated refactors.”

- Prompt 7.2 — Safe rollout
  - “Build and deploy to a staging/prod environment. Monitor for layout regressions. If issues arise, revert the last commit group cleanly; the structural (grid) and behavioral (component) changes are separated to facilitate rollback.”

---

Checklist Prompts (Quick Re‑feed)
- “Convert dashboard wrappers to `grid grid-cols-12 gap-6 grid-flow-dense`; apply responsive `col-span-*` on each card so they wrap before content cramping.”
- “Add `useContainerWidth` hook (ResizeObserver) with tests; wire pie and timeline cards to compute sizes from container width with clamped presets.”
- “Ensure tables use `overflow-x-auto`, `table-layout: fixed`, and truncation; verify no clipping at 360–640px.”
- “Regenerate OpenAPI types and run `tsc --noEmit`; fix any type drift instead of patching types.”
- “Add Playwright responsive test covering 6 breakpoints; assert reflow and absence of overlap/clipping.”

Notes
- Prefer Tailwind utilities over ad‑hoc inline styles.
- Keep props backward‑compatible; introduce optional flags rather than breaking changes.
- Avoid adding new dependencies unless strictly necessary.
# Responsive Dashboard Cards - Implementation Plan

Goal: Make dashboard cards dynamically reorganize as the browser width changes. Cards should wrap to new rows instead of getting too narrow, and inner content (charts, tables, legends) must adapt to prevent overlap or clipping.

Principles
- Follow lean programming best practices: minimal, cohesive changes; remove duplication; keep it simple and testable.
- No shortcuts, band-aids, or quick fixes. Prefer systemic, reusable solutions (for example, a single grid pattern and a shared width hook).
- Keep backend and frontend aligned. If any type or field is relied upon, verify against OpenAPI and regenerate types.
- Changes must be incremental and reversible; do not introduce unrelated refactors.

Editing Rules (for the AI agent)
- Use apply_patch for all file changes. Preserve formatting and existing line endings.
- Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal "\r\n" sequences; let the patch handle newlines.
- Avoid bulk regex replacements; submit minimal, contextual patches.
- After each phase of edits, run the frontend type check/build to validate: run `npm run build` inside `frontend/`.
- When appropriate, refactor large or repetitive code into separate helper files, modules, services, or hooks (TypeScript best practices), preserving behavior.
- Only use best-practice programming; do not use shortcuts.

## Phase 0 - Context & Guardrails

- Prompt 0.1 - Repo scan and baselines
  - "Scan the dashboard layout and all used card components (AssignedHoursBreakdownCard, AssignedHoursByClientCard, AssignedHoursTimelineCard, RoleCapacityCard, Availability table, Team Members table). Identify grid containers and Tailwind classes controlling layout. Record current breakpoints, spans, and any hard-coded sizes. Do not edit code yet; produce a short summary in comments in a new scratch doc 'docs/dev-notes/responsive-dashboard-notes.md'."

- Prompt 0.2 - Constraints and style guardrails
  - "Confirm Tailwind and React versions, tsconfig jsx mode, and existing CSS variables. Note any constraints that affect responsive behavior (for example, min container widths, fixed chart sizes). Validate that changes will stay consistent with the existing design tokens."

## Phase 1 - Grid System Upgrade (Structure)

- Prompt 1.1 - Choose and implement grid approach
  - "Implement a responsive grid for the dashboard using a 12-column layout with optional dense packing. Apply `grid grid-cols-12 gap-6` to the relevant wrappers. If using `grid-flow-dense`, ensure reading order remains logical (see a11y step). Give each card responsive spans (for example, `col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3`) so cards wrap before content becomes cramped. Avoid altering card logic. Keep RoleCapacityCard as `col-span-12` at lg+ unless otherwise specified."

- Prompt 1.1a - Remove fixed widths that block wrapping
  - "Search for fixed width utilities on dashboard cards (for example, `w-[280px]`, `max-w-[320px]`) and replace with `w-full` plus reasonable `min-w-*` only when necessary. Start with `frontend/src/components/analytics/AssignedHoursBreakdownCard.tsx:90`. Ensure cards can shrink to their min width and then wrap."

- Prompt 1.2 - Establish consistent card minimums
  - "Add consistent minimum widths to card containers (for example, `min-w-[18rem]`) and ensure the grid allows wrapping rather than squeezing. Do not hard-code pixel widths inside components. Prefer Tailwind utilities; no global CSS overrides unless necessary."

- Prompt 1.3 - Top vs. lower sections
  - "Split very wide components (for example, RoleCapacityCard) into their own grid row below smaller cards when viewport width is insufficient. Keep layout rules declarative via responsive `col-span-*` classes; avoid JS layout logic."

- Prompt 1.4 - Wide content scroll wrappers
  - "For intentionally wide visualizations (for example, timeline charts), wrap the inner chart container in `overflow-x-auto` and set an intrinsic min width on the chart SVG/canvas. This prevents clipping at narrow viewports without shrinking content below readability."

## Phase 2 - Width-Aware Components (Behavior)

- Prompt 2.1 - Add a reusable `useContainerWidth` hook
  - "Create a hook `useContainerWidth(ref)` using ResizeObserver. Requirements:
    - Observe border-box entries.
    - Throttle via rAF plus about 100ms to avoid layout thrash.
    - Include SSR guard (undefined width on server) and cleanup on unmount.
    - Place in `frontend/src/hooks/useContainerWidth.ts` and add unit tests."

- Prompt 2.2 - Pie cards: adaptive sizing
  - "Refactor AssignedHoursBreakdownCard and AssignedHoursByClientCard to consume `useContainerWidth`. Compute chart diameter from container width (clamp, for example, 96–180px). Suppress legends or long labels below a width threshold. Keep props compatible (no breaking changes). Ensure empty states render at all widths."

- Prompt 2.3 - Timeline chart: density control
  - "In AssignedHoursTimelineCard, adapt tick density, label rotation, and margins based on width using 3 presets (compact/normal/roomy). Prefer presets over per-pixel heuristics. Maintain an intrinsic min width for week steps and rely on horizontal scroll when necessary; do not shrink steps to unreadable sizes."

- Prompt 2.4 - RoleCapacityCard responsiveness
  - "Make RoleCapacityCard compute height from container width (for example, 0.45–0.6 ratio with clamp). Hide or wrap legend at narrow widths. Expose a non-breaking `responsive?: boolean` prop defaulting to false; when true, derive sizes from container width. Honor existing `hideControls` flags."

- Prompt 2.5 - Hydration safety
  - "Guard against hydration mismatches by avoiding drastically different initial SSR/first render trees. Render with safe defaults until first measurement, then enhance."

## Phase 3 - Tables & Text (Safety Nets)

- Prompt 3.1 - Table overflow and layout
  - "Ensure all tables used in dashboard cards (Availability, Team Members) have `overflow-x-auto`, `table-layout: fixed`, column width utilities, and text truncation with title tooltips for overflow. Confirm no clipping at 360–640px."

- Prompt 3.2 - Typography and wrapping
  - "Audit headings and labels to use `whitespace-nowrap` only where required. Apply `break-words`/`truncate` strategically to prevent overlap. Avoid inline styles; use Tailwind utilities consistently."

- Prompt 3.3 - Long label safety
  - "Add `max-w-*` and `truncate` to long client/role labels in legends and tables to prevent push-out."

## Phase 4 - Accessibility & Semantics

- Prompt 4.1 - Chart a11y
  - "Verify charts include <title> and <desc>. Ensure dynamic legends and toggles have accessible names. Do not regress keyboard or screen reader flows."

- Prompt 4.2 - Landmark roles
  - "Where appropriate, mark major card groups with landmarks or aria-labels for better navigation. Keep semantics minimal and relevant."

- Prompt 4.3 - Visual order vs reading order
  - "If `grid-flow-dense` is used, confirm that the DOM order still matches expected reading and tab order for critical content. If not, remove `grid-flow-dense` or add explicit `order-*` utilities to preserve logical navigation."

## Phase 5 - Backend/Frontend Coordination

- Prompt 5.1 - API and types verification
  - "There are no API shape changes expected. Regenerate OpenAPI types (`npm run openapi:types`) and compile (`tsc --noEmit`) to verify that fields referenced by the cards (client names, role names, week keys) still align with backend. If mismatches appear, fix the usage rather than patching type definitions."

- Prompt 5.2 - Error handling parity
  - "Ensure all cards render a graceful empty state and error state that does not break the grid. Do not swallow errors; keep current toast/inline patterns consistent."

- Prompt 5.3 - Stable fixtures for e2e
  - "For responsive e2e tests, use MSW (or existing mocking) to stub analytics endpoints with deterministic fixtures so visual layout checks are stable across runs."

## Phase 6 - Testing & Verification

- Prompt 6.1 - Type and unit tests
  - "Run `npm ci && npm run build` locally and in CI. Add unit tests for `useContainerWidth` and any new sizing utilities with Vitest. Keep tests fast and focused."

- Prompt 6.2 - Responsive e2e (Playwright)
  - "Add a Playwright test `frontend/tests/e2e/dashboard_responsive.spec.ts` that visits the dashboard and asserts:
    (a) no overlapping elements at widths [360, 640, 768, 1024, 1280, 1536],
    (b) card rows reflow by counting computed grid columns,
    (c) charts/tables are visible and not clipped (use bounding box checks),
    (d) timeline area exposes horizontal scroll at narrow widths (assert scrollWidth > clientWidth).
    Use MSW fixtures to stabilize data."

- Prompt 6.3 - Visual sanity checks
  - "Optionally run a minimal Lighthouse pass and generate screenshots per breakpoint for manual review. Do not gate CI on pixel-perfect diffs; rely on structural assertions primarily."

## Phase 7 - Delivery & Rollback

- Prompt 7.1 - Commit, PR, and release notes
  - "Commit changes with clear, scoped messages. Open a PR summarizing the grid conversion and component responsiveness. Include a short 'How to verify' section with commands and breakpoints. Do not bundle unrelated refactors."

- Prompt 7.2 - Safe rollout
  - "Build and deploy to a staging/prod environment. Monitor for layout regressions. Split delivery into two PRs for safe rollback:
    - PR A: Grid conversion, removal of fixed widths, and scroll wrappers (no chart logic changes).
    - PR B: Width-aware hooks and responsive presets for charts/tables.
    If issues arise, revert only the problematic PR."

Acceptance Gates
- No dashboard card container uses fixed width utilities that prevent wrapping.
- At widths 360/640/768/1024/1280/1536:
  - No clipped text in headings/legends/tables.
  - Timeline chart is readable or horizontally scrollable, never clipped.
  - Cards wrap to new rows without global horizontal page scroll.
- With `responsive=false` on cards, legacy behavior is intact.
- `npm run build` succeeds; type check passes; e2e with MSW fixtures pass.

---

Checklist Prompts (Quick Re-feed)
- "Convert dashboard wrappers to `grid grid-cols-12 gap-6` (optionally `grid-flow-dense` if a11y is preserved); apply responsive `col-span-*` on each card so they wrap before content cramping."
- "Remove fixed widths on dashboard cards; add min widths only where needed."
- "Add `useContainerWidth` hook (ResizeObserver) with tests; wire pie and timeline cards to compute sizes from container width with clamped presets."
- "Wrap wide charts with horizontal scroll; keep intrinsic min width rather than over-compressing steps."
- "Ensure tables use `overflow-x-auto`, `table-layout: fixed`, and truncation; verify no clipping at 360–640px."
- "Regenerate OpenAPI types and run `tsc --noEmit`; fix any type drift instead of patching types."
- "Add Playwright responsive test covering 6 breakpoints; assert reflow, absence of overlap/clipping, and timeline scroll at narrow widths."

