# Mobile UI Retrofit Plan

The following plan enumerates every routed page/component under `frontend/src/pages`, outlining prescriptive, lean-programming prompts per phase. Each prompt is written so it can be handed back to an AI agent without ambiguity, forbids shortcuts or band-aid fixes, and explicitly calls out backend/frontend coordination and testing expectations.

### Cross-Cutting Phase 0 – Feature Flag Safety Net
- Prompt 0: "Using lean programming best practices (no shortcuts or band-aid fixes), wrap every mobile-first refactor behind a per-route feature flag with telemetry + fail-open kill switch so we can ship both the desktop and mobile layouts in parallel until automated tests and production metrics confirm stability."

## Dashboard – `frontend/src/pages/Dashboard.tsx`
**Phase 0 – Adaptive Data Shims**
- Prompt 0: "Using lean programming best practices (no shortcuts or band-aid fixes), introduce adapter selectors around `useCapacityHeatmap`, `peopleMeta`, and analytics card props so both the legacy grid and the new mobile stacks consume identical data contracts while the feature flag is active."

**Phase 1 – Mobile-first Information Architecture Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), audit the Dashboard layout (`Layout`, summary cards, `QuickActionsInline`, `SkillsFilter`, `AssignedHours*` cards, utilization heatmap, `UpcomingPreDeliverablesWidget`) across 360px–1024px widths, and produce a dependency map covering hooks (`useDepartmentFilter`, `useCapacityHeatmap`, `dashboardApi`, `projectsApi`) so backend data contracts remain untouched while planning responsive breakpoints."
- Prompt 2: "Using lean programming best practices (no shortcuts or band-aid fixes), catalog which grid sections depend on multi-column CSS (e.g., `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3`) and document the minimum viable stacking/accordion order for mobile, ensuring filters and API-driven selectors remain logically grouped."

**Phase 2 – Responsive Layout Refactor**
- Prompt 3a: "Using lean programming best practices (no shortcuts or band-aid fixes), refactor the Dashboard header + control block so department/time selectors collapse into a sticky mobile toolbar with accessible toggle buttons, keeping `useDepartmentFilter` in sync with backend query parameters and avoiding duplicate state." 
- Prompt 3b: "Using lean programming best practices (no shortcuts or band-aid fixes), convert the analytics cards (`AssignedHoursBreakdownCard`, `AssignedHoursByClientCard`, `AssignedHoursTimelineCard`, `RoleCapacityCard`) into swipeable horizontal carousels below 768px while ensuring data props remain identical to backend responses to avoid mismatches." 
- Prompt 3c: "Using lean programming best practices (no shortcuts or band-aid fixes), split the capacity heatmap/table into a vertically scrollable list where each person renders a condensed sparkline plus modal that streams week data from `useCapacityHeatmap`, guaranteeing API pagination is respected instead of duplicating data."

**Phase 3 – Interaction + Performance Enhancements**
- Prompt 4a: "Using lean programming best practices (no shortcuts or band-aid fixes), encapsulate `SkillsFilter` into a command-palette style drawer that debounces `personSkillsApi` calls to prevent backend thrash while keeping selected skills visible as chips on mobile, persisting filter state in shared context so department filters stay synchronized across routes." 
- Prompt 4b: "Using lean programming best practices (no shortcuts or band-aid fixes), implement lazy mounting for secondary widgets (e.g., `UpcomingPreDeliverablesWidget`) behind `IntersectionObserver` so mobile devices don’t pay for data until the section comes into view, coordinating fetch lifecycles with existing services." 

**Phase 4 – Responsive Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add Playwright scenarios targeting 360px, 414px, 768px, and 1024px viewports for the Dashboard, mocking `dashboardApi`, `projectsApi`, and `peopleApi` to verify headers, cards, and the heatmap drawer render without horizontal scrolling, and document results in `reports/mobile/dashboard.md`."

