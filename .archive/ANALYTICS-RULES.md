# Analytics Rules

Purpose: establish consistent rules for building analytics charts/graphs using a hybrid approach — small, server‑aggregated payloads + lightweight client rendering. Use these guidelines for any new analytics widgets.

## Core Principles
- Prefer server‑side aggregation for analytics. The backend computes totals/series; the frontend renders and handles interactions.
- Use the hybrid approach for interactive drilldowns: initial aggregates come from the server; on click/tap, request just‑in‑time drilldown data.
- Keep payloads compact and typed. Avoid shipping per‑project matrices unless a grid explicitly needs them.
- Enforce consistent semantics on the server: week boundaries, inclusion of the current week, scoping rules, and status normalization.

## Data Semantics (standardize)
- Weeks: use Sunday‑of‑week ISO dates as canonical week keys (YYYY‑MM‑DD) and always include the current week.
- Department scoping: support `department` and `include_children` (0|1). Honor the global department filter on pages; allow overrides in cards.
- Status mapping: treat statuses case‑insensitively; at minimum support `active`, `active_ca`, and treat others as `other` for rollups.
- Rounding: server returns numbers rounded to 2 decimals; the UI may format to whole hours where helpful.

## API Contract Patterns
Implement (or reuse) compact endpoints that return exactly what each chart needs:
- By client totals
  - `GET /assignments/analytics_by_client?weeks&department&include_children`
  - Response: `{ clients: [{ label: string, hours: number }] }`
- Client drilldown (projects)
  - `GET /assignments/analytics_client_projects?client=...&weeks&department&include_children`
  - Response: `{ projects: [{ id: number, name: string, hours: number }] }`
- Status timeline (stacked series)
  - `GET /assignments/analytics_status_timeline?weeks&department&include_children`
  - Response: `{ weekKeys: string[], series: { active: number[], active_ca: number[], other: number[] }, totalByWeek: number[] }`

Caching:
- Cache responses per parameter set for a short TTL (e.g., 60s). Use a global `analytics_cache_version` if/when we need to invalidate broadly.

## Frontend Pattern (Hook + Card)
- Hook: `use<WidgetName>Data(params) -> { loading, error, series/slices, total, weekKeys? }`
  - Hooks call the typed analytics API functions and do minimal shaping.
- Card: `<WidgetName>Card` renders SVG (no chart libraries) and offers basic controls.
  - Props: `initialWeeks?: 4|8|12|16`, `className?: string`, `size?` (if relevant), `useGlobalDepartmentFilter?: boolean`, `departmentIdOverride?: number|null`, `includeChildrenOverride?: boolean`.
- Department filter: default to `useDepartmentFilter` (global); honor overrides when provided.

## UX & Accessibility
- Always include accessible labels: SVG `<title>` + `<desc>` summarizing data.
- States: show loading, empty (“No assigned hours”), and error messages clearly.
- Legends: inline, compact, with consistent colors.
- Interactions: click slices/legend rows for drilldown; use the hybrid approach to fetch drilldown data on demand.

## Color & Theme Consistency
- Status colors (VS Code dark theme aligned):
  - Active = emerald (#34d399)
  - Active CA = blue (#60a5fa)
  - Other = slate (#64748b)
- Keep colors stable across related views. When listing many series (e.g., clients/projects), map labels to a fixed palette order or hash.

## Performance Rules
- Default to server‑side aggregation for analytics.
- Use the snapshot endpoints only for grid/advanced tooling that requires per‑project detail.
- Avoid expensive client computations on large payloads; the client should compose/present, not compute.
- Keep payloads small: totals/series only, not raw matrices.

## Implementation Checklist (for a new widget)
1) Define the server response shape (totals or series + weekKeys) and add an analytics endpoint.
2) Add a typed frontend service method in `frontend/src/services/analyticsApi.ts`.
3) Implement `use<WidgetName>Data` hook to call the service and expose `loading/error/data`.
4) Implement `<WidgetName>Card` as an SVG visualization (no external chart libs). Include a 4/8/12/16 weeks selector.
5) Wire into pages (Dashboard/Reports) with responsive layout. Respect the global department filter.
6) Validate with `npm run build`. Check empty/error/loading states and accessibility.

## When To Use Hybrid vs. Server‑Only
- Hybrid (server aggregates + on‑click drilldown):
  - By client pie with per‑client project drilldown
  - Status timeline with click to reveal weekly details
- Server‑only (thin client render):
  - Static summaries, KPIs, single pies, bar charts with no drilldown
  - Heavy aggregates shared across multiple views

## Do / Don’t
- Do centralize semantics (weeks, status mapping) on the server.
- Do keep hooks thin and typed; reuse API helpers.
- Do include accessibility labels and clear empty/error messages.
- Don’t re‑implement aggregation logic in multiple hooks.
- Don’t ship per‑project matrices to draw small charts.
- Don’t introduce chart libraries unless explicitly approved.

## Existing References
- Backend endpoints added under `backend/assignments/views.py` (actions: `analytics_by_client`, `analytics_client_projects`, `analytics_status_timeline`).
- Frontend services: `frontend/src/services/analyticsApi.ts`
- Example widgets:
  - Client breakdown + drilldown: `AssignedHoursByClientCard`
  - Status timeline: `AssignedHoursTimelineCard`
  - Status pie: `AssignedHoursBreakdownCard` (migrate to server totals when practical)

## Future Extensions
- Add `topN + Other` bucketing server‑side for long tails.
- Add percent‑stacked timeline mode (client can derive from server series).
- Add ETag/Last‑Modified and longer caches where appropriate.

Follow this document whenever you add or revise analytics components. Default to server‑side aggregation, and use hybrid patterns when interaction benefits the user experience.

