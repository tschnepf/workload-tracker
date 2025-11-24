# Mobile UI Phase 1 Audits

Results of the Phase 1 audit work for every routed page/component listed in `MobileUI.md`. Each section captures the current layout structure, key dependencies (frontend + backend), and the primary mobile risks that must be mitigated before moving into refactor phases.

---

## Dashboard (`frontend/src/pages/Dashboard.tsx`)
- **Layout:** Grid-based desktop layout mixing summary tiles, analytics cards, and the large utilization heatmap. Heavy reliance on multi-column Tailwind utilities and large table visualizations.
- **Dependencies:** `dashboardApi`, `projectsApi`, `peopleApi`, `personSkillsApi`, `rolesApi`, `useCapacityHeatmap`, `useDepartmentFilter`, `useUtilizationScheme`, various analytics components.
- **Mobile Risks:** Heatmap/table assumes wide viewport; skills filter + department controls occupy large horizontal space; analytics cards presume four-column grids; multi-step data flow (department filter → API) must remain consistent after refactor; new adapter layer already added for Phase 0 must stay source of truth.

## My Work / Personal Dashboard (`frontend/src/pages/Personal/PersonalDashboard.tsx`)
- **Layout:** Columnar widget layout (summary, calendar, schedule strip, deliverables). Widgets arranged in `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3`.
- **Dependencies:** `/personal/work/` endpoint via `apiClient`, `useAuth`, multiple widget components (`MySummaryCard`, `MyProjectsCard`, etc.).
- **Mobile Risks:** Widgets fetched from single payload; stacking order critical to keep high-value data above fold; schedule strip uses fixed-width timeline; ensures fetch occurs only after `personId` available to avoid blank screens on mobile slow connections.

## Assignments Grid (`frontend/src/pages/Assignments/AssignmentGrid.tsx`)
- **Layout:** Spreadsheet-like grid with sticky headers, synchronized scroll containers, drag-select interactions, inline editing.
- **Dependencies:** `useAssignmentsSnapshot`, `useCellSelection`, `useScrollSync`, `useGridKeyboardNavigation`, `assignmentsApi`, `peopleApi`, deliverable/project APIs, top bar slot system.
- **Mobile Risks:** Touch gesture support nonexistent; scroll sync expects wheel/keyboard; virtualization and layout density toggles tied to desktop assumptions; editing flows rely on keyboard shortcuts.

## Project Assignments Grid (`frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`)
- **Layout:** Table per project with expandable assignment rows, inline role/status controls, quick-view popovers, week columns.
- **Dependencies:** `getProjectGridSnapshot`, `useCellSelection`, `useGridUrlState`, `useProjectStatus`, `projectsApi`, `assignmentsApi`, role catalog utilities.
- **Mobile Risks:** Horizontal scroll for week columns; dropdowns rely on hover/click precision; URL state ensures shareable filters; quick view needs rethinking for touch.

## Assignment List (`frontend/src/pages/Assignments/AssignmentList.tsx`)
- **Layout:** Table view with action buttons, summary pills referencing global department filter.
- **Dependencies:** `assignmentsApi`, `peopleApi`, `departmentsApi`, `useDepartmentFilter`, `UtilizationBadge`.
- **Mobile Risks:** Table columns overflow on small screens; action buttons at far right; department pill controls rely on focusable buttons; ensuring server filters remain aligned after UI collapse.

## Assignment Form (`frontend/src/pages/Assignments/AssignmentForm.tsx`)
- **Layout:** Multi-section form with person/project search, skill parsing, and 12-week hour grid.
- **Dependencies:** `assignmentsApi`, `peopleApi`, `projectsApi`, `departmentsApi`, `personSkillsApi`, `skillTagsApi`, `useDepartmentFilter`.
- **Mobile Risks:** Grid uses horizontal table requiring desktop width; multi-step data capture currently in a single page; validation messaging inline; skill extraction logic expects large input fields.

## Projects List (`frontend/src/pages/Projects/ProjectsList.tsx`)
- **Layout:** Split-panel (table + details) with sticky filters and selection state. Left table uses virtualization; right panel handles inline editing and deliverables.
- **Dependencies:** `useProjects`, `useProjectFilters`, `useProjectSelection`, `useProjectAssignments`, `useProjectAvailability`, `assignmentsApi`, `projectsApi`, `deliverables` modules.
- **Mobile Risks:** Split pane unusable on small screens; virtualization tied to fixed row heights; detail panel assumes constant presence to keep state; deep-link query parameter (`projectId`) must keep working when layout changes.