## My Work / Personal Dashboard – `frontend/src/pages/Personal/PersonalDashboard.tsx`
**Phase 1 – Content Prioritization Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), map the current widget order (`MySummaryCard`, `MyProjectsCard`, `MyDeliverablesCard`, `PersonalCalendarWidget`, `MyScheduleStrip`, `UpcomingPreDeliverablesWidget`) and define a mobile-first stacking strategy that keeps critical API data (from `/personal/work/`) above the fold while aligning with backend payload structure."

**Phase 2 – Layout + Widget Refactors**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), convert the multi-column widget grid into a responsive CSS grid that becomes a swipeable card stack below 768px, ensuring each widget’s props remain unchanged to avoid backend mismatches." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), redesign `MyScheduleStrip` and `PersonalCalendarWidget` so weekly data can be scrolled horizontally with sticky labels, deferring fetches until the authenticated user id is confirmed via `useAuth`."
- Prompt 2c: "Using lean programming best practices (no shortcuts or band-aid fixes), centralize `/personal/work/` fetching + caching so pull-to-refresh gestures, swipe views, and widgets reuse the same response while enforcing retry/backoff rules to avoid hammering the backend when the mobile layout re-renders."

**Phase 3 – Interaction + Accessibility**
- Prompt 3: "Using lean programming best practices (no shortcuts or band-aid fixes), add pull-to-refresh friendly controls and focus management for `mywork-heading`, ensuring error states from `apiClient.GET('/personal/work/')` render mobile-optimized fallback skeletons instead of desktop placeholders."

**Phase 4 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), script a Vitest + React Testing Library suite that mounts `PersonalDashboard` at 390px and asserts summary, calendar, and schedule widgets collapse correctly while honoring mocked backend responses; capture screenshots via Playwright for regression tracking."

## Assignments Grid – `frontend/src/pages/Assignments/AssignmentGrid.tsx`
**Phase 1 – Grid Behavior Audit**
- Prompt 1a: "Using lean programming best practices (no shortcuts or band-aid fixes), audit the spreadsheet components (`PeopleSection`, `AssignmentRowComp`, `WeekHeaderComp`, `StatusBar`) to understand dependencies on fixed widths, synchronized scrolling, and the `useAssignmentsSnapshot` data contract so mobile refactors do not desynchronize backend snapshots." 
- Prompt 1b: "Using lean programming best practices (no shortcuts or band-aid fixes), document which gestures (drag-select, keyboard navigation, `useGridKeyboardNavigation`) are unusable on touch devices and outline equivalent touch interactions needed for mobile." 

**Phase 2 – Responsive Layout Strategy**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), introduce a breakpoint-aware presenter that swaps the wide grid for per-person accordions below 1024px, summarizing week totals via spark bars while fetching detailed `weekKeys` on demand via `useAssignmentsSnapshot` to keep backend load lean." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), refactor header controls (`WeeksSelector`, `StatusFilterChips`, `HeaderActions`) into a sticky mobile toolbar and ensure URL state from `useGridUrlState` stays canonical so backend filters remain aligned." 
- Prompt 2c: "Using lean programming best practices (no shortcuts or band-aid fixes), encapsulate edit interactions into modal sheets optimized for touch, preserving optimistic updates to `assignmentsApi`/`peopleApi` and guaranteeing role updates still flow through `updateAssignmentRoleAction`."
- Prompt 2d: "Using lean programming best practices (no shortcuts or band-aid fixes), extract selection, scroll-sync, and layout-density management into a shared interaction store so both the legacy grid and the mobile accordions keep `useCellSelection`, `useScrollSync`, and `setMainPadding` behavior in lockstep while the feature flag is active."

**Phase 3 – Performance + Capability Alignment**
- Prompt 3a: "Using lean programming best practices (no shortcuts or band-aid fixes), add virtualized horizontal scrolling with snap points for week columns so mobile users can scrub across time without DOM bloat, ensuring scroll-sync hooks (`useScrollSync`) keep header and body aligned." 
- Prompt 3b: "Using lean programming best practices (no shortcuts or band-aid fixes), ensure capability checks (`useCapabilities`) still gate editing actions on mobile, surfacing clear disabled states rather than removing controls." 

