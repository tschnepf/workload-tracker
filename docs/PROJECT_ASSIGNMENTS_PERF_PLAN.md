# Project Assignments Performance Plan

## Goals
- Match or exceed the perceived responsiveness of the Assignments grid.
- Reduce interaction latency for cell selection, multi-select drag, expand/collapse, and bulk updates.
- Keep the solution incremental with measurable checkpoints.

## Scope
- Page: Project Assignments (grid).
- Compare: Assignments grid as a performance baseline.

## Success Metrics
- Cell select (single): <16ms main-thread work, no dropped frames.
- Drag select (multi): steady 60fps during drag on medium data sets.
- Page open to usable: <2s (or <3s on large datasets).
- Expand project: <200ms to first paint of rows (data load excluded).
- Bulk update: no full-grid re-render; only affected rows/cells update.

## Phase 0 - Baseline and Instrumentation (1-2 days)
1. Capture baseline numbers on representative datasets.
   - Small, medium, large dataset profiles.
   - Record CPU/JS flamegraphs for: open, select, drag, expand, update.
2. Add lightweight instrumentation (feature-flagged).
   - Interaction timing logs for selection and render counts.
   - Track render counts for Project row, Assignment row, WeekCell.
3. Document current bottlenecks.

Deliverables:
- Baseline perf report (before/after tables).
- Identified hot paths with file/line references.

## Phase 1 - Quick Wins (2-4 days)
1. Reduce render scope with component boundaries.
   - Extract ProjectRow + AssignmentRow into memoized components.
   - Ensure stable props and callbacks via useCallback/useMemo.
2. Stabilize WeekCell props.
   - Avoid inline callbacks; use stable handler factories.
   - Prevent prop churn that defeats React.memo.
3. Precompute expensive tooltip strings.
   - Build deliverable tooltip map on snapshot load.

Deliverables:
- Reduced render counts for selection and drag.
- Noticeable improvement in perceived selection performance.

## Phase 2 - Data Loading Improvements (2-4 days)
1. Remove or defer projectsApi.listAll on initial load.
   - Option A: server supports include-empty-projects in snapshot.
   - Option B: load extras only when filters require it.
2. Batch snapshot state commits.
   - Consolidate state updates to reduce multi-render bursts.

Deliverables:
- Faster page open, reduced JS blocking on initial load.

## Phase 3 - Virtualization (4-7 days)
1. Virtualize rows (projects + assignments).
   - Evaluate react-window or react-virtual.
   - Ensure selection and keyboard navigation remain correct.
2. Virtualize weeks (desktop).
   - Reuse or adapt existing useWeekVirtualization logic.

Deliverables:
- Stable 60fps selection on large grids.
- Reduced memory and DOM size.

## Phase 4 - Expand/Update Optimization (2-4 days)
1. Cache role catalogs for department IDs on load.
2. Optimize expand path to update only the affected project.
   - Avoid setProjects full-map if possible (use state updater + memoized row).
3. Optimize bulk update UI.
   - Update only touched rows/cells; avoid full-grid state diffing.

Deliverables:
- Expand feels instantaneous post-data fetch.
- Bulk update keeps UI responsive.

## Phase 5 - Validation and Rollout (1-2 days)
1. Re-run baseline tests and compare metrics.
2. Add regression checks (automated if feasible).
3. Guard with feature flag if required.

Deliverables:
- Final perf report with before/after.
- Release notes and optional flag strategy.

## Risks
- Virtualization may complicate selection and keyboard navigation.
- Defer listAll could change edge cases for filters.
- Memoization may introduce stale props if not carefully managed.

## Dependencies
- Backend snapshot endpoint improvements (optional but recommended).
- Confirmation of dataset sizes for realistic performance testing.

## Notes
- Prioritize Phase 1 and Phase 2 for the fastest improvements.
- Plan should be revised after Phase 0 profiling results.