## Project Form (`frontend/src/pages/Projects/ProjectForm.tsx`)
- **Layout:** Two-column form layout with client autocomplete dropdown hugging the input, inline error messages.
- **Dependencies:** `projectsApi`, `useCreateProject`, `useAuthenticatedEffect`, client list request.
- **Mobile Risks:** Multi-column arrangement compresses inputs; dropdown uses absolute positioning with narrow width; submit buttons at bottom require scroll; validation summary absent.

## People List (`frontend/src/pages/People/PeopleList.tsx`)
- **Layout:** Split panel similar to Projects with list pane, detail pane, filters, infinite scroll list, bulk actions.
- **Dependencies:** `usePeopleQueryPagination`, `usePersonSelection`, `useBulkActions`, `useDepartmentFilter`, `departmentsApi`, `rolesApi`, `useUpdatePerson`.
- **Mobile Risks:** Infinite scroll combined with dual-pane layout not mobile friendly; bulk mode interactions require multiple columns; filters appear as dropdowns anchored to desktop list.

## Person Form (`frontend/src/pages/People/PersonForm.tsx`)
- **Layout:** Multi-column grid with inline validation, toggle switches, long forms.
- **Dependencies:** `peopleApi`, `departmentsApi`, `rolesApi`, `useUpdatePerson`, `useCreatePerson`.
- **Mobile Risks:** Input groups share rows causing cramped mobile fields; status toggles small; validation errors inline (not summarized) causing off-screen issues on mobile.

## Departments List (`frontend/src/pages/Departments/DepartmentsList.tsx`)
- **Layout:** Two-pane (list + details) with modals for create/edit and search input at top.
- **Dependencies:** `departmentsApi`, `peopleApi`, `DepartmentForm`.
- **Mobile Risks:** Width assumptions on card list; modals sized for desktop; auto-selection logic must persist when list becomes stacked to avoid null detail view.

## Department Manager Dashboard (`frontend/src/pages/Departments/ManagerDashboard.tsx`)
- **Layout:** Controls for department selection + weeks toggles, summary cards, department people table.
- **Dependencies:** `dashboardApi`, `departmentsApi`, `peopleApi`, `useAuthenticatedEffect`.
- **Mobile Risks:** Controls arranged horizontally; metrics grid uses four columns; people list not optimized for small screens.

## Department Hierarchy View (`frontend/src/pages/Departments/HierarchyView.tsx`)
- **Layout:** Large canvas for hierarchy plus details sidebar.
- **Dependencies:** `DepartmentHierarchy` component, `departmentsApi`, `peopleApi`.
- **Mobile Risks:** Canvas assumes wide view; no fallback list; sticky detail panel anchored to right column.

## Department Reports (`frontend/src/pages/Departments/ReportsView.tsx`)
- **Layout:** Multi-card analytics dashboard with `AssignedHours*` cards, skill stats, tables.
- **Dependencies:** `dashboardApi`, `departmentsApi`, `peopleApi`, `personSkillsApi`.
- **Mobile Risks:** Cards rely on grid layout; chart controls not designed for stacked view; repeated API calls if sections re-render due to collapse patterns.

## Deliverables Calendar (`frontend/src/pages/Deliverables/Calendar.tsx`)
- **Layout:** Multi-week grid, horizontal scroll, person filter auto-complete, toggles for pre-deliverables.
- **Dependencies:** `deliverablesApi`, `deliverableAssignmentsApi`, `assignmentsApi`, `peopleApi`, `subscribeGridRefresh`.
- **Mobile Risks:** Grid width tied to weeks count; filter input expects pointer/keyboard; person filter results in dropdown requiring precise clicks; anchor navigation uses buttons spaced for desktop.

## Reports – Team Forecast (`frontend/src/pages/Reports/TeamForecast.tsx`)
- **Layout:** Header controls (weeks, scale, department), capacity chart, project timeline chart with selectable project.
- **Dependencies:** `peopleApi.workloadForecast`, `projectsApi`, `assignmentsApi`, `deliverablesApi`, `useDepartmentFilter`.
- **Mobile Risks:** Chart axes text small; controls horizontal; secondary project detail section not responsive; data requests heavy for mobile, so caching/adapter necessary.