**Phase 4 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), run automated touch-emulation tests (Playwright + pointer events) to verify selection, edit, and add-assignment workflows succeed on 390px width with mocked `assignmentsApi`, `deliverablesApi`, and `projectsApi` responses, logging latency regressions under `reports/mobile/assignments-grid.md`."

## Project Assignments Grid – `frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`
**Phase 1 – Layout & Interaction Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), catalogue every responsive risk inside `ProjectAssignmentsGrid` (project quick view buttons, role dropdowns, status editors, week columns) and how they depend on `getProjectGridSnapshot`, `useCellSelection`, and `useProjectStatus`, so mobile changes never desync backend batch updates." 

**Phase 2 – Mobile Layout Refactors**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), redesign the table into a collapsible card list where each project renders client + status summary plus a horizontal scroller of weekly bars, guaranteeing hours + deliverables data stays keyed by backend `weekKeys`." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), move filter/header controls (`WeeksSelector`, `StatusFilterChips`, `HeaderActions`) into an overlay drawer that synchronizes with `useGridUrlState` parameters and backend filters so URLs stay sharable." 
- Prompt 2c: "Using lean programming best practices (no shortcuts or band-aid fixes), convert inline role/status dropdowns into accessible bottom sheets that keep `projectsApi`/`assignmentsApi` updates debounced and confirm capability checks before dispatching mutations." 
- Prompt 2d: "Using lean programming best practices (no shortcuts or band-aid fixes), preserve `rowOrder`, quick-view prefetching, and selection state by extracting those hooks into a layout-agnostic controller before swapping to cards, ensuring touch UIs still honor bulk edits and optimistic updates."

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), extend Playwright coverage to run through collapsing/expanding projects on small screens, mocking role catalogs from `listProjectRoles` to ensure dropdown sheets render correctly and that no backend query parameters drift." 

## Assignment List – `frontend/src/pages/Assignments/AssignmentList.tsx`
**Phase 1 – Table Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), analyze the current table markup (within `Card`) to identify which columns are essential on mobile (e.g., project, person, hours, utilization badge) and how department filters from `useDepartmentFilter` must surface without duplicating backend calls." 

**Phase 2 – Responsive Implementation**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), convert the table into stacked list items with expandable detail drawers, ensuring delete/edit actions stay aligned with backend IDs and that utilization data continues to use `UtilizationBadge`." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), rebuild the sub-header pill (department filter info) into a compact chip row that remains keyboard-accessible on mobile." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add RTL tests verifying that filtering + action buttons remain reachable at 375px width and that mocked `assignmentsApi`/`peopleApi` data renders without horizontal scroll."

## Assignment Form (New/Edit) – `frontend/src/pages/Assignments/AssignmentForm.tsx`
**Phase 1 – Form Field Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), inventory all form groups (person search, project search, weekly hour grid, skills inputs) and map them to backend dependencies (`assignmentsApi`, `peopleApi`, `projectsApi`, `personSkillsApi`, `skillTagsApi`) so mobile splits don’t break validation." 

**Phase 2 – Stepper/Wizard Refactor**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), refactor the monolithic form into a mobile-friendly stepper (Select Person → Match Skills → Allocate Weeks → Review) while persisting data in the existing `AssignmentFormData` shape for backend submission." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), redesign the 12-week grid as a horizontally scrollable timeline with sticky week headers, ensuring `weeklyHours` serialization stays identical for the backend payload." 

**Phase 3 – Validation & Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), expand the form test suite to cover touch-driven flows, verifying that validation errors and API failures surface legibly at 360px, using mocked `assignmentsApi` to avoid backend drift."

