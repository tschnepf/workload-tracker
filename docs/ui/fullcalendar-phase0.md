# FullCalendar Migration – Phase 0 Assessment

## Prompt 0a – Screen & Endpoint Inventory
| Screen / Feature | Source File(s) | Current Data Sources | Interaction Requirements | Backend / Pagination Notes |
| --- | --- | --- | --- | --- |
| **My Work → Personal Calendar** | `frontend/src/components/personal/PersonalCalendarWidget.tsx` | `GET /deliverables/calendar_with_pre_items/` (primary), `deliverablesApi.calendar(start,end)`, `deliverableAssignmentsApi.byPerson(personId)`, `GET /assignments/by_person/`, `GET /deliverables/pre_deliverable_items/` | Week navigation, adjustable window (4–12 weeks), toggle for pre-deliverables, mine-only scope derived from authenticated person, grid refresh bus reacting to popover updates | Backend tolerates 12-week window (current UI limit). Pre-deliverables endpoint defaults to `page_size=100`; beyond that we risk truncation. |
| **My Work → Schedule Strip** | `frontend/src/components/personal/MyScheduleStrip.tsx` + `usePersonalWork` hook | `GET /personal/work/` (includes `schedule.weekKeys`, `weeklyCapacity`, `weekTotals`) | Purely visual (no navigation). Needs to stay in sync with `/personal/work/` caching and refresh/backoff strategy. | API already cached with retry/backoff in `usePersonalWork`; any new adapter must reuse this path to avoid double-fetching. |
| **Deliverables Calendar Page** | `frontend/src/pages/Deliverables/Calendar.tsx` | Same stack as Personal Calendar plus optional person filter data from `deliverableAssignmentsApi.byPerson` and `assignmentsApi.byPerson` | Multi-week grid with `weeksCount` selector (default 8, up to 12), show/hide pre-deliverables, person autocomplete filter, deliverable popovers using `CalendarGrid` utilities | When person filter is active we currently fetch assignment lists per selection; caching is manual. Need to keep load under rate limits (2 parallel requests). |
| **Team Dashboard Heatmap & Modals** | `frontend/src/pages/Dashboard.tsx`, `frontend/src/mobile/dashboardAdapters.ts`, `frontend/src/components/dashboard/TeamHeatmapCard.tsx`, `TeamMembersCard.tsx` | `peopleApi.capacityHeatmap({ weeks, department, include_children })`, optionally `dashboardApi` payload (for summary + analytics) | Scrollable heatmap list with per-person sparkline, modal drilldown streaming pagination via `useCapacityHeatmap` + `useDashboardHeatmapView` | Heatmap endpoint typically called with 12 weeks and department filters; pagination handled server-side via `weekKeys`. Need to respect existing TanStack Query caching keys. |
| **Assignments / Scheduling Widgets** | `frontend/src/components/dashboard/UpcomingPreDeliverablesWidget.tsx`, `frontend/src/components/dashboard/CapacityHeatmap.tsx`, `frontend/src/components/quick-actions/tools/CapacityReportTool.tsx` | `deliverablesApi.preDeliverables`, `peopleApi.capacityHeatmap`, `apiClient.GET('/deliverables/calendar_with_pre_items/')` (varies) | Provide glanceable schedule data; some already reuse heatmap payload | Any shared calendar data must not break these consumers; ideally they switch to adapters or the wrapper once FullCalendar lands. |
| **Admin Calendar Tools** | `frontend/src/pages/Deliverables/Calendar.tsx`, `frontend/src/components/settings/CalendarFeeds.tsx` | ICS feed settings + same calendar data sources | Need to keep ICS settings unaffected; new wrapper must not break feed generation. |

