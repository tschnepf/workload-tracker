## Department Reports – `frontend/src/pages/Departments/ReportsView.tsx`

### Overview

- The Department Reports page provides **analytics across all departments** using a mix of:
  - Company-wide summary cards (counts, utilization, capacity).
  - Assigned-hours analytics (`AssignedHoursBreakdownCard`, `AssignedHoursByClientCard`, `AssignedHoursTimelineCard`).
  - A detailed **Department Performance Overview** table.
  - Additional insight cards (“Department Utilization Distribution”, “Available Resources”) and links to more detailed reports.
- All data is derived from **batched backend calls** in `loadData`:
  - `departmentsApi.list()` → list of departments.
  - `peopleApi.list()` → list of people with weekly capacity.
  - `personSkillsApi.list()` → list of skills per person.
  - For each department, `dashboardApi.getDashboard(selectedTimeframe, dept.id.toString())` is called to retrieve the same summary metrics used on the main Dashboard.

### Data Flow and Backend Batching

- `useAuthenticatedEffect` with dependency `[selectedTimeframe]` triggers `loadData()` whenever the timeframe (in weeks) changes.
- `loadData()`:
  - Uses `Promise.all` to fetch departments, people, and skills **in parallel**:
    - `departmentsApi.list()`
    - `peopleApi.list()`
    - `personSkillsApi.list()`
  - Stores:
    - `allDepartments` → `departments` state.
    - `allPeople`.
    - `allSkills` → `peopleSkills` state.
  - For each department, it then:
    - Calls `dashboardApi.getDashboard(selectedTimeframe, dept.id.toString())`.
    - Wraps this in a try/catch so one failing department won’t break the whole page.
    - Builds a `DepartmentReport` object containing:
      - `metrics` (teamSize, avg/peak utilization, totalAssignments, overallocatedCount, availableHours, utilizationTrend).
      - `people` (deptPeople).
      - `dashboardData` (raw dashboard payload).
      - `skills` (aggregated skill stats).
- While `dashboardApi.getDashboard` is called once per department (not a single bulk call), the outer `Promise.all` ensures that the high-volume list endpoints are batched.

### Analytics Sections and Their Roles

1. **Company-wide Summary Cards**
   - Derived from all `DepartmentReport` entries:
     - Total Departments (`reports.length`).
     - Total People (sum of `metrics.teamSize`).
     - Average Utilization (mean of `metrics.avgUtilization`).
     - Total Available Capacity (sum of `metrics.availableHours`).
   - Purpose:
     - Provide a quick, cross-department snapshot for the selected timeframe.
   - Layout:
     - Rendered in a `grid grid-cols-1 md:grid-cols-4`.
     - Desktop: 4 cards in a row; mobile: stacked.

2. **Assigned Hours Breakdown Card – `AssignedHoursBreakdownCard`**
   - Usage:
     ```tsx
     <div className="flex flex-wrap gap-4">
       <AssignedHoursBreakdownCard />
       <AssignedHoursByClientCard />
     </div>
     ```
   - Purpose:
     - Visualizes how assigned hours are distributed (e.g., by status / type).
   - Current layout:
     - Sits, side-by-side with `AssignedHoursByClientCard` using `flex flex-wrap gap-4`.
     - On narrower screens, likely wraps to a second line, but the layout assumes enough width for both charts in the same band.
   - Data:
     - These components fetch their own data (reusing existing analytics APIs); they are not driven directly from the `DepartmentReport` objects, but conceptually show the same timeframe.

3. **Assigned Hours by Client Card – `AssignedHoursByClientCard`**
   - Purpose:
     - Shows distribution of assigned hours by client (e.g., pie or bar chart).
   - Layout:
     - Shares the same row as `AssignedHoursBreakdownCard`.
     - On mobile, both charts are still mounted, which can push them tall in the viewport.
   - Data:
     - Uses its own hooks/APIs (not from the `reports` array), but should align with the selected timeframe settings where possible.

4. **Assigned Hours Timeline Card – `AssignedHoursTimelineCard`**
   - Usage:
     ```tsx
     <div className="mt-4">
       <AssignedHoursTimelineCard />
     </div>
     ```
   - Purpose:
     - Shows assigned hours over time as a stacked area/line chart.
   - Layout:
     - Renders full-width in its own section below the breakdown/by-client row.
   - Data:
     - Uses the same analytics APIs as on the main Dashboard, but from a “reports” context.