## Projects List – `frontend/src/pages/Projects/ProjectsList.tsx`
**Phase 1 – Split-Panel Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), analyze the left-table/right-detail split (ProjectsTable + ProjectDetailsPanel) and enumerate each dependency on `useProjectFilters`, `useProjectSelection`, `useProjectAssignments`, and `useProjectAvailability` so mobile reflows maintain backend data integrity." 

**Phase 2 – Responsive Redesign**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), transform `ProjectsTable` into a responsive list where essential columns remain inline and secondary data moves into collapsible sections, keeping virtualization (`useVirtualRows`) intact for large datasets." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), convert `ProjectDetailsPanel` into a slide-over drawer or dedicated detail route for mobile, ensuring inline editing still calls `assignmentsApi`/`projectsApi` with the same payloads." 
- Prompt 2c: "Using lean programming best practices (no shortcuts or band-aid fixes), move `FiltersBar` into a mobile sheet with sticky apply/reset controls so query params remain synced with backend filter metadata." 
- Prompt 2d: "Using lean programming best practices (no shortcuts or band-aid fixes), keep deep-link selection (`/projects?projectId=`) and selection state hydrated while toggling between desktop split view and the mobile drawer, sharing one controller for virtualization, selection index, and query params."

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), script Playwright journeys that deep-link via `/projects?projectId=` on 390px screens to prove the drawer layout correctly selects projects and loads assignments without state drift." 

## Project Form – `frontend/src/pages/Projects/ProjectForm.tsx`
**Phase 1 – Form Assessment**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), audit the form’s grid layout (`Card` with multi-column groups, client autocomplete dropdown) and capture backend requirements from `projectsApi` so mobile adjustments honor validation flows." 

**Phase 2 – Responsive Refactor**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), reorganize fields into single-column groups with sticky action bar, ensuring dropdowns (client list) become full-width and keyboard safe on touch devices." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), ensure the pre-deliverable settings component renders as a collapsible card with accessible toggles on mobile while preserving API payload consistency." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add RTL form tests at 375px verifying submit/validation flows for create vs edit paths, mocking `projectsApi` client suggestions."

## People List – `frontend/src/pages/People/PeopleList.tsx`
**Phase 1 – Split Layout Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), profile the two-pane layout (`PeopleListPane`, `PersonDetailsContainer`, `FiltersPanel`, `BulkActionsBar`) and capture dependencies on infinite pagination (`usePeopleQueryPagination`) so refactors keep backend pagination + bulk actions valid." 

**Phase 2 – Responsive Redesign**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), convert the panes into a stacked layout where the list becomes a searchable accordion and the detail view opens as a full-height drawer, maintaining selection state via `usePersonSelection`." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), migrate filter controls into a mobile sheet that syncs with department/location filters without duplicating backend requests." 
- Prompt 2c: "Using lean programming best practices (no shortcuts or band-aid fixes), provide a compact UI for bulk actions with clear summaries of selected IDs so backend updates (`useBulkActions` + `useUpdatePerson`) remain explicit." 
- Prompt 2d: "Using lean programming best practices (no shortcuts or band-aid fixes), preserve infinite-scroll pagination (`usePeopleQueryPagination`) and defer drawer rendering while additional pages load so selection + bulk state cannot desynchronize from the backend cursor."

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), expand integration tests to verify infinite scroll, selection, and bulk updates function on 390px screens with mocked `peopleApi`/`departmentsApi`/`rolesApi` responses." 

## Person Form – `frontend/src/pages/People/PersonForm.tsx`
**Phase 1 – Form Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), map every field group (name, weekly capacity, role select, department select, location, hire date, status) plus backend dependencies so mobile refactors keep `PersonFormData` serialization intact." 
    • “Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set‑Content/echo/sed) to modify code. Do not insert literal ‘\r\n’ sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate. When appropriate, refactor large or repetitive code into separate helper files, modules, services, or Hooks to improve readability, maintainability, and reuse. Ensure all such extractions follow standard TypeScript modularization best practices and preserve existing functionality.”

