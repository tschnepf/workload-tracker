# Project Assignments Page Implementation Plan

## Overview
Create a new "Project Assignments" page that is the inverse of the current assignments page. Instead of listing people with their assigned projects, this new page will list projects with the people assigned to each project. The page should maintain identical functionality including the click-drag multi-week assignment capabilities, editing, and filtering.

## Current Architecture Analysis

### Current Assignments Page Structure
- **AssignmentGrid.tsx**: Main grid component with person-centric view
- **AssignmentList.tsx**: Simple table view of assignments
- **AssignmentForm.tsx**: Form for creating/editing individual assignments
- **Backend API**: `/assignments/` endpoints with grid snapshot support
- **Data Flow**: Person → Assignments → Projects (with weekly hours)

### Key Features to Replicate
1. Grid view with drag-to-select multiple weeks
2. Inline editing of weekly hours
3. Project status management with dropdown
4. Department filtering
5. Real-time conflict detection
6. Bulk operations
7. Grid snapshot optimization for performance

## Implementation Phases

---

## Phase 1: Backend Infrastructure

### Step 1.1: Create Project-Centric API Endpoint
**Prompt for AI Agent:**
```
Create a new API endpoint in backend/assignments/views.py that provides project-centric assignment data. Add a new action method `by_project` to the AssignmentViewSet class that:

1. Returns assignments grouped by project instead of by person
2. Uses the same filtering parameters as existing endpoints (department, include_children)
3. Applies the same ordering logic: client name ascending, then project name ascending
4. Includes all necessary fields: project info, assigned people, weekly hours
5. Supports the same performance optimizations (select_related, prefetch_related)
6. Include proper OpenAPI schema documentation with @extend_schema decorator

The response should be structured as:
```json
{
  "results": [
    {
      "projectId": 1,
      "projectName": "Project Alpha",
      "client": "Client ABC",
      "status": "active",
      "assignments": [
        {
          "id": 123,
          "person": 45,
          "personName": "John Doe",
          "weeklyHours": {"2024-01-01": 20, "2024-01-08": 15},
          // ... other assignment fields
        }
      ]
    }
  ]
}
```

Ensure the endpoint follows the same patterns as existing assignment endpoints for consistency.
```

### Step 1.2: Create Project-Centric Grid Snapshot Endpoint
**Prompt for AI Agent:**
```
Create a new action method `project_grid_snapshot` in the AssignmentViewSet that provides optimized project-centric data for grid rendering. This should mirror the existing `grid_snapshot` endpoint but organize data by projects instead of people.

Requirements:
1. Accept same parameters: weeks, department, include_children
2. Return structure:
```json
{
  "weekKeys": ["2024-01-01", "2024-01-08", ...],
  "projects": [
    {
      "id": 1,
      "name": "Project Alpha",
      "client": "Client ABC",
      "status": "active"
    }
  ],
  "assignmentsByProject": {
    "1": [
      {
        "id": 123,
        "personId": 45,
        "personName": "John Doe",
        "weeklyHours": {"2024-01-01": 20}
      }
    ]
  }
}
```

3. Include the same performance optimizations: caching, ETag support, conditional requests
4. Use similar single-flight locks to prevent cache stampedes
5. Add throttling with existing GridSnapshotThrottle class
6. Include proper error handling and fallback logic

Follow the exact same patterns as the existing grid_snapshot method for consistency.
```

### Step 1.3: Extend Assignment API for Project Operations
**Prompt for AI Agent:**
```
Extend the existing AssignmentViewSet in backend/assignments/views.py to support project-centric operations:

1. Add a new action method `bulk_create_for_project` that allows creating multiple assignments for a single project:
   - Accept array of person IDs and default weekly hours template
   - Validate that people don't have conflicting assignments
   - Use database transactions for atomicity
   - Return created assignment IDs and any validation errors

2. Add a new action method `bulk_remove_from_project` that removes all assignments for a project:
   - Accept project ID parameter
   - Soft delete (set is_active=False) rather than hard delete
   - Include confirmation safeguards
   - Log the operation for audit trail

3. Ensure all new endpoints follow existing patterns:
   - Use proper serializers for validation
   - Include OpenAPI documentation
   - Apply appropriate throttling
   - Handle department filtering consistently
   - Return appropriate HTTP status codes

The endpoints should integrate seamlessly with the existing assignment management system.
```

