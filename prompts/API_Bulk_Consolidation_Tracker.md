# API Bulk Consolidation Tracker

_Last updated: November 27, 2025_

## Change Log
- **2025-11-27** – Initial scaffold seeded with Assignments, Projects, People, Dashboard, Reports, and Settings candidates per Phase 0 prep.

## How to Use This Tracker
- Every audit phase adds/updates rows in the tables below. Keep section order aligned with `API_Call_Audit_Plan.md`.
- `Existing Calls` should cite both the hook/service and, when known, the underlying endpoint.
- `Pain Points` summarize the duplication/latency that motivates consolidation.
- `Bulk Proposal` describes the intended single-call payload plus required backend work.
- `Owner/Status` tracks who is driving the change and whether the work is scoped, blocked, or in-flight.

---

## Assignments Surfaces
| Page / Feature | Existing Calls | Pain Points | Bulk Proposal | Owner / Status |
| --- | --- | --- | --- | --- |
| ProjectAssignmentsGrid (`frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`) | `getProjectGridSnapshot`, `getProjectTotals`, `deliverablesApi.calendar`, `deliverablesApi.bulkList`, `deliverablesApi.listAll`, `listProjectRoles`, `projectsApi.get` (quick-view prefetch), `assignmentsApi.update/create`, `peopleApi.list` | Snapshot, totals, deliverable markers, and role catalogs fetch separately whenever filters or expanded rows change; hover prefetch runs `projectsApi.get` per project; fallback deliverable fetch triggers `bulkList` + `listAll` even when we already have week data. | Design `/assignments/project-grid` bulk endpoint returning (a) weeks + assignments + totals, (b) per-project deliverable markers, (c) department role catalogs, and (d) per-project status metadata for quick view. Frontend consumes a single React Query resource and fan-outs (prefetch, dropdowns) read from cache. | Owner TBD – Phase 1 discovery (Not started). |
| AssignmentGrid (`frontend/src/pages/Assignments/AssignmentGrid.tsx`) | `assignmentsApi.byPerson`, `.list`, `.create`, `.update`, `.delete`; `peopleApi.list`; `deliverablesApi.list`; `projectsApi.get`; `jobsApi.start` | Each row edit or virtualized segment triggers per-person `assignmentsApi.byPerson` calls plus separate deliverable lookups; grid builds hours + utilization from disparate payloads, so editing a week revalidates several endpoints; background jobs tracked via `jobsApi` even though same data already exists locally. | Build `/assignments/person-grid` aggregator that returns people, assignments, deliverables, and job statuses keyed by department/week filter. Mutations return updated aggregates so we avoid cascading refetches. | Owner TBD – Phase 1 discovery (Not started). |
| AssignmentList (`frontend/src/pages/Assignments/AssignmentList.tsx`) | Parallel `assignmentsApi.list`, `peopleApi.list`, `departmentsApi.list` per filter change; deletions refetch assignments separately. | Simple list still makes three network trips for metadata already cached elsewhere; pagination multiplies the cost. | Add `/assignments/list-with-metadata` response that bundles assignment rows, person summaries, and department options. Cache metadata per department scope so repeated visits reuse it. | Owner TBD – Phase 1 discovery (Not started). |
| AssignmentForm (`frontend/src/pages/Assignments/AssignmentForm.tsx`) | `peopleApi.skillMatch` (twice per search), `peopleApi.list`, `projectsApi.list`, `departmentsApi.list`, `skillTagsApi.list`, `personSkillsApi.list`, `assignmentsApi.create/update` | Form bootstrap performs six+ sequential calls before user can edit; repeated skillMatch invocations hammer the API when filters change. | Provide `/assignments/form-bootstrap` endpoint returning departments, roles, project options, skill tags, and existing person skills, plus cached skillMatch suggestions keyed by project/department. Combine with debounced client-side filtering to slash live queries. | Owner TBD – Phase 1 discovery (Not started). |
| Assignments Grid Hooks (`frontend/src/pages/Assignments/grid/*`) | `useAssignmentsSnapshot`, `useDeliverablesIndex`, `useProjectAssignmentsAdd`, various `assignmentsApi` mutations | Supporting hooks duplicate earlier calls when reused outside the primary grid. | Audit shared hooks and route them through the same bulk snapshot once `/assignments/project-grid` exists, ensuring derived hooks read from normalized stores instead of re-fetching. | Owner TBD – Phase 1 discovery (Not started). |

---

