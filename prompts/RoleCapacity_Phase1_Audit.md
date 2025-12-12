## Reports – Role Capacity – `frontend/src/pages/Reports/RoleCapacity.tsx`

### Overview

- The Role Capacity report page is a **thin wrapper** around the shared `RoleCapacityCard` component:
  - `RoleCapacity.tsx` simply renders:
    - `Layout` → `div` with padding → `<RoleCapacityCard />`.
  - All of the real behavior (data fetching, layout, responsiveness) lives in `frontend/src/components/analytics/RoleCapacityCard.tsx`.
- `RoleCapacityCard` is also used on the main Dashboard; this report page presents the same visualization in a dedicated full-width context, which is especially important for mobile.

### Data Flow and Backend Dependencies

- Inputs:
  - Optional props:
    - `departmentId?: number | null` – override for department, otherwise uses global department filter.
    - `title?: string` – defaults to “Capacity vs Assigned by Role”.
    - `defaultWeeks?: 4 | 8 | 12 | 16 | 20` – default 12.
    - `defaultMode?: 'hours' | 'percent'` – chart mode, default `'hours'`.
    - `initialSelectedRoleIds?: number[]` – initial role selection.
    - `tension?: number` – smoothing for the underlying chart.
    - `hideControls?: { timeframe?: boolean; roles?: boolean; display?: boolean; }` – used by Dashboard to hide some controls.
    - `responsive?: boolean` – when true, chart height is derived from container width.
  - On the Role Capacity report page, the card is rendered with **default props** (no overrides), giving the full control set.

- Department filter:
  - Uses `useDepartmentFilter()` to read global state:
    - `globalDept.selectedDepartmentId`.
  - `effectiveDeptId` is:
    - `departmentId` prop if provided, otherwise the global selection, otherwise `null` (meaning “all departments”).
  - Department names:
    - Fetched once via `departmentsApi.list({ page: 1, page_size: 500 })`.
    - Stored in `departments` state for display only (“Department: Name”).

- Roles data:
  - Loaded once on mount:
    - `rolesApi.listAll()` → `roles` array of `{ id, name }`.
  - Initial selection:
    - On first roles load, if `initialSelectedRoleIds` is provided and non-empty:
      - `selectedRoleIds` is set to those ids.
    - Otherwise, all role ids are selected by default.

- Role capacity timeline:
  - Central backend dependency is `getRoleCapacityTimeline` (`services/analyticsApi.ts`).
  - `refresh` function:
    - Builds `roleIdsCsv` from the `selectedRoleIds` Set, if any are selected.
    - Calls `getRoleCapacityTimeline({`
      - `department: effectiveDeptId` (if not null).
      - `weeks` – current timeframe (default 12, changeable via buttons).
      - `roleIdsCsv` – optional comma-separated list.
      - `})`.
    - Response is expected to have:
      - `weekKeys: string[]` – ordered week labels for the horizontal axis.
      - `series: Array<{ roleId: number; roleName: string; assigned: number[]; capacity: number[] }>` – one series per role.
    - On success:
      - `weekKeys` and `series` state are updated.
    - On error:
      - `error` string set and data arrays cleared.
  - Triggering:
    - `refresh` is memoized with dependencies `[effectiveDeptId, weeks, selectedRoleIds]`.
    - A `useEffect` runs `refresh()` whenever those dependencies change.
    - This means:
      - Changing timeframe or department causes a new backend call.
      - Changing role selection also triggers new backend calls so the server only returns relevant series.

### Internal Layout and Responsiveness

#### 1. Card header (controls row)

- Wrapped in `<div className="flex items-end gap-4 flex-wrap">` to allow wrapping on small screens.
- Columns:
  1. Department summary:
     - Label “Department”.
     - Value:
       - “All Departments” when `effectiveDeptId` is `null`.
       - Otherwise looks up the department name by `id`.
  2. Timeframe (weeks) – unless `hideControls.timeframe` is true:
     - Label “Timeframe (weeks)”.
     - A row of small buttons for 4, 8, 12, 16, 20 weeks.
     - Selected button uses primary background; others are outlined.
  3. Display mode – unless `hideControls.display` is true:
     - Label “Display”.
     - Buttons for:
       - “Raw hours” (`mode === 'hours'`).
       - “% of capacity” (`mode === 'percent'`).
  4. Refresh button:
     - Always shown.
     - Disabled when `loading` or when the `canQuery` flag (currently always true) is false.