---

## Phase 2: Frontend Core Components

### Step 2.1: Create Project Assignment Grid Component
**Prompt for AI Agent:**
```
Create a new React component `frontend/src/pages/Assignments/ProjectAssignmentGrid.tsx` that mirrors the existing AssignmentGrid.tsx but with a project-centric layout.

Requirements:
1. Copy the core structure from AssignmentGrid.tsx but reorganize for projects
2. Use the same dark theme styling patterns with exact VSCode colors:
   - Background: '#1e1e1e'
   - Cards: 'bg-[#2d2d30] border-[#3e3e42]'
   - Primary text: 'text-[#cccccc]'
   - Secondary text: 'text-[#969696]'
   - Primary button: 'bg-[#007acc]'

3. Layout structure should be:
   - Project rows (expandable) showing project name, client, status
   - Assignment sub-rows showing assigned people with weekly hours
   - Same 12-week column header with resizable columns
   - Same weekly hours editing with click-drag selection

4. Reuse existing components where possible:
   - StatusBadge and StatusDropdown for project status
   - Same cell editing logic and validation
   - Same utilization calculations and styling
   - GlobalDepartmentFilter integration

5. Implement the same keyboard navigation and accessibility features
6. Include the same performance optimizations (React.memo for rows)
7. Use identical state management patterns for editing, selection, etc.

The component should feel like a natural inverse of the existing AssignmentGrid.
```

### Step 2.2: Create Project Assignment Services
**Prompt for AI Agent:**
```
Extend the existing frontend/src/services/api.ts file to add project-centric assignment API methods:

1. Add new methods to the assignmentsApi object:
   - `byProject()`: Get assignments grouped by project with same filtering options
   - `getProjectGridSnapshot()`: Get optimized project-centric grid data
   - `getProjectGridSnapshotAsync()`: Async version for large datasets
   - `bulkCreateForProject()`: Create multiple assignments for a project
   - `bulkRemoveFromProject()`: Remove all assignments from a project

2. Follow the exact same patterns as existing API methods:
   - Use the same error handling with friendlyErrorMessage()
   - Include the same caching strategies with cache keys
   - Apply the same ETag/conditional request logic
   - Use the same TypeScript interfaces where applicable

3. Ensure the new methods integrate with existing apiClient and authHeaders()
4. Include proper JSDoc comments for all new methods
5. Add appropriate TypeScript types for request/response shapes

The new API methods should be indistinguishable from existing ones in terms of patterns and reliability.
```

### Step 2.3: Create Project Assignment Hooks
**Prompt for AI Agent:**
```
Create custom React hooks for the project assignment functionality in new files under frontend/src/hooks/:

1. `useProjectAssignments.ts`: Hook for managing project-centric assignment data
   - Integrate with React Query for caching and synchronization
   - Support department filtering using existing useDepartmentFilter hook
   - Include optimistic updates for assignment changes
   - Handle loading states and error conditions

2. `useProjectGridData.ts`: Hook for optimized grid data fetching
   - Use grid snapshot API for performance
   - Implement same snapshot/legacy fallback pattern as existing grid
   - Support async job polling for large datasets
   - Include ETag-based revalidation

3. Follow the exact same patterns as existing hooks:
   - Use same query keys structure for cache invalidation
   - Apply same error handling and retry logic
   - Include same TypeScript typing patterns
   - Use same React Query options (staleTime, refetchInterval, etc.)

4. Ensure hooks integrate seamlessly with existing state management
5. Include proper dependency arrays and cleanup logic
6. Add comprehensive JSDoc documentation

The hooks should provide the same level of functionality and reliability as existing assignment hooks.
```