## Reports – Person Experience (`frontend/src/pages/Reports/PersonExperience.tsx`)
- **Layout:** Multi-column filter stack, search results list, cards with charts.
- **Dependencies:** `usePeopleAutocomplete`, `usePersonExperienceProfile`, `usePersonProjectTimeline`.
- **Mobile Risks:** Search results dropdown sized for desktop; interval controls inline; sparkline width fixed; cards use CSS grid.

## Reports – Role Capacity (`frontend/src/pages/Reports/RoleCapacity.tsx`)
- **Layout:** Single card chart component.
- **Dependencies:** `RoleCapacityCard`.
- **Mobile Risks:** Card grid uses side-by-side columns; chart legends may overflow; control toggles assume horizontal space.

## Skills Dashboard (`frontend/src/pages/Skills/SkillsDashboard.tsx`)
- **Layout:** Multi-section analytics dashboard, coverage tables, skill management form on same page.
- **Dependencies:** `peopleApi`, `departmentsApi`, `skillTagsApi`, `personSkillsApi`.
- **Mobile Risks:** Large tables with many columns; skill management form inline; view mode toggles rely on horizontal segments.

## Performance Dashboard (`frontend/src/pages/Performance/PerformanceDashboard.tsx`)
- **Layout:** Summary cards grid, core vitals table, budget violations list, refresh controls.
- **Dependencies:** `getEnhancedPerformanceSummary`, `getEnhancedPerformanceMetrics`, `getBudgetViolations`, `PERFORMANCE_BUDGETS`.
- **Mobile Risks:** grid uses `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`; table data expects wide columns; refresh controls at far right.

## Settings (`frontend/src/pages/Settings/Settings.tsx`)
- **Layout:** Sidebar navigation + split-pane or sequential sections depending on flag; uses `SettingsSplitPane`.
- **Dependencies:** `Sidebar`, `settingsSections`, capability queries, `useSettingsData`.
- **Mobile Risks:** Sidebar always mounted; split-pane only; anchors rely on desktop; admin gating needs to persist when reorganized.

## Profile (`frontend/src/pages/Profile/Profile.tsx`)
- **Layout:** Multiple cards (profile info, appearance, name update, password change). Two-column grids.
- **Dependencies:** `useAuth`, `peopleApi`, `authApi`, `useUpdatePerson`, `setSettings`.
- **Mobile Risks:** Cards use `grid-cols-1 md:grid-cols-2`; buttons inline; toast placement relative to desktop.

## Auth – Login (`frontend/src/pages/Auth/Login.tsx`)
- **Layout:** Centered fixed-width card with form inputs, link to reset password.
- **Dependencies:** `login` store action, `react-router`.
- **Mobile Risks:** Card width set to `max-w-sm`; spacing manageable but need safe-area/padding, error banners may push form down.

## Auth – Reset Password (`frontend/src/pages/Auth/ResetPassword.tsx`)
- **Layout:** Uses `AuthLayout` (two-column desktop) with form inside.
- **Dependencies:** `authApi.requestPasswordReset`.
- **Mobile Risks:** Layout uses large padding; success/error alerts full width; buttons inline on same row.

## Auth – Set Password (`frontend/src/pages/Auth/SetPassword.tsx`)
- **Layout:** Similar `AuthLayout`, two password fields inline, action buttons side-by-side.
- **Dependencies:** `authApi.confirmPasswordReset`, URL params.
- **Mobile Risks:** Buttons crowd; error block large; instructions rely on multi-line text with limited width.

## Coming Soon / Help (`frontend/src/pages/ComingSoon/ComingSoon.tsx`)
- **Layout:** Standalone page with custom background, CTA buttons in a row.
- **Dependencies:** `react-router Link`.
- **Mobile Risks:** Not wrapped in shared `Layout`; padding uses fixed `py-16`; buttons inline causing overflow.

---

These findings inform Phase 2+ tasks in `MobileUI.md`. Each highlighted risk maps directly to the prompts already defined, ensuring no hidden dependencies remain before responsive refactors begin.