## Projects & Deliverables
| Page / Feature | Existing Calls | Pain Points | Bulk Proposal | Owner / Status |
| --- | --- | --- | --- | --- |
| ProjectsList (`frontend/src/pages/Projects/ProjectsList.tsx`) | `useProjects` (projectsApi.list), `useProjectFilterMetadata`, `useProjectAssignments`, `useProjectAvailability`, `useProjectDeliverablesBulk`, `useAssignmentInlineEdit` (assignmentsApi), `useProjectAssignmentAdd`, `useProjectStatusMutation`, `usePeople`, `projectsApi.get` via quick view | Selecting a project fans out to assignments, availability, deliverables, and detail fetches; filter metadata loads separately even though list payload already includes counts; deliverable previews come from yet another hook. | Introduce `/projects/list?include=filters,assignments,deliverables,nextPrev,availability` so the main list response ships both table rows and detail panel data. Keep assignments/deliverables in normalized caches to reuse on inline edits without re-querying. | Owner TBD – Phase 2 discovery (Not started). |
| ProjectForm (`frontend/src/pages/Projects/ProjectForm.tsx`) | `projectsApi.get`, `projectsApi.getClients`, `projectsApi.create/update` | Form bootstrap waits on `getClients` even in edit mode; no shared cache with Settings or other forms. | Add `/projects/form-bootstrap` returning client options, default departments, and feature flags; share payload with Settings role/department caches to prevent redundant fetches. | Owner TBD – Phase 2 discovery (Not started). |
| Project Deliverables Hooks (`frontend/src/pages/Projects/list/hooks/useProjectDeliverablesBulk.ts`) | `deliverablesApi.bulkList`, `deliverablesApi.list` per project selection | Bulk hook still reissues per-project calls when selection changes; duplicates deliverable calendar payloads. | Fold deliverable previews into the project list aggregator, keyed by project id + next/prev deliverable summary, so detail panel reuses cached data. | Owner TBD – Phase 2 discovery (Not started). |
| Deliverables Calendar (`frontend/src/pages/Deliverables/Calendar.tsx`) | `useDeliverablesCalendar` (deliverablesApi.calendar), `deliverableAssignmentsApi.byPerson`, `assignmentsApi.byPerson`, `peopleApi.list` for person search | Filtering by person results in three requests (deliverable links, assignments, calendar data) even though deliverable calendar already knows project/person ids. | Extend calendar endpoint to optionally embed assignment + deliverable link metadata for selected people so additional `byPerson` calls disappear; provide a `people/search` subset inside the same response for filter suggestions. | Owner TBD – Phase 2 discovery (Not started). |

---

## People, Departments, Skills
| Page / Feature | Existing Calls | Pain Points | Bulk Proposal | Owner / Status |
| --- | --- | --- | --- | --- |
| PeopleList (`frontend/src/pages/People/PeopleList.tsx`) | `usePeopleQueryPagination` (peopleApi.list paginated), `departmentsApi.list`, `rolesApi.list`, `useUpdatePerson` (peopleApi.patch) | Department + role metadata refetches on every mount even though multiple routes share it; infinite scroll fetches people without their departments/roles expanded, so UI does extra joins. | Offer `/people/list?include=departments,roles,skills` payload that piggybacks metadata and hashed lookups; cache metadata globally so People, Assignments, and Departments reuse it. | Owner TBD – Phase 3 discovery (Not started). |
| PersonForm (`frontend/src/pages/People/PersonForm.tsx`) | Similar bootstrap to PeopleList plus `peopleApi.get`, `peopleApi.create/update` | Form loads roles/departments independently from list page, causing duplicate hits. | Share the same `/people/form-bootstrap` response (or reuse PeopleList aggregated data) with memoization keyed by department/role versions. | Owner TBD – Phase 3 discovery (Not started). |
| DepartmentsList (`frontend/src/pages/Departments/DepartmentsList.tsx`) | `departmentsApi.list`, `.create`, `.update`, `.delete`, `peopleApi.list` | Each CRUD action refetches the entire department list and people list; no shared cache with dashboards or settings. | Add `/departments/tree-with-meta` endpoint returning hierarchy, counts, and lightweight person summaries so create/update/delete can patch the cache instead of reloading everything. | Owner TBD – Phase 3 discovery (Not started). |
| Department Manager Dashboard (`frontend/src/pages/Departments/ManagerDashboard.tsx`) | `dashboardApi.getDashboard`, `departmentsApi.list`, `peopleApi.list` | Pulls the same dashboard payload as the main Dashboard page but filtered per department, causing duplicate expensive aggregates each time a manager switches departments. | Extend Dashboard bulk payload (see next section) to accept multiple department ids or return per-department summaries in one response, then share across Dashboard + Manager Dashboard. | Owner TBD – Phase 3 discovery (Not started). |
| SkillsDashboard (`frontend/src/pages/Skills/SkillsDashboard.tsx`) | `peopleApi.list`, `departmentsApi.list`, `skillTagsApi.list`, `personSkillsApi.list`, `skillTagsApi.create/delete` | Loads four endpoints serially before showing any data; duplicates skill tag + person skills fetches used in AssignmentForm. | Build `/skills/bootstrap` returning people metadata, department tree, skill tags, and person skill matrices; share with AssignmentForm + People workflows to keep caches aligned. | Owner TBD – Phase 3 discovery (Not started). |

---

