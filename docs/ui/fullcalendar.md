# FullCalendar Wrapper & Adapter Guide

This document describes how to use the shared FullCalendar building blocks that replace bespoke calendar grids across the product.

## Components & Modules

| Artifact | Location | Purpose |
| --- | --- | --- |
| `FullCalendarWrapper` | `frontend/src/features/fullcalendar/FullCalendarWrapper.tsx` | Dynamically loads the shared FullCalendar React runtime plus only the plugins needed for the current surface (`dayGrid`, `timeGrid`, `list`), wires responsive view logic (list on mobile, grid on desktop), and normalizes theme tokens + accessibility affordances. |
| `eventAdapters` | `frontend/src/features/fullcalendar/eventAdapters.ts` | Converts backend payloads into `EventInput[]` for Personal, Deliverables, and Team views while preserving metadata needed by popovers and analytics. |
| Theme CSS | `frontend/src/features/fullcalendar/fullcalendar-theme.css` | Imports FullCalendar base CSS and scopes overrides to match our dark theme, including focus rings, event pills, and background events for availability. |

## Wrapper API

```tsx
type ResponsiveViewConfig = { mobile?: CalendarOptions['initialView']; desktop?: CalendarOptions['initialView'] };

type FullCalendarWrapperProps = {
  events: EventInput[];
  initialDate?: string | Date;
  initialView?: CalendarOptions['initialView'];
  responsiveViews?: ResponsiveViewConfig; // defaults to listWeek mobile + timeGridWeek desktop
  toolbar?: HeaderToolbarInput; // defaults to prev/next/today + title + month/week/list
  height?: CalendarOptions['height']; // defaults to 'auto'
  loading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
  eventContent?: (arg: EventContentArg) => React.ReactNode;
  onEventClick?: (arg: EventClickArg) => void;
  testId?: string;
};
```

### Accessibility & Interaction Parity
- Focus management: Wrapper sets `eventClassNames` to include `fc-event-accessible` and retains FullCalendar’s keyboard shortcuts (`←/→`, `Enter`, `Space`) so desktop parity is preserved.
- Touch parity: Buttons collapse to prev/next only under 768 px and toolbar titles remain large enough to tap. `listWeek` view is enforced at mobile widths to avoid horizontal scrolling.
- Screen readers: The default list view already outputs ARIA-compliant table markup; background events used for schedule/heatmap data have descriptive titles (hours vs capacity).
- Popovers & quick-view: Consumers pass `onEventClick` and `eventContent` to re-create existing pill UI or open detail drawers. Extended props keep backend identifiers intact.

### Data & Backend Coordination
- Events should always come from adapters (`mapDeliverableCalendarToEvents`, `mapPersonalScheduleToEvents`, `mapCapacityHeatmapToEvents`). This keeps `/personal/work/`, `/deliverables/calendar_with_pre_items/`, and `/people/capacity_heatmap/` as the single sources of truth and preserves retry/backoff logic.
- Heatmap normalization clamps requested weeks to backend-supported windows and converts week buckets into ISO start dates so FullCalendar renders week-long blocks accurately.

### Deployment, Flags & Rollback
- Feature flags (`FEATURE_FULLCALENDAR_MYWORK`, `FEATURE_FULLCALENDAR_TEAM`, `FEATURE_FULLCALENDAR_DELIVERABLES`) must be flipped per environment. Default them to `false` in `.env` and override via `VITE_FEATURE_FULLCALENDAR_*` in Kubernetes/Docker secrets.
- Rollback = flip the corresponding flag and redeploy; legacy widgets are still bundled and no schema/data migrations are required.
- Hover highlight of deliverables while pre-items are hidden is still being refined (see `FUTURE_FEATURES.md`). If that behavior is critical leave the flag off until a follow-up patch lands.

### Backend Expectations & Pagination
- `/personal/work/` drives Personal Dashboard, Schedule Strip, and calendar; do not introduce secondary endpoints for the same data. Pagination is handled server-side (single payload).
- `/deliverables/calendar_with_pre_items/` honors `start`, `end`, `mine_only`, `type_id`; clients must clamp requests to ≤12 weeks and respect pagination when it appears (adapter already retries with the legacy endpoints).
- `/people/capacity_heatmap/` returns the maximum safe window (currently 20 weeks). Adapters clamp to 12 weeks for the timeline calendar to avoid oversized payloads—keep that invariant if new surfaces reuse the adapter.

### Bundle Budget & CI
- `npm run build` automatically runs `npm run check:fullcalendar-chunk`, which inspects `dist/assets/fullcalendar.*.js` and fails if any chunk exceeds 250 KB (≈70 KB gzip). The guard lives in `frontend/scripts/check-fullcalendar-chunk.mjs`.
- When adding new views/plugins adjust the limit in that script only after capturing a new baseline (run Lighthouse locally, paste results into the PR). Document any change to the limit in this file.
- Dynamic plugin imports mean route-level lazy loading happens automatically based on toolbar/view configuration. If you add a new custom view ensure `views[name].type` resolves to `dayGrid`, `timeGrid`, or `list` so the correct plugin loads.

### Rollout Checklist (per environment)
1. Confirm flags and `.env` defaults.
2. Deploy and monitor `npm run check:fullcalendar-chunk` output in CI.
3. Run `npm run build:analyze` + Lighthouse if bundle size approaches the guard.
4. If regressions occur revert via feature flags and file a follow-up referencing the guard output.

Keep this file updated whenever adapters or wrapper props evolve so downstream teams can follow the same patterns without re-implementing grid logic.
