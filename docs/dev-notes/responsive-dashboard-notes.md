Responsive Dashboard Notes (baseline scan)

Layout containers
- Dashboard top section: currently uses `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6` with small cards using `lg:col-span-1` and the RoleCapacity card occupying `lg:col-span-6` (full row on large screens).
- Dashboard lower section: currently uses `grid grid-cols-1 lg:grid-cols-3 gap-6` with the heatmap as a larger card (`lg:col-span-2 lg:row-span-2`).

Fixed widths observed
- AssignedHoursBreakdownCard: `w-[280px] max-w-[320px]` on the Card wrapper (prevents natural wrapping).

Charts
- MultiRoleCapacityChart: computes an intrinsic width (>= 720px) and draws SVG accordingly. Currently wrapped in a flex row inside RoleCapacityCard without explicit horizontal scroll; can overflow on narrow viewports.
- AssignedHoursTimelineCard: already wraps the chart in `overflow-x-auto` and sets SVG width/height explicitly.
- Pie charts (AssignedHoursBreakdownCard, AssignedHoursByClientCard): accept `size` prop; not container-width aware by default.

Tables
- Availability and Team Members: use table markup; ensure `overflow-x-auto` and truncation are applied at narrow widths.

Types/Tooling
- React 19, TS 5.9, `jsx` set to `react-jsx`. Prefer `React.ReactElement`/`React.ReactNode` over global `JSX.*` types.

Focus for Phase 1
- Convert grid to 12 columns with responsive spans.
- Remove fixed widths blocking wrapping.
- Add horizontal scroll wrapper for RoleCapacityCard chart area.