Only use best practice programming, do not use any shortcuts

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), extend form tests to emulate both create and edit flows on mobile widths, confirming `peopleApi` mocks receive correct payloads."

## Departments List – `frontend/src/pages/Departments/DepartmentsList.tsx`
**Phase 1 – Layout Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), examine the left column list + right detail layout and list every interaction (search, selection, modal) that assumes desktop widths so mobile redesign keeps backend `departmentsApi` calls minimal." 

**Phase 2 – Responsive Refactor**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), convert the UI into layered cards: list view with swipe actions for edit/delete and a modal drawer for details/forms, ensuring `DepartmentForm` modals still patch backend data correctly." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), relocate search + action buttons into a sticky mobile header, keeping state in sync with the existing hooks." 
- Prompt 2c: "Using lean programming best practices (no shortcuts or band-aid fixes), retain the current auto-select-on-load behavior so a valid department is always focused before opening the mobile detail drawer, preventing null dereferences in downstream components."

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add Playwright tests that create/edit/delete departments on 375px screens, asserting API mocks for `departmentsApi` and `peopleApi` stay aligned." 

## Department Manager Dashboard – `frontend/src/pages/Departments/ManagerDashboard.tsx`
**Phase 1 – Content Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), analyze which metrics/cards (`dashboardApi` summary, team list) must appear first on mobile, capturing dependencies on department selector and weeksPeriod controls." 

**Phase 2 – Responsive Refactor**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), stack summary cards vertically with swipeable groups, ensuring selectors collapse into a compact toolbar while still driving backend queries." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), redesign the people list into expandable chips to keep key stats visible without horizontal scroll." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add viewport tests verifying selector interactions and summary cards render correctly below 480px with mocked `dashboardApi` + `peopleApi` data." 

## Department Hierarchy View – `frontend/src/pages/Departments/HierarchyView.tsx`
**Phase 1 – Structure Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), inspect `DepartmentHierarchy` rendering to identify assumptions about wide canvases, and define a mobile fallback (tree list / collapsible cards) that still consumes the same backend datasets." 

**Phase 2 – Responsive Visualization**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), implement zoomable/pannable behavior for the hierarchy canvas plus a text-based tree fallback for screens under 768px." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), move the detail sidebar into an overlay drawer with sticky stats, keeping selections wired to backend data and avoiding duplicated fetches." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), create visual regression tests ensuring both the canvas and list fallback render correctly on narrow screens with mocked `departmentsApi`/`peopleApi` data." 

## Department Reports – `frontend/src/pages/Departments/ReportsView.tsx`
**Phase 1 – Data + Layout Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), document each analytics section (`AssignedHoursBreakdownCard`, `AssignedHoursTimelineCard`, `AssignedHoursByClientCard`, skill stats) and determine how to linearize them while keeping backend requests batched." 

**Phase 2 – Responsive Refactor**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), reorganize analytics into accordion groups with lazy-loading content so mobile devices fetch data only when expanded." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), implement comparative badges that remain legible at small sizes while still rendering values from backend `dashboardApi` responses." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add e2e tests validating accordion expand/collapse across breakpoints with mocked analytics services, ensuring no duplicated backend calls." 

## Deliverables Calendar – `frontend/src/pages/Deliverables/Calendar.tsx`
**Phase 1 – Calendar Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), review the multi-week grid (`CalendarGrid`, week navigation, person filter autocomplete) to determine how to condense it for mobile while respecting backend fetch params (`start`, `end`, `deliverableAssignmentsApi`)." 

**Phase 2 – Responsive Calendar Patterns**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), add a compact agenda/timeline view below 768px with horizontal swipes for week navigation, ensuring backend date ranges stay accurate." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), move person filter/search into a modal search sheet with async debounced queries to avoid hammering the backend on small devices." 
- Prompt 2c: "Using lean programming best practices (no shortcuts or band-aid fixes), maintain the existing `allowedDeliverableIds`/`allowedProjectIds` gating logic across grid and agenda modes so person filters, refresh bus events, and backend scopes stay aligned."

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), automate viewport tests verifying agenda vs grid modes render correctly and that mocked fetches for `/deliverables/calendar_with_pre_items/` remain synchronized with UI state." 

