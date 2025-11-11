# Assignments Page: Active/Hours Filter Contract

## Purpose
Add an opt-in filter on the Assignments page to only show projects that are either marked active or have any hours assigned.

## Filter Name
**"Projects: Active or with hours"** (short label acceptable in UI)

## Semantic Definition

A project **passes the filter** if any of the following conditions are true:

1. **Active by flag**: `project.isActive === true`
2. **Active by status**: `project.status` in `{active, active_ca}`  
3. **Has assigned hours**: Sum of all assignments' `weeklyHours` for that project > 0

### Filter Logic (Frontend Implementation)
```typescript
// Project qualifies if:
const projectQualifies = (project: Project, totalHours: number): boolean => {
  return project.isActive === true ||
         ['active', 'active_ca'].includes(project.status?.toLowerCase() || '') ||
         totalHours > 0;
};
```

## Scope of Application

### Primary Application
- **Project search dropdown** when adding a new assignment
  - Must hide projects that don't pass the filter
  - Only applies when filter is enabled

### Secondary Application (Optional)
- **Rendered assignment rows** in the grid
  - Hide assignments for projects that don't pass AND have zero hours
  - Reduces visual clutter
  - Preserves assignments with hours even if project doesn't qualify

## State Management

### Persistence
- **localStorage key**: `assignments.onlyActiveOrWithHours`
- **Values**: `"1"` (enabled) | `"0"` (disabled)
- **Default**: `"0"` (filter disabled by default)

### UI State
- Boolean state variable: `onlyActiveOrWithHours`
- Checkbox control in assignments header
- Right-aligned near existing counts/controls

## Interoperability

### Global Department Filter Integration
- Operates on **already department-filtered data** in memory
- Department filter runs first, Active/Hours filter processes the results
- No conflict between the two filters
- Both can be active simultaneously

### Filter Interaction Policy
- **Department filter OFF + Active/Hours ON**: Shows active/hours projects from all departments
- **Department filter ON + Active/Hours ON**: Shows active/hours projects from selected departments only
- **Both filters OFF**: Shows all projects
- **Department changes**: Triggers recomputation of allowed project sets

## Data Requirements

### Required Data Structures
- `projectsData`: Array of project objects with `id`, `isActive`, `status` properties
- `assignmentsData`: Array of assignment objects with `project` ID and `weeklyHours` 

### Computed Data Sets
- `projectHoursSum`: Map<project_id, total_hours>
- `projectsWithHours`: Set<project_id> where total > 0
- `activeProjectIds`: Set<project_id> where active by flag/status
- `allowedProjectIds`: Union of projectsWithHours and activeProjectIds

## Error Handling

### Null/Undefined Safety
- Handle missing/null project references in assignments
- Handle malformed `weeklyHours` values (strings, null, undefined)
- Handle missing project properties (`isActive`, `status`)
- Graceful fallbacks on computation errors

### Fallback Behavior
- **On filter computation error**: Show all projects (fail-safe)
- **On missing data**: Empty result sets, filter effectively disabled
- **On invalid hours**: Treat as 0 hours

## Accessibility

### UI Requirements  
- Checkbox properly labeled with `htmlFor` association
- Keyboard accessible
- Screen reader friendly
- State changes announced (via existing toast or polite text)

### UX Considerations
- Optional inline hint when search yields 0 results due to filter
- Clear indication when filter is active
- Totals reflect filtered view when enabled

## Implementation Notes

### Performance
- Memoized computation tied to data array changes
- Error boundaries around all computed sets  
- No additional network requests required
- Reuses existing API endpoints

### Testing Requirements
- Manual QA scenarios (see R2-REBUILD-ASSIGNMENTS-ACTIVE-OR-WITH-HOURS-QA.md)
- Integration testing with department filter
- Error resilience testing with malformed data

---

**Created**: 2025-09-02  
**Status**: Draft - Ready for Implementation