---

## Phase 3: User Interface Integration

### Step 3.1: Add Navigation and Routing
**Prompt for AI Agent:**
```
Add the new Project Assignments page to the application routing and navigation:

1. Update frontend/src/App.tsx:
   - Add lazy-loaded import for ProjectAssignmentGrid
   - Add new route `/assignments/by-project` for the project view
   - Ensure proper RequireAuth wrapper and error boundaries

2. Update frontend/src/components/layout/Navigation.tsx:
   - Add navigation link to the new project assignments page
   - Use appropriate icon and label ("Project Assignments" or "By Project")
   - Position it logically near existing assignment links
   - Maintain existing VSCode dark theme styling

3. Update the assignments index page (frontend/src/pages/Assignments/index.tsx):
   - Export the new ProjectAssignmentGrid component
   - Ensure proper naming convention consistency

4. Consider adding a toggle or tab system to switch between views:
   - Add buttons to switch between "By Person" and "By Project" views
   - Preserve current URL patterns and deep linking
   - Maintain user's current filters and selections when switching

Follow the exact same patterns as existing navigation and routing for consistency.
```

### Step 3.2: Implement Assignment Management Features
**Prompt for AI Agent:**
```
Implement the core assignment management features in the ProjectAssignmentGrid component:

1. Project Expansion/Collapse:
   - Click project row to expand/collapse assignment list
   - Show loading state while fetching project assignments
   - Use same visual indicators as person expansion in current grid

2. Add Person to Project:
   - Add "+" button in project row similar to current grid
   - Implement person search dropdown with skill matching
   - Validate capacity conflicts before assignment creation
   - Show success/warning toasts for assignment results

3. Remove Assignment:
   - Add remove button for each assignment row
   - Include confirmation dialog with project and person context
   - Handle optimistic updates with rollback on error

4. Weekly Hours Editing:
   - Implement same click-to-edit and drag-selection functionality
   - Use identical input validation and sanitization
   - Support bulk editing across multiple weeks
   - Include same keyboard navigation (arrows, tab, enter)

5. Project Status Management:
   - Integrate StatusBadge and StatusDropdown components
   - Use same optimistic updates with rollback
   - Emit status change events for cross-component sync

All features should match the existing assignment grid functionality exactly.
```

### Step 3.3: Add Filtering and Search Capabilities
**Prompt for AI Agent:**
```
Implement filtering and search functionality for the project assignments view:

1. Department Filtering:
   - Integrate existing GlobalDepartmentFilter component
   - Filter projects based on people's departments in assignments
   - Support include_children option for hierarchical filtering
   - Show filtered state in UI with same patterns as existing grid

2. Project Status Filtering:
   - Reuse existing multi-select status filter from AssignmentGrid
   - Apply same filter options: active, active_ca, on_hold, completed, etc.
   - Include "Active - No Deliverables" special case
   - Use identical toggle button styling and behavior

3. Project Search:
   - Add search input for project name, client, or project number
   - Implement real-time search with debouncing
   - Highlight matching text in search results
   - Support keyboard navigation through results

4. People Search within Projects:
   - Add search/filter for people names within expanded projects
   - Support skill-based filtering integration
   - Include availability indicators and capacity warnings

5. Persistence:
   - Save filter state to URL query parameters
   - Support deep linking with filters applied
   - Restore filter state on page reload

All filtering should follow the same patterns and UX as the existing assignment grid.
```

---

## Phase 4: Advanced Features and Optimization