## Dashboard, Personal, Settings
| Page / Feature | Existing Calls | Pain Points | Bulk Proposal | Owner / Status |
| --- | --- | --- | --- | --- |
| Dashboard (`frontend/src/pages/Dashboard.tsx`) | `dashboardApi.getDashboard`, `departmentsApi.list`, `projectsApi.list`, `peopleApi.listAll`, `rolesApi.list`, `useCapacityHeatmap`, `useDeliverablesCalendar`, `useUtilizationScheme` | Multiple `useAuthenticatedEffect` blocks refetch overlapping datasets (departments, people metadata, project summaries) at mount; analytics cards, heatmap, and calendar each trigger their own requests. | Define `/dashboard/bootstrap` that returns analytics cards, department list, project counts, people metadata, role catalog, and heatmap scaffolding keyed by `weeksPeriod` + department filter so all dashboard widgets hydrate from one source. | Owner TBD – Phase 4 discovery (Not started). |
| PersonalDashboard (`frontend/src/pages/Personal/PersonalDashboard.tsx`) | `usePersonalWork` (personal/work endpoint), widgets (`UpcomingPreDeliverablesWidget`, `PersonalCalendarWidget`) trigger their own fetches | Widgets re-query deliverables and schedule even though `personal/work` already includes similar data; refreshing triggers multiple simultaneous calls. | Expand `personal/work` payload to include calendar slices, pre-deliverable previews, and schedule strips so widgets consume slices of the same cache and expose invalidation hooks to other pages (Assignments, Deliverables). | Owner TBD – Phase 4 discovery (Not started). |
| Settings (`frontend/src/pages/Settings/Settings.tsx` + sections) | `useCapabilities`, per-section `settingsSections[X]` hitting `rolesApi`, `departmentsApi`, `integrationsApi`, etc. | Each settings section loads independently; visiting the page can fire 5–8 network calls even before interacting with subsections. | Add `/settings/bootstrap` scoped by capabilities to deliver roles, departments, integrations config, and admin lists in one go. Section components read from shared context instead of firing their own requests. | Owner TBD – Phase 4 discovery (Not started). |

---

## Reports & Analytics
| Page / Feature | Existing Calls | Pain Points | Bulk Proposal | Owner / Status |
| --- | --- | --- | --- | --- |
| TeamForecast (`frontend/src/pages/Reports/TeamForecast.tsx`) | `peopleApi.workloadForecast`, `projectsApi.list`, `departmentsApi.list`, `assignmentsApi.list`, `deliverablesApi.list` (per selected project) | Report recomputes the same workload aggregates as Dashboard + Assignments, then issues extra assignments/deliverables queries whenever a project is selected. | Share the proposed `/dashboard/bootstrap` payload with forecast data, or add `/reports/team-forecast?include=projects` returning project summaries + deliverables to avoid manual fan-out. | Owner TBD – Phase 4 discovery (Not started). |
| PersonExperience (`frontend/src/pages/Reports/PersonExperience.tsx`) | `usePeopleAutocomplete` (peopleApi.search), `usePersonExperienceProfile`, `usePersonProjectTimeline` (experienceApi) | Selecting a person launches multiple experience queries plus autocomplete search; duplication with People list search and assignments history. | Extend `/people/list` aggregated payload with lightweight experience indexes or add `/experience/person/bootstrap` returning autocomplete matches + profile/timeline stubs in one call. | Owner TBD – Phase 4 discovery (Not started). |
| RoleCapacity Report (`frontend/src/pages/Reports/RoleCapacity.tsx` via `RoleCapacityCard`) | `RoleCapacityCard` pulls from the same analytics endpoints as Dashboard role card | Report simply re-embeds the card, causing another request even if Dashboard already loaded it. | Cache role capacity data inside `/dashboard/bootstrap` and let the report consume the cached response when available, falling back to a dedicated `/reports/role-capacity` aggregator otherwise. | Owner TBD – Phase 4 discovery (Not started). |

---

## Auth & Miscellaneous
| Page / Feature | Existing Calls | Pain Points | Bulk Proposal | Owner / Status |
| --- | --- | --- | --- | --- |
| Auth Pages (`frontend/src/pages/Auth/Login.tsx`, `ResetPassword.tsx`, `SetPassword.tsx`) | `authApi.login`, `authApi.reset`, `authApi.setPassword`; each fetches capabilities after login via `useCapabilities` and `useAuth` bootstrap | After login, app immediately fires department, capability, and settings queries; no shared bootstrap payload to hydrate layout. | After authentication, call `/session/bootstrap` returning user profile, capabilities, department tree, and feature flags so the initial route renders without extra API bursts. | Owner TBD – Phase 4 discovery (Not started). |

---

## Next Updates
- Phase 0 owners: confirm backend feasibility for Assignments + Dashboard aggregators.
- Phase 1 kickoff: fill in metrics (call counts, payload sizes) for Assignments rows and mark priority order.
- Keep this tracker in sync with `API_Call_Audit_Plan.md` after each phase concludes.
