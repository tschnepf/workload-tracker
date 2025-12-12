## Reports – Team Forecast – `frontend/src/pages/Reports/TeamForecast.tsx`

### Overview

- The **Team Forecast & Project Timeline** report provides:
  - A **Capacity Timeline** chart showing how team capacity vs allocated hours evolve over future weeks, aggregated by department and time scale.
  - A **Project Timeline** mini-chart that shows weekly hours for a **single selected project**, with a count of its deliverables.
- The page is intended as a strategic forecasting view rather than a day-to-day schedule; all data is pulled at **weekly granularity** and then aggregated into months/quarters/years in the chart layer.

### Data Flow and Backend Calls

#### 1. Capacity forecast – `peopleApi.workloadForecast`

- Triggered via `useAuthenticatedEffect` whenever:
  - `weeks` changes (8/12/16).
  - `deptState.selectedDepartmentId` or `deptState.includeChildren` change from `useDepartmentFilter`.
- Request shape:
  - `peopleApi.workloadForecast({`
    - `weeks` – number of future weeks to fetch (8, 12, or 16).
    - `department` – numeric department id if one is selected, otherwise omitted.
    - `include_children` – `1` if “Include children” is set and a department is chosen, otherwise `0` or omitted.
  - `})`
- Response:
  - `WorkloadForecastItem[]` where each element contains:
    - `weekStart` – Monday (or canonical) week start date as `yyyy-mm-dd`.
    - `totalCapacity` – total available hours for the filtered group.
    - `totalAllocated` – total assigned hours.
    - Other fields available on `WorkloadForecastItem` but not currently used by the chart.
- State:
  - `forecast` holds the full weekly array.
  - `loading` / `error` flags are set around the request and cleared in `finally`.
  - Because the effect uses an `active` flag in its cleanup, stale responses after dependency changes are safely ignored.

#### 2. Supporting metadata – projects and departments

- Projects list:
  - `projectsApi.list({ page: 1, page_size: 200 })` loaded once on mount.
  - Results stored in `projects` and used to populate the **Project Timeline** project `<select>`.
  - There is no pagination or infinite scroll here; only the first 200 projects are included.
- Departments list:
  - `departmentsApi.list({ page: 1, page_size: 500 })` loaded once on mount.
  - Used to populate the department dropdown that drives `useDepartmentFilter` for the forecast.

#### 3. Project-specific data – `assignmentsApi` and `deliverablesApi`

- Triggered via `useAuthenticatedEffect` whenever:
  - `selectedProject` changes.
  - The department filter (`deptState.selectedDepartmentId`, `deptState.includeChildren`) changes.
- If `selectedProject` is empty:
  - `projAssignments` and `projDeliverables` are cleared and no calls are made.
- Otherwise:
  - `projLoading` is set `true`, and a `Promise.all` runs:
    1. `assignmentsApi.list({`
       - `project: Number(selectedProject)`.
       - `department: dept` (if a department is selected).
       - `include_children: inc` (if a department filter is present and child inclusion is enabled).
       - `})` → `results` of `Assignment[]`.
    2. `deliverablesApi.list(Number(selectedProject), { page: 1, page_size: 1000 })` → `Deliverable[]`.
  - Results:
    - `projAssignments` holds all assignments for that project and department filter.
    - `projDeliverables` holds up to 1000 deliverables for the project.
  - As with the forecast, an `active` flag prevents stale responses from overwriting state on rapid changes.

### Chart Components and Layout

#### 1. Capacity Timeline – `CapacityTimeline`

- Props:
  - `weeklyData: WorkloadForecastItem[]` – the raw weekly forecast from `peopleApi.workloadForecast`.
  - `scale: 'week' | 'month' | 'quarter' | 'year'` – set via the scale toggle buttons in the UI.
  - Optional `seriesVisibility` flags (not used on Team Forecast today).
- Aggregation:
  - `aggregate(weeklyData, scale)` converts weekly API data into chart points:
    - For `scale === 'week'`:
      - One point per week: label is `weekStart.slice(5)` (e.g., `11-23`).
      - `totalCapacity`, `totalAllocated` directly from the API data.
      - `available` computed as `max(0, totalCapacity - totalAllocated)`.
    - For `month`, `quarter`, `year`:
      - Weeks are bucketed by:
        - `monthKey`, `quarterKey`, or `yearKey` using UTC dates.
      - Each bucket sums `totalCapacity` and `totalAllocated`.
      - `available` recomputed from the sums, `utilized` mirrors total allocated.
- Rendering:
  - Pure SVG; no external chart library.
  - Horizontal axis:
    - Fixed step width of 44px between points.
    - `width` at least 720px, with overflow handled via a horizontally scrollable container.
  - Vertical axis:
    - `maxY` is 10% above the maximum of capacity/allocated/available/utilized.
    - 5 evenly spaced horizontal gridlines (`ticks + 1`) with numeric labels.
  - Visual elements:
    - Filled **utilization area** behind lines (orange).
    - Lines:
      - Capacity (blue), Allocated (green), Available (purple).
    - Dots at each data point for hover/tap targets.
  - Tooltip:
    - Tracking div absolutely positioned relative to the container (`wrapperRef`) and updated on mouse move.
    - Shows capacity, allocated, available, and utilization percentage for the hovered point.
  - Legend:
    - Compact horizontal legend with colored markers and labels.