### Step 4.1: Implement Drag and Drop Operations
**Prompt for AI Agent:**
```
Implement advanced drag-and-drop functionality for the project assignments grid:

1. Multi-Week Selection:
   - Implement same click-drag selection as existing grid
   - Support Shift+click for range selection
   - Visual feedback for selected cells with blue highlighting
   - Keyboard navigation with arrow keys

2. Bulk Hours Assignment:
   - Apply hours to multiple selected weeks at once
   - Show contiguous selection validation
   - Include confirmation for bulk changes
   - Support undo/redo functionality

3. Assignment Reordering:
   - Allow drag-and-drop to reorder people within projects
   - Maintain database sort order preference
   - Include visual drag indicators and drop zones

4. Cross-Project Assignment Moving:
   - Support dragging assignments between projects
   - Validate capacity and conflicts during move
   - Show warning dialogs for overallocation
   - Implement atomic transaction for assignment transfer

5. Performance Optimization:
   - Use React.memo for drag target components
   - Debounce drag events to prevent excessive re-renders
   - Implement virtual scrolling for large project lists

Follow the exact same interaction patterns as the existing assignment grid for consistency.
```

### Step 4.2: Add Data Export and Reporting
**Prompt for AI Agent:**
```
Add data export and reporting capabilities to the project assignments view:

1. Export Functionality:
   - Add export button to download project assignment data
   - Support CSV and Excel formats with proper formatting
   - Include filtered data only (respect current filters)
   - Generate filename with timestamp and filter context

2. Print View:
   - Create print-optimized layout for project assignments
   - Include company branding and report metadata
   - Support page breaks at logical project boundaries
   - Maintain data accuracy with current filter state

3. Project Utilization Reports:
   - Show project-level utilization summaries
   - Include weekly capacity vs. allocation charts
   - Highlight projects with over/under allocation
   - Support date range selection for historical analysis

4. Assignment Analytics:
   - Show assignment distribution across projects
   - Include average project team size metrics
   - Display most/least utilized projects
   - Support export of analytics data

5. Integration with Existing Reports:
   - Ensure compatibility with existing report infrastructure
   - Share common report templates and styling
   - Include project assignments in dashboard widgets

All export functionality should follow existing patterns and maintain data consistency.
```

### Step 4.3: Performance Optimization and Testing
**Prompt for AI Agent:**
```
Optimize performance and add comprehensive testing for the project assignments feature:

1. Performance Optimization:
   - Implement React.memo for all grid row components
   - Add useMemo for expensive calculations (utilization, filtering)
   - Use useCallback for event handlers to prevent re-renders
   - Implement virtual scrolling for large project lists (>100 projects)
   - Add intersection observer for lazy loading of assignment details

2. Caching Strategy:
   - Use React Query for server state management
   - Implement optimistic updates with rollback on error
   - Add ETag support for conditional requests
   - Cache project metadata separately from assignment data

3. Error Handling:
   - Add comprehensive error boundaries for each major component
   - Implement retry logic for failed API requests
   - Show user-friendly error messages with recovery options
   - Include fallback UI for network/server failures

4. Testing:
   - Add unit tests for all custom hooks using @testing-library/react-hooks
   - Create integration tests for grid interactions and API calls
   - Add accessibility tests with @testing-library/jest-dom
   - Include performance tests for large datasets

5. Documentation:
   - Add JSDoc comments for all public methods and components
   - Create user documentation for new features
   - Include development setup instructions
   - Document API endpoint changes and new parameters

Ensure all optimizations maintain feature parity with the existing assignment grid.
```

---

## Phase 5: Final Integration and Polish