## Reports – Team Forecast – `frontend/src/pages/Reports/TeamForecast.tsx`
**Phase 1 – Chart Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), analyze `CapacityTimeline` and `ProjectTimeline` components to determine responsive fallbacks (sparklines, stacked bars) while keeping backend calls (`peopleApi.workloadForecast`, `assignmentsApi`, `deliverablesApi`) efficient." 

**Phase 2 – Responsive Visualization**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), implement adaptive chart components that swap to simplified canvases on small screens but maintain identical data contracts." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), convert project selector + department filter into stacked mobile controls with sticky apply buttons to prevent backend query drift." 
- Prompt 2c: "Using lean programming best practices (no shortcuts or band-aid fixes), cache responses from `peopleApi.workloadForecast`, `assignmentsApi`, and `deliverablesApi` behind memoized selectors so new mobile chart variants reuse the same dataset instead of issuing duplicate network calls."

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add visual regression tests capturing chart renders at 360px/768px and asserting tooltips/legends remain tappable with mocked API data." 

## Reports – Person Experience – `frontend/src/pages/Reports/PersonExperience.tsx`
**Phase 1 – UI Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), inventory the search, filters, and project cards (including sparkline) to plan a single-column mobile design without altering backend hooks (`usePeopleAutocomplete`, `usePersonExperienceProfile`, `usePersonProjectTimeline`)." 

**Phase 2 – Mobile Redesign**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), transform the filter controls into collapsible sections with input debouncing, ensuring API parameters stay coordinated." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), restyle project cards for vertical stacking with accessible scroll for sparkline SVGs." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), extend tests confirming autocomplete and interval controls remain usable under 414px width with mocked experience data." 

## Reports – Role Capacity – `frontend/src/pages/Reports/RoleCapacity.tsx`
**Phase 1 – Component Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), review `RoleCapacityCard` to ensure its internal grid adapts to narrow widths without truncating backend metrics." 

**Phase 2 – Responsive Tweaks**
- Prompt 2: "Using lean programming best practices (no shortcuts or band-aid fixes), add CSS clamps + stacking logic so the role capacity chart becomes vertically scrollable on mobile while preserving existing data props." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add snapshot tests at 360px verifying role cards wrap correctly using mocked analytics data." 

## Skills Dashboard – `frontend/src/pages/Skills/SkillsDashboard.tsx`
**Phase 1 – Data Layout Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), catalog each skills section (coverage summary, department breakdowns, skill management form) and determine how to stage them for mobile while keeping backend queries batched." 

**Phase 2 – Responsive Redesign**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), reorganize coverage tables into cards with progress indicators and horizontal scroll areas for long skill lists, ensuring computed coverage stays consistent." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), wrap the skill management form into a modal suited for mobile while maintaining `skillTagsApi` interactions." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add tests confirming coverage cards and filters behave correctly at small widths with mocked API datasets." 

## Performance Dashboard – `frontend/src/pages/Performance/PerformanceDashboard.tsx`
**Phase 1 – Widget Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), analyze the summary grid, vitals cards, tables, and timers to plan a stacked mobile layout without altering monitoring hooks (`getEnhancedPerformanceSummary`, etc.)." 

**Phase 2 – Responsive Layout**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), convert the metric grid into a responsive flex stack with horizontal scroll when necessary, ensuring color tokens remain accessible." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), make tables collapse into list items with inline badges for mobile, keeping underlying data arrays unchanged." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add responsive screenshot tests verifying KPI cards and violation tables remain legible on 375px screens using mocked monitoring data." 

## Settings – `frontend/src/pages/Settings/Settings.tsx`
**Phase 1 – Navigation Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), review `Sidebar`, `SettingsSplitPane`, and sequential fallback to determine how to present sections on mobile while respecting admin gating and backend capability queries." 

