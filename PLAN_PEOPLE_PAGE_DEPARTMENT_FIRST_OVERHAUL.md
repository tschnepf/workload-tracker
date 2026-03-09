# People Page Department-First Overhaul Plan

## Goal
Redesign `/people` into a department-first, multi-column workflow where:
- Left column is departments.
- People are always viewed in context of a selected department.
- Add person opens as a slide-over and defaults to the selected department.
- Search/filter controls are consolidated into a single-row toolbar.

## Current Baseline (as of March 8, 2026)
- `frontend/src/pages/People/PeopleList.tsx` is a two-panel layout (people list + person details).
- Add person uses route navigation to `'/people/new'` via `frontend/src/pages/People/PersonForm.tsx`.
- Filters are stacked vertically in `frontend/src/pages/People/list/components/FiltersPanel.tsx`.
- People list data is fetched with `usePeopleSearch` and supports department filters and ordering.

## UX Targets
1. Multi-column desktop layout:
- Column 1: Departments (required selection).
- Column 2: People in selected department.
- Column 3: Person details for selected person.

2. Department-first behavior:
- No people list shown until department is selected.
- View/add/remove actions operate on the selected department context.
- New person creation pre-selects selected department.

3. Add person slide-over:
- Replace `'/people/new'` navigation from People page with right-side drawer.
- Keep edit flow available (route-based or drawer-based; final decision in questions below).

4. Single-line search/filter toolbar:
- Replace stacked `FiltersPanel` controls with a horizontal, one-row toolbar.
- Keep existing search semantics (name/role/department/location/notes) unless changed intentionally.

## Proposed Information Architecture
- Desktop:
  - `DepartmentPane` (left, fixed width).
  - `PeoplePane` (middle, list + compact toolbar + actions).
  - `PersonDetailsPane` (right, existing `PersonDetailsContainer`).
- Mobile/tablet:
  - Keep existing mobile list/detail behavior initially.
  - Add-person slide-over still applies on mobile (full-width drawer).

## Data and State Model Changes
1. Introduce `selectedDepartmentId` as required primary state in `PeopleList`.
2. Query people with `department` bound to `selectedDepartmentId` (no local multi-select department filter for main flow).
3. Reset `selectedPerson` when department changes unless person still exists in current result set.
4. Add-person defaults:
- `PersonForm` accepts `initialDepartmentId` prop.
- On open from People page, pass `selectedDepartmentId` and set form department value immediately.

## Component Refactor Plan
### Phase 1: Page shell and department-first gating
- Update `frontend/src/pages/People/PeopleList.tsx`:
  - Replace 2-column layout with 3-column layout.
  - Add department column with selectable rows.
  - Gate middle/right panes when no department is selected.
- Add new component:
  - `frontend/src/pages/People/list/components/DepartmentPane.tsx`

### Phase 2: People pane toolbar consolidation
- Replace stacked `FiltersPanel` usage with one-line toolbar component.
- New component:
  - `frontend/src/pages/People/list/components/PeopleToolbar.tsx`
- Keep only controls that fit one line for default state (e.g., search + compact filter triggers/toggles).
- Move overflow controls into popover/menu if needed.

### Phase 3: Add-person slide-over
- Create `PersonFormDrawer` wrapper and reuse `PersonForm` logic.
- New component:
  - `frontend/src/pages/People/list/components/PersonFormDrawer.tsx`
- In `PeopleList`, `+ New` opens drawer instead of linking to `'/people/new'`.
- On save success:
  - Close drawer.
  - Refresh people query.
  - Auto-select newly created person.

### Phase 4: Route and compatibility cleanup
- Keep `'/people/new'` route for backward compatibility initially.
- Optionally migrate `'/people/new'` to render same form component in full page mode.
- Ensure existing edit route `'/people/:id/edit'` still works.

## Behavioral Rules to Implement
- `Add Person` button disabled until a department is selected.
- If no department selected:
  - Show empty state in people column: “Select a department to view people.”
  - Show empty state in details column.
- If selected department has zero people:
  - Show contextual empty state with enabled `Add Person` action.
- Remove person action should preserve current department selection and refresh list in place.

## API/Backend Impact
- No backend API changes required for initial delivery.
- Existing `peopleApi.searchList` supports department filter.
- Existing create payload already supports `department`.

## Testing Plan
1. Unit/component tests:
- Department selection drives people query.
- Add-person drawer receives selected department default.
- Toolbar renders in one-line layout at desktop breakpoints.

2. Integration tests:
- Select department -> people list updates.
- Create person from selected department -> appears in list with correct department.
- Change department -> selection resets correctly.

3. E2E (Playwright):
- Add new scenario under people suite validating department-first workflow and drawer create.

## Rollout Strategy
1. Land behind feature flag (recommended): `FF_PEOPLE_DEPARTMENT_FIRST_LAYOUT`.
2. Internal validation on desktop and mobile.
3. Remove old stacked filter UI after acceptance.

## Risks
- Existing global department filter (`useDepartmentFilter`) may conflict with local department-first state.
- Single-line toolbar can become cramped at intermediate widths.
- Drawer reuse of `PersonForm` may require prop-driven mode split to avoid route-only assumptions.

## Clarifications Needed Before Implementation
1. Department selection default:
- Should page auto-select first department on load, or require explicit user click every time?

2. Unassigned people:
- Should “No Department / Unassigned” appear as a department entry in the left column?

3. Department hierarchy:
- Should left column show flat department list or tree with parent/child nesting?

4. Add-person fields:
- Should department be locked/read-only in the drawer when launched from selected department, or editable before save?

5. Search scope:
- When a department is selected, should search stay within that department only (recommended), or support cross-department search?

6. Remove behavior:
- Does “remove” mean deactivate person, delete person, or remove department assignment only?

7. Mobile behavior:
- Should mobile also become department-first immediately, or keep current mobile flow for this phase?
