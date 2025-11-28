## Department Manager Dashboard – `frontend/src/pages/Departments/ManagerDashboard.tsx`

### High-level purpose

- Provides a **department-focused dashboard** for managers with:
  - A summary of core utilization metrics returned from `dashboardApi.getDashboard`.
  - A **team overview list** of people in the selected department, with utilization badges and capacity information.
  - A set of **“Quick Actions”** cards (Manage Team, View Reports, Balance Workload) to jump into other flows.

### Current layout & desktop assumptions

- Uses a single-column stacked layout inside `Layout`:
  - Top: **Header + Controls** in a single horizontal row:
    - Left: page title “Manager Dashboard”, descriptive subtitle, and a “Managing: {Department}” line when a department is selected.
    - Right: controls rendered as a horizontal strip:
      - **Department selector**: `<select>` bound to `selectedDepartment`, populated from `departmentsApi.list()`.
      - **Weeks period selector**: set of small buttons `[1, 2, 4, 8]` that update `weeksPeriod`.
  - Below header:
    - **Summary metrics row**: four `Card` components in a responsive grid:
      - Total Team Members.
      - Department Utilization.
      - Active Assignments.
      - Needs Attention (overallocated count).
    - **Team Management Overview** card:
      - Scrollable list of team members (`dashboardData.team_overview`) with name, role, allocated hours vs capacity, `UtilizationBadge`, and peak utilization notes.
    - **Quick Actions** card: three large action tiles laid out in a `grid-cols-1 md:grid-cols-3` pattern.
- Controls and summary cards assume **desktop width**:
  - The header’s title + controls on a single row.
  - The metrics cards row uses a grid wide enough to show four cards side-by-side at larger breakpoints.
  - The team list and quick actions sit below, with ample vertical space.

### Data & backend dependencies

- **Departments list and selection**
  - `departmentsApi.list()` is called once in `loadDepartments()` (inside `useAuthenticatedEffect`).
  - Response `results` are stored in `departments`.
  - On initial load, if there is no `selectedDepartment` and at least one department exists, the **first department is auto-selected**:
    - `setSelectedDepartment(depts[0].id!.toString())`.
  - This auto-selection is important: it ensures that there is always a **valid department ID** before dashboard or team data is requested.

- **Dashboard metrics**
  - `dashboardApi.getDashboard(weeksPeriod, selectedDepartment)` is called in `loadDepartmentData()` inside a `useAuthenticatedEffect` that depends on `[selectedDepartment, weeksPeriod]`.
  - Returned data is stored as `dashboardData: DashboardData | null`.
  - The summary cards and `team_overview` list all read from `dashboardData.summary` and `dashboardData.team_overview`.
  - Changing **department** or **weeksPeriod** triggers a new `dashboardApi` call.

- **Team list (people)**
  - `peopleApi.list()` is called in `loadDepartmentPeople()` each time the department changes.
  - Response is filtered client-side:
    - `deptPeople = allPeople.filter(person => person.department?.toString() === selectedDepartment)`.
  - Filtered list is stored in `departmentPeople`, but the visible team list actually uses `dashboardData.team_overview` rather than `departmentPeople`. `departmentPeople` is primarily present to support future features (e.g., additional panels).

### What must appear first on mobile (content priority)

Based on the current structure and dependencies:

1. **Department + period controls (header controls)**
   - The department selector (`selectedDepartment`) and period buttons (`weeksPeriod`) **drive all downstream data**:
     - `dashboardApi.getDashboard` depends directly on both.
     - `peopleApi.list` filtering depends on the selected department.
   - On mobile, these controls need to remain near the top, ideally as a compact, sticky control strip so managers can easily change department/period without scrolling past long lists.

2. **Summary metrics (dashboardApi.summary)**
   - These four cards give the quickest read on department health:
     - Total team members.
     - Average utilization.
     - Active assignments.
     - Overallocated count.
   - They are relatively low interaction and **high information density**, so they should sit immediately below the header controls on mobile.

3. **Team overview list (dashboardApi.team_overview)**
   - This is the main actionable section for managers:
     - Shows each team member’s utilization, capacity, and peak utilization signals.
     - Highlights overallocated team members (“Action needed” label).
   - On mobile, this list should follow directly after summary cards and remain easy to scan (one card per person, stacked vertically).

4. **Quick actions**
   - The “Manage Team”, “View Reports”, and “Balance Workload” tiles are navigation aids rather than core metrics.
   - They can safely be placed **after** the team overview section on mobile, or wrapped into a smaller card to avoid pushing key metrics below the fold.

### Mobile-specific risks & opportunities (no code changes yet)

- **Space constraints in header**
  - The current header renders title + controls side-by-side, which may wrap awkwardly on narrow screens.
  - The department selector and weeks buttons are essential; on mobile they likely need:
    - A stacked layout (title above controls) or
    - A compact sticky header/toolbar that shows just “Department” and “Period” selectors.

- **Horizontal overflow**
  - Summary and quick action cards use multi-column grids that may overflow or compress content on small viewports if not adjusted.
  - Team member rows include multiple text lines and a utilization badge; care is needed to keep them readable without forcing horizontal scroll.

- **API call behavior**
  - Current design already keeps calls lean:
    - One `departmentsApi.list` on load.
    - `dashboardApi.getDashboard` only when department or period changes.
    - `peopleApi.list` for department people when department changes.
  - A mobile redesign must preserve this behavior:
    - Avoid extra calls when simply scrolling.
    - Ensure department/period selectors remain the single source of truth so dashboard/team data and any future panels stay in sync.

This audit captures the current content hierarchy and dependencies needed to drive a mobile-first reflow in later phases without altering backend contracts or adding unnecessary calls.