### Step 5.1: Cross-Feature Integration
**Prompt for AI Agent:**
```
Integrate the project assignments page with existing application features:

1. Dashboard Integration:
   - Add project assignment metrics to dashboard widgets
   - Include project utilization in capacity heatmaps
   - Show project assignment trends in forecasting
   - Link dashboard items to filtered project assignment views

2. Project Page Integration:
   - Add "View Assignments" link from project detail pages
   - Deep link to project assignments view with project pre-selected
   - Include assignment summary in project cards/lists
   - Show assignment counts and utilization in project metadata

3. People Page Integration:
   - Add "View by Project" link from people assignment views
   - Maintain context when switching between person/project views
   - Preserve filters and selections across view changes

4. Search Integration:
   - Include project assignments in global search results
   - Support search by project name, person name, or skills
   - Add quick actions to jump to specific project assignments

5. Settings Integration:
   - Add user preferences for default view (person vs project)
   - Include column width and layout preferences
   - Support keyboard shortcuts and accessibility options

All integrations should maintain the existing user experience and performance standards.
```

### Step 5.2: User Experience Polish
**Prompt for AI Agent:**
```
Polish the user experience and add final enhancements to the project assignments feature:

1. Visual Polish:
   - Ensure pixel-perfect alignment with existing UI components
   - Add smooth animations for expand/collapse and loading states
   - Include hover states and focus indicators for accessibility
   - Verify consistent spacing and typography throughout

2. Responsive Design:
   - Ensure grid works on tablet and mobile devices
   - Implement horizontal scrolling for narrow screens
   - Add touch-friendly interactions for mobile users
   - Optimize column widths for different screen sizes

3. Accessibility Enhancements:
   - Add ARIA labels for all interactive elements
   - Include keyboard navigation for all features
   - Support screen readers with proper role attributes
   - Ensure sufficient color contrast for all text

4. User Feedback:
   - Add loading indicators for all async operations
   - Include progress bars for bulk operations
   - Show toast notifications for all user actions
   - Provide clear error messages with recovery suggestions

5. Help and Documentation:
   - Add contextual help tooltips for complex features
   - Include keyboard shortcut hints and help modal
   - Create onboarding tour for new users
   - Add link to full documentation

6. Final Testing:
   - Conduct accessibility audit with screen reader testing
   - Perform browser compatibility testing (Chrome, Firefox, Safari, Edge)
   - Test with large datasets to verify performance
   - Validate all features work with different permission levels

The final result should feel like a natural extension of the existing application.
```

---

## Implementation Guidelines

### Code Quality Standards
- **Naming Prevention**: Use consistent camelCase in frontend, snake_case in backend with automatic transformation
- **Dark Theme**: Use exact VSCode color scheme as specified in CLAUDE.md
- **Type Safety**: Maintain strict TypeScript typing throughout
- **Performance**: Follow React best practices with memo, callback, and useMemo optimizations
- **Testing**: Add comprehensive unit and integration tests
- **Documentation**: Include JSDoc comments and user documentation

### Architecture Principles
- **Reuse**: Leverage existing components, hooks, and utilities wherever possible
- **Consistency**: Match existing patterns for API design, state management, and UI interactions
- **Progressive Enhancement**: Ensure core functionality works even if advanced features fail
- **Backwards Compatibility**: Don't break existing assignment functionality
- **Separation of Concerns**: Keep business logic in services, UI logic in components

### Security Considerations
- **Authorization**: Respect existing permission levels for assignment management
- **Input Validation**: Sanitize all user inputs and validate on both client and server
- **Data Protection**: Follow existing patterns for handling sensitive assignment data
- **Audit Trail**: Log significant operations for compliance and debugging

---

## Success Criteria

The implementation will be considered successful when:

1. **Feature Parity**: Project assignments page provides identical functionality to person assignments page
2. **Performance**: Grid handles 1000+ projects with 5000+ assignments without performance degradation
3. **User Experience**: Users can switch between views seamlessly without losing context
4. **Integration**: All existing features (dashboard, reports, export) work with project view
5. **Quality**: Code passes all tests and maintains existing code quality standards
6. **Documentation**: Complete user and developer documentation is available

The new Project Assignments page should feel like it was part of the original application design, maintaining perfect consistency with existing patterns while providing the requested inverse functionality.