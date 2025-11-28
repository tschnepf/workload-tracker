## Department Hierarchy View – `frontend/src/pages/Departments/HierarchyView.tsx`

### Current Layout & Responsibilities

- The page renders within the shared `Layout` and is responsible for:
  - Fetching **all departments** and **all people** via:
    - `departmentsApi.list()` → `departments` (paginated results flattened).
    - `peopleApi.list()` → `people`.
  - Passing those arrays into the **`DepartmentHierarchy` component** to render the organizational chart.
  - Showing a **details side panel** for the currently selected department (`selectedDepartment`), which includes:
    - Basic info (name, manager, active/inactive).
    - Hierarchy statistics (direct reports, sub-departments, total team size).
    - Description.
    - Team members list for that department.

### How `DepartmentHierarchy` Is Used Today

- JSX usage:
  ```tsx
  <DepartmentHierarchy
    departments={departments}
    people={people}
    onDepartmentClick={handleDepartmentClick}
    selectedDepartmentId={selectedDepartment?.id}
  />
  ```
- Expectations inferred from props:
  - `departments` and `people` are full arrays, not paged segments.
  - `onDepartmentClick` is used to update the right-hand details panel when a node is selected.
  - `selectedDepartmentId` is used for highlighting within the hierarchy.
- **Layout assumptions**:
  - The hierarchy is wrapped in:
    ```tsx
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3"> … DepartmentHierarchy … </div>
      <div className="xl:col-span-1"> … Details panel … </div>
    </div>
    ```
  - On XL screens, this yields a **wide 3/1 split**: large canvas on the left (`DepartmentHierarchy`), sticky details on the right.
  - On smaller screens (`< xl`), Tailwind collapses to a single column, but the hierarchy component itself is still designed with a “full chart” mental model, which likely assumes a horizontally generous canvas (e.g., nested branches, multiple columns, long labels).

### Data Dependencies & Call Patterns

- **Initial fetch**:
  - `useAuthenticatedEffect` runs `loadData()` once:
    - Uses `Promise.all([departmentsApi.list(), peopleApi.list()])`.
    - Stores `departments` and `people` from `.results || []`.
  - There is **no pagination** or lazy loading here—`DepartmentHierarchy` receives the entire dataset in one shot.
- **Selection handling**:
  - `onDepartmentClick` calls `setSelectedDepartment(department)`.
  - All stats and team-member lists in the right-hand panel are computed from the same `departments`/`people` arrays, there is **no additional backend call** on selection.
- **Statistics derivation**:
  - `getDepartmentStats(department)`:
    - `directReports`: people whose `department` equals the department id.
    - `subDepartments`: departments whose `parentDepartment` equals the department id.
    - `totalTeamSize`: direct reports + people inside each immediate child department.
  - Team list for the details panel is computed by filtering `people` for the selected department id.

### Wide Canvas Assumptions (Hierarchy View)

While we don’t see `DepartmentHierarchy`’s implementation here, the surrounding layout strongly implies:

- The chart expects **horizontal space**:
  - It is allocated `xl:col-span-3` of a 4-column grid, effectively the majority of the viewport on desktop.
  - The name “Organizational Chart” suggests tree/graph rendering, which typically:
    - Places parent nodes above/beside child nodes.
    - Uses horizontal branching to show multiple sub-departments at the same level.
  - On narrow screens, the same rendering is likely squeezed, causing:
    - Nodes to wrap awkwardly.
    - Horizontal scroll or zoom requirements.
    - Overlapping labels or connectors.

- The details panel is designed as a **sidebar**:
  - Sticky card (`sticky top-6`) sitting to the right of the chart at xl widths.
  - This layout assumes there is enough width for chart + side panel; on mobile it becomes stacked but selection UX is still chart-first, which may feel cramped.

### Mobile Fallback Concept (No Code Changes Yet)

To keep backend usage and data contracts identical while improving mobile, we can layer a **fallback representation** on top of the existing `DepartmentHierarchy` data:

- **Shared data**:
  - Continue fetching `departments` and `people` exactly as now via `departmentsApi.list()` and `peopleApi.list()`.
  - Keep passing them into `DepartmentHierarchy` for desktop.
  - For mobile, render the hierarchy as a **tree list / collapsible card structure** derived from the same arrays.

- **Mobile tree list / collapsible cards (conceptual)**:
  - Build an in-memory tree:
    - Roots: departments with `parentDepartment === null`.
    - Children: departments where `parentDepartment === parent.id`.
  - For each department:
    - Render a **card or row** showing:
      - Department name and status (Active / Inactive).
      - Key stats from `getDepartmentStats` (direct reports, sub-departments, total team size).
    - Tapping a row expands its children:
      - Shows nested child departments as indented cards.
      - Optionally shows a summary of team members (count and a few names).
    - Tapping again collapses the branch.
  - Use `selectedDepartment`/`selectedDepartmentId` to:
    - Highlight the currently selected row.
    - Show details in a dedicated panel or drawer (similar to how Department List and Manager Dashboard use drawers on mobile).

- **Desktop vs mobile behavior**:
  - Desktop (wide canvases):
    - Keep current `DepartmentHierarchy` organizational chart as the primary visualization.
    - Keep the sticky details panel on the right.
  - Mobile (narrow canvases, e.g., `< 768px`):
    - Prefer the **tree list view** by default:
      - Avoid forcing users to pan around a squeezed chart.
      - Maintain the existing details panel content, but show it as:
        - An inline section under the selected department row, or
        - A slide-over drawer that opens when the user taps into more details.
    - Optionally expose the full chart behind a “View full org chart” link for power users, while signaling that it may involve horizontal scrolling.

### Backend & Contract Considerations

- The proposed mobile fallback:
  - **Does not change any backend endpoints**:
    - Still uses `departmentsApi.list()` and `peopleApi.list()` once on load.
    - All hierarchy computations happen client-side from those arrays.
  - Preserves `DepartmentHierarchy` props and behavior, so:
    - Desktop view continues to work unchanged.
    - Any downstream components relying on `selectedDepartment` or `selectedDepartmentId` continue to function.
  - Allows mobile layouts to be improved incrementally without touching the API layer.

This audit stage only documents the current assumptions and outlines a mobile strategy; no code has been modified yet. It provides the baseline needed for a future Phase 2 refactor that introduces a breakpoint-aware tree list / collapsible card presentation alongside the existing `DepartmentHierarchy` chart.