5. **Department Performance Overview Table**
   - Built entirely from the `reports` array (no extra backend calls).
   - Columns:
     - Department, Team Size, Utilization, Peak, Assignments, Available hours, Skills counts/top skills, and a Health score.
   - Uses:
     - `UtilizationBadge` for avg and peak utilization visualization.
     - `getDepartmentHealthScore(report)` to compute a numeric health score and status (Excellent/Good/Fair/Needs Attention) based on utilization, overallocations, and team size.
   - Layout:
     - Rendered inside an `overflow-x-auto` table container; suitable for desktop but can force horizontal scroll on smaller screens.

6. **Skill Stats Section (embedded in table row)**
   - In each row, `report.skills` contains:
     - `totalSkills` (count of skills for dept).
     - `topSkills` (up to 5 strongest skills, with `name` + `count`).
     - `uniqueSkills` (number of distinct strengths).
     - `skillGaps` (skills that appear in other departments but not this one).
   - Purpose:
     - Give a quick skills profile per department: where strengths cluster, and where potential gaps exist.
   - Layout:
     - A mix of text and small pill-like lists inside the table, which can get dense on narrow screens.

7. **Department Utilization Distribution Card**
   - Renders a list of departments with a small bar indicating avg utilization percentage.
   - Reads from `reports` to build:
     - A bar whose width = min(avgUtilization, 100)% with color based on utilization range.
   - Purpose:
     - Provide a comparative view of utilization across departments.
   - Layout:
     - One card in a `grid grid-cols-1 lg:grid-cols-2` alongside the “Available Resources” card.

8. **Available Resources Card**
   - Filters `reports` where `metrics.availableHours > 0`, sorts descending by available hours.
   - Shows:
     - Department name.
     - Available hours.
     - Team size.
   - Purpose:
     - Help identify departments with spare capacity.
   - Layout:
     - Shares the `grid grid-cols-1 lg:grid-cols-2` row with the utilization distribution.

9. **Person Experience Report Link & Role Capacity Report Link**
   - These are navigation cards linking to more detailed, separate reports:
     - `/reports/person-experience`
     - `/reports/role-capacity`
   - They don’t fetch additional data on this page; they simply describe what the linked reports will show.

### Linearization Strategy for Mobile

To keep the backend calls batched while making the page mobile-first:

- **Preserve existing batching in `loadData()`**:
  - Continue using `Promise.all` for `departmentsApi.list`, `peopleApi.list`, and `personSkillsApi.list`.
  - Consider leaving `dashboardApi.getDashboard` per department as-is for now (a later optimization could introduce a batched version).

- **Reorder sections into a vertical, scannable flow**:
  1. **Timeframe selector** (small sticky header bar) and company summary cards:
     - Keep the timeframe buttons at the top so changing weeks is clear and still drives all underlying data.
     - Stack the four summary cards vertically or as a 2x2 grid on small screens.
  2. **Assigned-hours analytics row**:
     - On mobile, render `AssignedHoursBreakdownCard` and `AssignedHoursByClientCard` **stacked**, not side by side.
     - Optionally group them under a shared “Assigned Hours Analytics” heading for clarity.
  3. **Timeline**:
     - Keep `AssignedHoursTimelineCard` directly below the breakdown/by-client charts, spanning full width.
  4. **Department table → list**:
     - Replace the wide table with a **vertical list of department cards** on small screens:
       - Each card shows key metrics: name, manager, team size, avg/peak utilization, assignments, available hours.
       - Skill stats can be expressed as compact chips (top skills) and a “gaps” label.
       - Health score can be a badge at the bottom/right.
     - Keep the table for desktop (> a breakpoint) to preserve the tabular view.
  5. **Distribution + availability**:
     - Stack these two insight cards one under the other on mobile; keep the two-column grid only for larger screens.
  6. **Links to detailed reports**:
     - Leave these near the bottom of the page; they are navigation rather than core metrics.

- **Key principle**:
  - All analytics sections should consume **either the shared `reports` array** or their own existing analytics APIs; no new per-card backend calls should be introduced when linearizing. The main change is purely in presentation and ordering, not in the way data is fetched.

This audit gives a clear map of each analytics section, its data dependencies, and a safe path to linearize the layout for mobile while keeping backend requests batched and contracts unchanged.