**Phase 2 – Responsive Navigation**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), convert the sidebar into a slide-in drawer with persistent section list, ensuring anchors (`#section-id`) still work." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), adapt split-pane into accordion sections on small screens, lazily mounting section components to keep backend fetches minimal." 
- Prompt 2c: "Using lean programming best practices (no shortcuts or band-aid fixes), reuse the existing `Sidebar` data provider inside the drawer so capability-filtered sections (admin-only, feature-flagged) remain accurate on mobile without duplicating queries."

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add navigation tests confirming drawer toggles work on mobile and that capability filtering still hides admin-only sections." 

## Profile – `frontend/src/pages/Profile/Profile.tsx`
**Phase 1 – Form Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), examine the profile summary grid, appearance selector, name edit form, and password change section to plan a mobile-friendly flow while keeping backend mutations (`authApi`, `useUpdatePerson`) intact." 

**Phase 2 – Responsive Refactor**
- Prompt 2a: "Using lean programming best practices (no shortcuts or band-aid fixes), convert the profile cards into stacked sections with sticky feedback/toast areas for mobile." 
- Prompt 2b: "Using lean programming best practices (no shortcuts or band-aid fixes), redesign password inputs into collapsible panels with show/hide toggles that remain secure and align with backend expectations." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add tests verifying profile edits and password changes work on narrow screens with mocked `authApi`/`peopleApi` responses." 

## Auth – Login – `frontend/src/pages/Auth/Login.tsx`
**Phase 1 – Layout Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), assess the centered card layout to ensure it scales down to 320px without overflow while keeping the `login` store action unchanged." 

**Phase 2 – Responsive Enhancements**
- Prompt 2: "Using lean programming best practices (no shortcuts or band-aid fixes), add safe-area padding, password visibility toggle, and improved error messaging for mobile while keeping form submission identical." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add accessibility + viewport tests verifying keyboard navigation and validation behave on small screens." 

## Auth – Reset Password – `frontend/src/pages/Auth/ResetPassword.tsx`
**Phase 1 – Layout Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), review `AuthLayout` to ensure typography & spacing collapse gracefully on phones while keeping backend requests (`authApi.requestPasswordReset`) untouched." 

**Phase 2 – Responsive Enhancements**
- Prompt 2: "Using lean programming best practices (no shortcuts or band-aid fixes), ensure action buttons stack vertically on narrow screens and include contextual guidance without altering backend payloads." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add RTL tests verifying focus order and validation on mobile widths." 

## Auth – Set Password – `frontend/src/pages/Auth/SetPassword.tsx`
**Phase 1 – Layout Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), verify the dual password fields and token error states fit mobile widths while keeping URL param parsing consistent." 

**Phase 2 – Responsive Enhancements**
- Prompt 2: "Using lean programming best practices (no shortcuts or band-aid fixes), implement a step indicator + stacked action buttons optimized for touch, ensuring backend `authApi.confirmPasswordReset` usage stays the same." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add tests that simulate invalid tokens and successful submissions on small screens with mocked APIs." 

## Coming Soon / Help – `frontend/src/pages/ComingSoon/ComingSoon.tsx`
**Phase 1 – Layout Audit**
- Prompt 1: "Using lean programming best practices (no shortcuts or band-aid fixes), evaluate the static layout to ensure it uses the global `Layout` shell or equivalent responsive container instead of fixed padding." 

**Phase 2 – Responsive Enhancements**
- Prompt 2: "Using lean programming best practices (no shortcuts or band-aid fixes), add responsive typography, safe-area padding, and CTA button stacking so the help page reads well on phones while keeping links intact." 

**Phase 3 – Testing**
- Prompt T1: "Using lean programming best practices (no shortcuts or band-aid fixes), add a smoke test verifying the coming-soon page renders correctly at 320px/768px widths." 