- On narrow screens:
  - `flex-wrap` allows these four blocks to wrap as 2–4 rows, but they remain horizontally oriented within each row.
  - No sticky behavior; the header scrolls away with content.

#### 2. Chart + role legend layout

- Contains:
  - Title `<h2>` and optional error message.
  - Main layout container:
    - `className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-6 lg:items-start"`.
    - Mobile:
      - Stacks chart above roles legend vertically.
    - Desktop (`lg` and up):
      - Two-column layout:
        - Left: chart.
        - Right: legend / role selector (width ~240px).

- Chart region:
  - Renders `<MultiRoleCapacityChart>` when `error` is null:
    - Props:
      - `weekKeys`, `series={displayedSeries}`, `mode`, `tension`, `height`, `hideLegend`.
    - `displayedSeries` is `series` filtered to those roles currently selected in `selectedRoleIds`, giving immediate visual feedback without re-fetching from the backend for deselection.

- Legend and role selector:
  - Header row:
    - Label “Roles”.
    - “Select All” and “Clear” buttons (tiny text).
  - Role list:
    - Container:
      - `grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 max-h-64 overflow-y-auto pr-1`.
    - Each role is:
      - A button with:
        - Colored strip (derived from `roleColorForId(r.id)`).
        - Truncated role name.
      - Selected roles have a primary background; others are neutral.
    - This grid layout is key to the report’s responsiveness:
      - On small screens (`sm`), roles appear in two columns to reduce vertical scrolling.
      - On large screens, they revert to a single column to align with the chart.

#### 3. Dynamic height and responsive mode

- Height calculation:
  - `dynamicHeight`:
    - Baseline 300 pixels.
    - Increases with number of roles: `header + roles.length * perRole`.
  - `containerWidth`:
    - Uses a lazily imported hook `useContainerWidth(rootRef)` (via `require` to avoid circular imports) to find the width of the card for responsive mode.
  - `autoHeight`:
    - If `responsive` prop is `true` and `containerWidth` is available:
      - Height is set to a clamped fraction of `containerWidth`:
        - `Math.max(280, Math.min(560, floor(containerWidth * 0.5)))`.
    - Otherwise, falls back to `dynamicHeight`.
- On the Role Capacity report page:
  - `responsive` is currently `false` (default), so the chart uses `dynamicHeight` only and does not tie height to screen width.

### Mobile Behavior and Potential Issues

- When rendered on small screens (for this report or on Dashboard with responsive layout enabled):
  - The **flex header** wraps its controls but still relies on horizontal rows of buttons.
    - On very narrow widths, the timeframe and display buttons can feel cramped and may wrap mid-row.
  - The **chart** is always shown above the role legend.
    - Dynamic height ensures the legend does not overlap, but the chart can become quite tall if many roles exist, increasing vertical scroll.
  - The **role legend grid**:
    - Uses two columns on small screens (`sm:grid-cols-2`), which helps reduce height.
    - Buttons are small but tappable; the colored strips in each row remain visible even when names are truncated.
  - There is no horizontal scrolling inside the card; everything is designed to fit the available width.

- Risks for mobile:
  - Dense controls in the header row can crowd together on narrow screens.
  - With many roles, `dynamicHeight` may produce a very tall chart, potentially exceeding the viewport height on low-resolution devices.
  - Because `canQuery` is always `true`, every change in timeframe, department, or role selection triggers a full backend refresh; any future mobile-specific behavior (e.g., multi-select or filter sheets) must avoid firing extra queries unnecessarily.

### Constraints for Future Responsive Tweaks (Later Phases)

- The Role Capacity report is just a host for `RoleCapacityCard`; any mobile-specific changes should ideally:
  - Be done inside `RoleCapacityCard` so Dashboard and dedicated report stay in sync.
  - Preserve the contract with `getRoleCapacityTimeline`:
    - Same parameters (`department`, `weeks`, `roleIdsCsv`).
    - Same shape of `weekKeys` and `series`.
  - Keep the **role selection logic** as the single source of truth for which roles are included in the chart and in backend filters.
  - Continue to use the combined legend as a primary way to inspect which roles are visible; any mobile redesign should not hide role names or color mappings entirely.

This audit documents how the Role Capacity report and `RoleCapacityCard` work together, how they fetch and display role capacity timelines, and how the internal grid/legend structure behaves on narrow screens, providing a foundation for safe responsive tweaks in subsequent phases.

