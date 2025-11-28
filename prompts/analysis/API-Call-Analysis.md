API Call Analysis
=================

This document lists frontend pages and the backend API services they invoke via the shared `@/services/api` layer. Line numbers are approximate and should be treated as navigation hints rather than exact references.

## Assignments

### `Assignments/AssignmentForm.tsx`
- Uses: `assignmentsApi`, `departmentsApi`, `peopleApi`, `projectsApi`
  - `assignmentsApi`: create and update assignments (form submit).
  - `departmentsApi`: fetch departments for selection.
  - `peopleApi`: load people and related metadata.
  - `projectsApi`: fetch projects for assignment selection.

### `Assignments/AssignmentGrid.tsx`
- Uses: `assignmentsApi`, `deliverablesApi`, `peopleApi`, `projectsApi`
  - `assignmentsApi`: list, create, and update assignments; grid interactions and bulk updates.
  - `deliverablesApi`: fetch deliverables for assignment context.
  - `peopleApi`: load people for grid rows and filters.
  - `projectsApi`: fetch projects referenced in assignment rows.

### `Assignments/AssignmentList.tsx`
- Uses: `assignmentsApi`, `departmentsApi`, `peopleApi`
  - `assignmentsApi`: list and delete assignments.
  - `departmentsApi`: load departments for filters.
  - `peopleApi`: load people for filters and display.

### `Assignments/ProjectAssignmentsGrid.tsx`
- Uses: `assignmentsApi`, `deliverablesApi`, `peopleApi`, `projectAssignmentsApi`, `projectsApi`
  - `assignmentsApi`: list, create, update, bulk update, and delete assignments in the project grid.
  - `deliverablesApi`: fetch deliverables linked to projects.
  - `peopleApi`: autocomplete and selection of people for assignments.
  - `projectAssignmentsApi`: project-level assignment aggregation / utilities.
  - `projectsApi`: fetch projects, including project lists and details for the grid.

### `Assignments/grid/components/ProjectCell.tsx`
- Uses: `projectsApi`
  - `projectsApi`: ensure project details are loaded for assignment cells.

## Auth

### `Auth/ResetPassword.tsx`
- Uses: `authApi`
  - `authApi`: request password reset by email.

### `Auth/SetPassword.tsx`
- Uses: `authApi`
  - `authApi`: confirm password reset and set a new password.

## Dashboard

### `Dashboard.tsx`
- Uses: `dashboardApi`, `departmentsApi`, `peopleApi`, `projectsApi`
  - `dashboardApi`: fetch main dashboard aggregates and KPIs.
  - `departmentsApi`: load departments for filters and summaries.
  - `peopleApi`: load people for utilization and capacity summaries.
  - `projectsApi`: fetch project lists for dashboard cards.

## Deliverables

### `Deliverables/Calendar.tsx`
- Uses: `assignmentsApi`, `peopleApi`
  - `assignmentsApi`: load assignments per person for the calendar view.
  - `peopleApi`: autocomplete / selection of people to view on the calendar.

## Departments

### `Departments/DepartmentsList.tsx`
- Uses: `departmentsApi`, `peopleApi`
  - `departmentsApi`: list, create, update, and delete departments.
  - `peopleApi`: load people associated with departments.

### `Departments/HierarchyView.tsx`
- Uses: `departmentsApi`, `peopleApi`
  - `departmentsApi`: load department hierarchy.
  - `peopleApi`: load people to populate the hierarchy tree.

### `Departments/ManagerDashboard.tsx`
- Uses: `dashboardApi`, `departmentsApi`, `peopleApi`
  - `dashboardApi`: manager-focused dashboard metrics by department.
  - `departmentsApi`: load departments and manager relationships.
  - `peopleApi`: load department members for metrics.

### `Departments/ReportsView.tsx`
- Uses: `dashboardApi`, `departmentsApi`, `peopleApi`
  - `dashboardApi`: fetch reporting aggregates by department and timeframe.
  - `departmentsApi`: list departments for reporting filters.
  - `peopleApi`: load people for report breakdowns.

## People

### `People/PeopleList.tsx`
- Uses: `departmentsApi`
  - `departmentsApi`: load departments for people list filters.

### `People/PersonForm.tsx`
- Uses: `departmentsApi`, `peopleApi`
  - `departmentsApi`: fetch department options for the person form.
  - `peopleApi`: load and save person records.

## Profile

### `Profile/Profile.tsx`
- Uses: `authApi`, `peopleApi`
  - `authApi`: change password for the current user.
  - `peopleApi`: load the profile person record for the logged-in user.

## Projects

### `Projects/ProjectForm.tsx`
- Uses: `projectsApi`
  - `projectsApi`: fetch clients, load existing project data, and create/update projects.

### `Projects/ProjectsList.tsx`
- Uses: `assignmentsApi`
  - `assignmentsApi`: check assignment conflicts, update hours, update roles, and delete assignments from the project list UI.

### `Projects/list/components/ProjectDetailsPanel.tsx`
- Uses: `projectsApi`
  - `projectsApi`: fetch detailed project metadata and clients for the side panel.

## Reports

### `Reports/TeamForecast.tsx`
- Uses: `assignmentsApi`, `deliverablesApi`, `departmentsApi`, `peopleApi`, `projectsApi`
  - `assignmentsApi`: fetch assignments per project/department for forecasting.
  - `deliverablesApi`: fetch deliverables per project for forecasting context.
  - `departmentsApi`: list departments for team forecast scopes.
  - `peopleApi`: workload forecast and capacity data.
  - `projectsApi`: list projects for selection and filters.

## Settings

### `Settings/sections/AdminUsersSection.tsx`
- Uses: `authApi`, `peopleApi`
  - `authApi`: list, create, invite, update, and delete users; set roles and link people.
  - `peopleApi`: autocomplete people when linking user accounts.

### `Settings/sections/AuditLogSection.tsx`
- Uses: `authApi`
  - `authApi`: fetch admin audit log entries.

### `Settings/sections/IntegrationsSection.tsx`
- Uses: `integrationsApi`
  - `integrationsApi`: list providers, credentials, rules, and jobs for external integrations (e.g., BQE).

## Skills

### `Skills/SkillsDashboard.tsx`
- Uses: `departmentsApi`, `peopleApi`
  - `departmentsApi`: fetch departments for skills breakdowns.
  - `peopleApi`: fetch people and skills-related data for the dashboard.