- Responsiveness:
  - The chart is horizontally scrollable; it does not dynamically reduce complexity on small screens.
  - Minimal font sizes (10–12px) help keep labels legible on mobile, but the chart remains fairly dense.
  - Known issues (referenced in `prompts/KNOWN-ISSUES.md`):
    - Historical concerns about conditional hook usage were documented; the current version uses `useRef`/`useState` unconditionally, but this is an area to re-verify if the component is further refactored.

#### 2. Project Timeline mini-chart – inline `ProjectTimeline` component

- Defined at the bottom of `TeamForecast.tsx` and used only on this page.
- Inputs:
  - `weeks: number` – currently used only for the help copy, not in calculations.
  - `weekStarts: string[]` – week start dates from the **main forecast** (`forecast.map(f => f.weekStart)`).
  - `weeklyTotals: number[]` – derived via `projWeeklyTotals`:
    - For each forecast week:
      - Looks at a `weeklyHours` object on each `Assignment` (`(a as any).weeklyHours`).
      - For each week, checks a 7‑day window around the Monday of that week (`mon ± 3 days`) and finds the first date key present in `weeklyHours`, summing the hours.
    - Returns an array parallel to `weekStarts` with per‑week total hours for the selected project.
  - `deliverables: Deliverable[]` – used only to display a total count.
- Rendering:
  - Simple grid of vertical bars built with HTML + inline styles:
    - Outer wrapper: `overflowX: 'auto'`.
    - Inner layout:
      - CSS grid with `gridTemplateColumns: repeat(weekStarts.length, 56px)` and `gap: '8px'`.
      - Each column:
        - Tall rounded background bar (fixed height 124px).
        - Inner colored bar with height proportional to hours vs `max` (max weekly total + 10%).
        - Label under the bar (weekStart slice from index 5, e.g., `11-23`) in 10px muted text.
  - At the bottom, a text line: `Deliverables: N`.
- Responsiveness:
  - Horizontally scrollable; all weeks remain present on small screens.
  - No explicit tooltips or legends; information density is intentionally minimal.

### Page Layout and Responsive Considerations

- Header:
  - Title: “Team Forecast & Project Timeline”.
  - Subtitle: description of the two main sections.
  - Weeks selector: three small buttons (8/12/16) aligned to the right.
  - On narrow screens this header wraps naturally into multiple lines; there is no custom sticky behavior yet.

- Capacity Timeline card:
  - Card with padding and a header row containing:
    - Title “Capacity Timeline”.
    - Scale toggles (Week / Month / Quarter / Year).
    - Department dropdown tied to `useDepartmentFilter`.
  - Body:
    - Loading and error messages as simple text.
    - Otherwise, `CapacityTimeline` SVG chart as described above.

- Project Timeline card:
  - Card with padding and a header row containing:
    - Title “Project Timeline”.
    - Project `<select>` (min width 220px) populated from `projects`.
  - Body:
    - Instructional text when no project is selected.
    - Loading text while `projLoading` is true.
    - Otherwise, the `ProjectTimeline` bar chart + deliverables count.

### Backend Efficiency and Future Mobile Fallbacks

- Current backend behavior is reasonably efficient:
  - **Capacity forecast**:
    - Single `peopleApi.workloadForecast` call per combination of `weeks + department + include_children`.
    - All aggregations (week/month/quarter/year) are done on the client without additional backend calls.
  - **Project data**:
    - One `assignmentsApi.list` + one `deliverablesApi.list` per selected project (and department filter).
    - These calls are only made when a project is chosen and reuse the same weekly horizon as the forecast (`weekStarts`).
  - **Metadata**:
    - Departments and projects are fetched once at mount.

- For later responsive work (Phase 2/3), key constraints to maintain:
  - Do **not** introduce per-viewport or per-chart duplicate calls to:
    - `peopleApi.workloadForecast`
    - `assignmentsApi.list`
    - `deliverablesApi.list`
  - Any mobile fallback (sparklines, stacked bars, or simplified mini‑charts) should:
    - Consume the same aggregated datasets produced here (`aggregate` output for capacity, `projWeeklyTotals` for project).
    - Use horizontal scrolling and/or progressive disclosure (collapsible sections) instead of triggering new fetches.
  - The **scale toggle** and **department filter** must continue to drive a single source of truth for forecast data, with UI variants simply reusing that shape rather than reslicing data independently.

This audit captures how the Team Forecast page, `CapacityTimeline`, and `ProjectTimeline` currently interact with backend services and render charts, providing a foundation for implementing mobile-friendly visual fallbacks without compromising API efficiency or data contracts.