## Prompt 0b – Shared Wrapper Contract
We will ship a shared `FullCalendarWrapper` component plus `calendarEventAdapters.ts` module with the following guarantees:
- **Props**: `{ events: EventInput[]; initialView?: 'timeGridWeek' | 'dayGridMonth' | 'listWeek'; responsiveViews?: { mobile: string; desktop: string }; defaultDate?: string | Date; loading?: boolean; emptyState?: ReactNode; onEventClick?: (eventMeta) => void; toolbar?: { left?: string; center?: string; right?: string }; height?: 'auto' | number; eventContentRender?: (arg) => ReactNode; }`.
- **Data flow**: Screens never assemble FullCalendar events directly. Instead they import profile-specific adapters (e.g., `mapPersonalWorkEvents(payload)`), guaranteeing that `/personal/work/`, `/deliverables/calendar_with_pre_items/`, `/people/capacity_heatmap/` remain the single sources of truth.
- **Theme tokens**: Wrapper injects CSS variables derived from `theme/tokens.ts` so colors/fonts match both desktop and mobile. Each consumer can pass `className` overrides, but global overrides live in `fullcalendar.theme.css` to prevent leakage.
- **Plugin loading**: Wrapper lazy-loads `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, and `@fullcalendar/list`. Mobile widths (<768px) default to `listWeek`; ≥768px can toggle between `timeGridWeek` and `dayGridMonth`.
- **State management**: Wrapper exposes imperative handlers via `ref` (optional) for screens that need to sync toolbar buttons with backend filters (e.g., feature flag toggles, show/hide pre-deliverables). Internal state is stored in a dedicated hook so TanStack Query caching remains authoritative for data fetching.

## Prompt 0c – Licensing Constraints (Free-Only)
- We will exclusively install and import **free** packages: `@fullcalendar/core`, `@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, and `@fullcalendar/list`.
- Premium features (Timeline, Resource, Scheduler, Adaptive) are off-limits; the plan explicitly avoids `@fullcalendar/resource-timegrid`, etc.
- Licensing expectations: FullCalendar’s core + listed plugins are MIT. Document this inside `docs/ui/fullcalendar.md` and in the wrapper README so no contributor accidentally references premium docs or CSS hooks.

## Prompt 0d – Backend Window & Pagination Contract
- `/deliverables/calendar_with_pre_items/`: currently queried with start/end spanning up to **12 weeks** (84 days). Backend returns full arrays (no pagination), but we must keep requests ≤12 weeks to avoid timeouts. Pre-deliverables fallback uses `page_size=100`; exceeding this requires cursor pagination, so the wrapper must request additional pages when totals exceed 100.
- `/deliverables/pre_deliverable_items/`: only leveraged when unified endpoint fails. We still need adapter support so backlog users remain unblocked; include exponential backoff identical to `usePersonalWork`.
- `/personal/work/`: Single payload containing summary/projects/deliverables/schedule. No pagination, but we must respect the existing cache+retry logic; adapters should subscribe to `usePersonalWork()` instead of firing bespoke fetches.
- `/people/capacity_heatmap/`: Accepts `weeks`, `department`, `include_children`. Backend expects `weeks ≤ 16`; dashboards currently default to 12. Requests beyond 16 must be clamped client-side. Response already aggregates per week; adapter must normalize week keys to ISO dates (YYYY-MM-DD) for FullCalendar.
- `/deliverables/calendar_with_pre_items/` (Team Dashboard overlay): when used alongside heatmap, we only need milestone markers for drilldowns, so adapter should support partial fetches triggered by modals instead of reloading the entire calendar view.

## Prompt 0e – Feature Flags & Rollback
- Add boolean flags in `frontend/src/config/flags.ts`:
  - `FEATURE_FULLCALENDAR_MYWORK`
  - `FEATURE_FULLCALENDAR_DELIVERABLES`
  - `FEATURE_FULLCALENDAR_TEAM`
  - `FEATURE_FULLCALENDAR_ADMIN`
- Each screen checks its flag before rendering the wrapper; when false it falls back to existing components (`CalendarGrid`, `HeatmapSparkline`, etc.).
- Rollback steps: flip the corresponding flag to `false` (optionally via `.env.local` override in the future), deploy, and no schema migrations are required. Documentation must include manual steps plus a `trackPerformanceEvent('fullcalendar.rollback', …)` hook to log toggles.
- QA plan: expose temporary query-param overrides (e.g., `?fc_mywork=0/1`) for pre-production validation without redeploying flags.

Phase 0 outputs: this document (inventory + contracts) plus updates to the migration plan referencing free-only licensing. All later phases will reference this file for acceptance criteria.
