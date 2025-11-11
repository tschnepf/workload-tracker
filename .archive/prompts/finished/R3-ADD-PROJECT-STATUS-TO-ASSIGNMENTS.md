# Project Status Display and Editing in Assignments Page

## Overview
Add project status display and editing functionality to the Assignments page. Each assignment row should show the project's current status using the same oval-like styling as the Projects page, with clickable dropdown functionality to change the status.

## Implementation Plan

### Prompt 1 — Data Requirements and API Integration

**Objective**: Ensure assignment data includes project status information and add API method for updating project status.

**Requirements**:
- File: `frontend/src/pages/Assignments/AssignmentGrid.tsx`
- API: We do NOT rely on assignment-embedded project objects. Use `projectsApi.listAll()` and a local byId map to read `project.status` by `projectId`.
- Add API Method: Import `projectsApi.update` (or hook `useUpdateProject`) for status changes.
- Project Data: Ensure `projectsData` state includes all info for the status badge/dropdown and build a memoized `projectsById` map.
- Department scope: Decide and document whether project search and status display should be limited by the current Global Department Filter. If yes, filter `projectsData` to those referenced by the department-scoped `assignmentsData` (or use a department-aware projects endpoint when available).

**âš ï¸ Critical Pitfall Prevention**:
- **Error Boundaries**: Wrap status operations in React error boundaries to prevent cascade failures
- **Loading States**: Include loading/updating flags in the `projectsById` map structure
- **Type Safety**: Define clear TypeScript interfaces for all project status operations

**Implementation Steps**:
1. Keep assignment rows lean; do not inject full project objects per assignment. Instead, in `AssignmentGrid`, fetch `projectsData` and build an enhanced memoized map:
    ```typescript
    // Enhanced with loading states and type safety
    interface ProjectWithState extends Project {
      isUpdating?: boolean;
      lastUpdated?: number;
    }
    
    const projectsById = useMemo(() => {
       const m = new Map<number, ProjectWithState>();
       for (const p of projectsData || []) if (p?.id) m.set(p.id, { ...p, isUpdating: false });
       return m;
    }, [projectsData]);
    ```
2. Confirm `loadData()` fetches `projectsApi.listAll()` once; avoid N+1. Guard undefined loads to prevent flicker.
3. Import `projectsApi.update` or `useUpdateProject` for mutations.
4. Decide and document department scoping for project search when the Active/Hours toggle is ON; if limiting to department, intersect `projectsData` with projects present in `assignmentsData`.
5. Expose a **memoized** helper `getProjectStatus(projectId)` that reads from `projectsById` with null safety:
    ```typescript
    const getProjectStatus = useMemo(() => 
      (projectId: number) => projectsById.get(projectId)?.status ?? null
    , [projectsById]);
    ```

**Acceptance Criteria**:
- Assignment rows can read project status via `projectsById.get(assignment.project)` with guards
- API method available for updating project status  
- No performance regression in data loading
- TypeScript compilation passes

---

### Prompt 2 — Shared Status Utilities and Display Component

**Objective**: Add project status display to assignment rows using the existing Projects page styling.

**Requirements**:
- Prefer a single source of truth for status formatting/colors to avoid drift with Projects page.
- Create comprehensive shared status system:
  ```
  frontend/src/components/projects/
  â”œâ”€â”€ StatusBadge.tsx          // Display component with variant prop
  â”œâ”€â”€ StatusDropdown.tsx       // Reusable dropdown logic  
  â”œâ”€â”€ useProjectStatus.ts      // Custom hook for status operations
  â””â”€â”€ status.utils.ts          // Pure utility functions + theme constants
  ```
- **Enhanced StatusBadge**: Accept `variant` prop (`"display" | "editable"`) for different contexts
- **Theme Integration**: Extract color constants to theme file instead of inline switch statements
- In `AssignmentGrid.tsx`, import and reuse the shared utilities/badge. Match the exact oval-like styling used in Projects.

**Implementation Steps**:
1. Extract status helpers from `ProjectsList.tsx` into a shared module AND build a reusable `StatusBadge` component at `frontend/src/components/projects/StatusBadge.tsx` (or place helpers in `frontend/src/utils/status.ts`). Do not change behavior.
2. Refactor both pages to use the shared component/utilities:
   - Update `ProjectsList.tsx` to render `StatusBadge`.
   - Update `AssignmentGrid.tsx` to render `StatusBadge` next to the project name (reading status from `projectsById`).
3. Define `editableStatusOptions = ['active','active_ca','on_hold','completed','cancelled'] as const;` Keep any non-editable display states (e.g., `planning`) handled by `formatStatus` only.
4. Style: reuse the exact Tailwind classes from Projects (no new hard-coded hex values); ensure truncation doesnâ€™t crowd the project name.
5. Run a typecheck to confirm no regressions after refactor.

**Acceptance Criteria**:
- Status displays with correct colors matching Projects page (shared utilities)
- Oval-like visual styling matches Projects page design
- Status appears inline with project name without layout issues
- Text truncation works properly for long project names
- Both Projects and Assignments pages render status via the shared `StatusBadge` to avoid drift
- `npx tsc --noEmit` passes

---

### Prompt 3 — Dropdown Functionality (Single-Instance, Accessible)

**Objective**: Add clickable dropdown functionality for changing project status directly from assignment rows.

**Requirements**:
- File: `frontend/src/pages/Assignments/AssignmentGrid.tsx`  
- State: Maintain a single open dropdown per project, e.g. `openStatusProjectId: number | null` (not per-row) to avoid multiple open menus for the same project across rows.
- Click Handling: Toggle the dropdown for the clicked project.
- Outside Click: Use one document-level handler (or focus trap) to close; avoid per-row listeners.
- **Accessibility Enhancement**: Extract ARIA patterns into reusable hooks for consistency across components
- **Reusable Pattern**: Create `useDropdownManager<T>()` hook for any dropdown state management
- Update Logic: Implement status change with optimistic updates (see Prompt 4).

**ðŸŽ¯ Reusability Improvements**:
```typescript
// Create reusable dropdown manager hook
const useDropdownManager = <T extends string | number>(identifier: T) => {
  // Single source of truth for any dropdown state
  // Document click handling with proper cleanup
  // Keyboard navigation (Tab/Enter/Escape/Arrow)
  // ARIA management
}

// Extract ARIA patterns
const useDropdownAria = (isOpen: boolean, id: string) => {
  // Standardized ARIA attributes
  // Focus management
  // Screen reader announcements
}
```

**Implementation Steps**:
1. Add `const [openStatusProjectId, setOpenStatusProjectId] = useState<number | null>(null);`
2. Convert the badge to a button that opens the menu for its `projectId` and sets focus.
3. Render a single dropdown per open project, positioned next to the clicked badge; reuse Projects page styling.
4. Implement `handleStatusChange(projectId: number, newStatus: Project['status'])` (project-scoped, not assignment-scoped).
5. Add one document click handler (or a focus-out strategy) to close the menu when clicking outside; clean up on unmount.
6. Implement keyboard navigation and aria attributes for full accessibility.

**Dropdown Styling Requirements**:
- Match Projects page dropdown styling exactly
- Position dropdown relative to status button
- Use z-index to ensure dropdown appears above other elements
- Add hover states and transition animations
- Ensure dropdown fits within viewport bounds

**Acceptance Criteria**:
- Clicking status badge opens dropdown with available options
- Only one dropdown can be open at a time per project id
- Dropdown closes when clicking outside or selecting option  
- Visual styling matches Projects page dropdown exactly
- No layout shifts when dropdown opens/closes
- Keyboard accessible (Tab, Enter, Escape keys work)
- `npx tsc --noEmit` passes

---

### Prompt 4 â€” Status Update Logic and Optimistic UI

**Objective**: Implement the backend API integration and optimistic UI updates for status changes.

**Requirements**:
- File: `frontend/src/pages/Assignments/AssignmentGrid.tsx`
- **Type Safety Enhancement**: Use discriminated unions for status update states
- Optimistic Updates: Update `projectsData` and any derived UI immediately; close dropdown; disable interactions for that project while updating.
- Error Handling: Revert `projectsData` on failure and re-run derived computations; show toast.
- Data Synchronization: Update both `projectsData` (single source for status) and any per-row displays; ensure all rows referencing the project reflect the change.
- Loading States: Show a small spinner or disabled state in the menu while the mutation is in-flight.
- Caching: The API layer has a short-lived GET cache; don't rely on an immediate refetch for truth. Prefer optimistic update, then optional background refetch after cache TTL or with a cache-busting param.

**ðŸ›¡ï¸ Enhanced Type Safety**:
```typescript
// Discriminated unions for status update states
type StatusUpdateState = 
  | { type: 'idle' }
  | { type: 'updating'; previousStatus: Project['status']; projectId: number }
  | { type: 'success'; newStatus: Project['status']; projectId: number }
  | { type: 'error'; error: string; projectId: number; rollbackStatus: Project['status'] };

// Custom hook encapsulating all status operations
const useProjectStatus = () => {
  // Optimistic updates with proper error handling
  // Loading states management  
  // API deduplication
  // Exponential backoff for retries
}
```

**Implementation Steps**:
1. **Implement with Enhanced Safety**: `handleStatusChange(projectId, newStatus)` with optimistic update:
   - Use discriminated union state management for type safety
   - Save prev project object for revert with timestamp
   - Update `projectsData` in place for `projectId` and close the dropdown  
   - Trigger any derived recomputations (e.g., allowed set for Active/Hours â€” see Prompt 5)
   - Call `projectsApi.update({ id: projectId, data: { status: newStatus } })`
   - On success: optionally schedule a background refetch with cache-busting
   - On error: revert `projectsData`, recompute derived state, show error toast with retry option
2. **Prevent Race Conditions**: Implement proper locking mechanism for the same `projectId` (dedupe rapid clicks)
3. **Ensure Consistency**: All visible rows referencing the project re-render via `projectsById` with React.memo optimization
4. **Add Retry Logic**: Implement exponential backoff for failed status updates

**Error Recovery**:
- Revert UI changes if API call fails
- Show clear error message to user
- Maintain consistency between UI and server state
- Log errors appropriately for debugging
- Recompute any derived sets (e.g., allowed projects) after revert

**Acceptance Criteria**:
- Status changes appear immediately in UI (optimistic updates)
- API errors revert UI changes and show error message
- All assignment rows with same project update consistently
- No race conditions with multiple rapid status changes
- Loading indicators show during API calls

---

### Prompt 5 — Multi-Assignment Consistency and Data Integrity

**Objective**: Ensure consistent status display across all assignment rows for the same project and maintain data integrity.

**Requirements**:
- File: `frontend/src/pages/Assignments/AssignmentGrid.tsx`
- Consistency: Update all assignment rows when project status changes by relying on the shared `projectsById` source.
- Derived Filters: Recompute the Active/Hours `allowedProjectIds` whenever a project status changes (active â†” inactive) so the toggle reflects new eligibility.
- Data Sync: Keep `projectsData` authoritative; avoid duplicating project objects on assignments.
- Cache/Refetch: Avoid duplicate API calls for the same project; optionally refetch project or list with cache-busting when convenient, not for immediate correctness.
- UI Feedback: Show update progress for multiple affected rows referencing the same project.

**ðŸš€ Performance Optimizations**:
```typescript
// Memoized assignment row component to prevent unnecessary re-renders
const AssignmentRow = React.memo(({ assignment, projectsById }: {
  assignment: Assignment;
  projectsById: Map<number, ProjectWithState>;
}) => {
  // Component implementation
});

// Pub-sub pattern for cross-component status updates
const useProjectStatusSubscription = (projectId: number) => {
  // Subscribe to status changes for specific project
  // Update local state when project status changes elsewhere
}
```

**Implementation Steps**:
1. Read status from `projectsById` in row renderers so one change updates all rows instantly.
2. After optimistic update, ensure `computeAllowedProjects` depends on `projectsData` so it recomputes automatically; within it, use early-exit checks for hours instead of summing all weeks when only a boolean is needed.
3. Guard initial render: if `allowedProjectIds` is not computed yet, donâ€™t apply the Active/Hours filter until both `assignmentsData` and `projectsData` are present.
4. Debounce or lock status updates per `projectId` to prevent duplicate mutations.
5. Provide a subtle inline spinner/disabled state on the open menu while the update is in-flight.

**Consistency Requirements**:
- All assignment rows for same project show identical status
- Projects data array stays in sync with assignment project data
- Active/Hours filter recomputes when project status affects eligibility
- No duplicate API calls when same project has multiple assignments

**Acceptance Criteria**:
- Changing status on one assignment updates all assignments for that project
- Active/Hours filter immediately reflects status changes
- No data inconsistencies between assignments and projects
- Performance acceptable with large numbers of assignments
- UI clearly indicates when multiple rows are updating

---

### Prompt 6 — Testing, Polish and QA

**Objective**: Comprehensive testing, accessibility improvements, and final polish.

**Requirements**:
- **Testing**: Create comprehensive test scenarios for all functionality including automated visual regression tests
- **Accessibility**: Ensure full keyboard and screen reader support using extracted ARIA patterns
- **Performance**: Validate performance with large datasets and add performance benchmarks
- **Documentation**: Update QA documentation with new test scenarios

**ðŸ§ª Enhanced Testing Strategy**:
```typescript
// Integration tests for optimistic update flow
describe('Status Update Flow', () => {
  test('optimistic update with rollback on error', async () => {
    // Test discriminated union state transitions
    // Test error recovery and state consistency
    // Test derived state recomputation
  });
  
  test('visual regression for status styling consistency', async () => {
    // Compare Projects vs Assignments status displays
    // Test all status variants and colors
  });
  
  test('performance with 500+ assignments', async () => {
    // Benchmark render performance
    // Test memory usage with large datasets
    // Validate memoization effectiveness
  });
});

// Mock API scenarios for testing
const mockFailedStatusUpdate = {
  // Test optimistic update rollback
  // Test exponential backoff retry logic
  // Test error toast display
};
```

**Implementation Steps**:
1. Create test scenarios covering:
   - Status display with all status types and colors (shared utilities)
   - Dropdown functionality, single open menu behavior, and keyboard navigation
   - Optimistic updates, disabled menu state, deduped rapid clicks, and error recovery/rollback
   - Multi-assignment consistency via `projectsById` source of truth
   - Active/Hours integration: allowed set recomputes after status change, guard when data missing
   - Department filter interplay: if project search is dept-scoped, verify intersection logic; otherwise document global behavior
   - API cache considerations: ensure UI doesnâ€™t rely on immediate refetch; background refetch is optional
   - Edge cases (missing project data, invalid ids, network errors)

2. Accessibility improvements:
   - Proper ARIA labels for status buttons and dropdowns
   - Keyboard navigation (Tab, Enter, Escape, Arrow keys)
   - Screen reader announcements for status changes
   - Focus management when dropdowns open/close
   - High contrast support for status colors

3. Performance validation:
   - Test with large numbers of assignments (500+)
   - Measure render performance impact
   - Validate dropdown state management efficiency (single listener for outside click)
   - Check for memory leaks (ensure listeners are cleaned up)

4. Documentation updates:
   - Add test cases to `R2-REBUILD-ASSIGNMENTS-ACTIVE-OR-WITH-HOURS-QA.md`
   - Create user guide for new status editing functionality
   - Document API integration and error scenarios

**Acceptance Criteria**:
- All manual test scenarios pass successfully
- Full keyboard accessibility verified
- Performance acceptable with realistic data volumes  
- Screen reader compatibility confirmed
- Documentation updated with new functionality\n- Single close: close the dropdown from one place only (either within the dropdown component or via the optimistic callback) to avoid double-close flicker.\n- Single emit: emit the project status change event exactly once (e.g., in onOptimisticUpdate) to prevent duplicate updates.\n\n---

### Prompt 7 â€” Hours Editing and Bulk Entry Safeguards (Grid Integration)

**Objective**: Keep hours editing behaviors correct while adding status editing, and avoid regressions in the grid.

**Requirements**:
- Wire `saveEdit()` to call single/bulk updaters and keep `assignmentsData` in sync with `people`.
- Replace remaining `alert()` calls in the grid with `showToast` for non-blocking notifications.
- Add a contiguity guard for bulk selection and numeric parsing/clamping for hours.
\n**Notes — Source of Truth**:\n- Prefer a single source of truth for project state (React Query). If AssignmentGrid maintains local projectsData, keep it synchronized in optimistic, success, and rollback paths to avoid divergence.\n- Avoid duplicating project objects in assignments; rely on projectsById to read status by ID.\n\n**Implementation Steps**:
1. Save wiring and state sync:
   - In `AssignmentGrid.tsx`, update `saveEdit()`:
     - If selection size <= 1, call `updateAssignmentHours(personId, assignmentId, week, parsedHours)`.
     - If selection size > 1 (and passes contiguity/same-assignment checks), call `updateMultipleCells(selectedCells, parsedHours)`.
   - After successful API calls, update both `people` and `assignmentsData` for the affected assignment(s)/week(s) so `computeAllowedProjects` stays accurate.
   - On failure, rollback the local optimistic changes and show a toast.
2. Numeric parsing and clamping:
   - Treat empty input as 0; parse decimals; clamp negatives to 0.
   - Optionally clamp to a reasonable upper bound (e.g., 168h/week) to catch typos.
3. Contiguity guard for bulk apply:
   - Ensure all selected cells belong to the same `personId` and `assignmentId` and form a contiguous week range before calling the bulk updater.
   - If not contiguous or mixed rows, either constrain the selection or show a clear toast and skip bulk apply.
4. Replace blocking alerts:
   - Replace any remaining `alert()` calls within `AssignmentGrid.tsx` with `showToast` for consistent UX.

**Acceptance Criteria**:
- Single-cell edits persist and update person totals and derived Active/Hours filtering immediately.
- Multi-cell bulk entry applies only to contiguous week ranges in the same assignment; non-contiguous/mixed selections are prevented with a toast.
- `assignmentsData` mirrors changes applied to `people`; no divergence in derived filtering.
- No blocking alerts; toasts provide success/error feedback.

---

## Technical Implementation Notes

### Enhanced Shared Status System
Create a comprehensive, reusable status system to prevent drift between pages and enable future extensibility.

**Recommended Architecture**:
```
frontend/src/components/projects/
â”œâ”€â”€ StatusBadge.tsx          // Enhanced with variant="display|editable" prop
â”œâ”€â”€ StatusDropdown.tsx       // Reusable dropdown with ARIA patterns
â”œâ”€â”€ useProjectStatus.ts      // Hook encapsulating all status operations
â”œâ”€â”€ useDropdownManager.ts    // Generic dropdown state management
â”œâ”€â”€ useDropdownAria.ts       // Standardized ARIA patterns
â””â”€â”€ status.utils.ts          // Pure functions + theme constants
```

**Type Safety Enhancements**:
```typescript
// Discriminated unions for better error handling
type StatusUpdateState = 'idle' | 'updating' | 'success' | 'error';
type StatusVariant = 'display' | 'editable';

// Enhanced project interface with state
interface ProjectWithState extends Project {
  isUpdating?: boolean;
  updateState?: StatusUpdateState;
  lastUpdated?: number;
}
```

### Status Colors (from Projects page):
```typescript
const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'active': return 'text-emerald-400';
    case 'active_ca': return 'text-blue-400';
    case 'planning': return 'text-blue-400';
    case 'on_hold': return 'text-amber-400';
   case 'completed': return 'text-slate-400';
   case 'cancelled': return 'text-red-400';
   default: return 'text-slate-400';
  }
};
```

### Status Options:
```typescript
const editableStatusOptions = ['active', 'active_ca', 'on_hold', 'completed', 'cancelled'];
```

### Visual Design Requirements:
- Match exact styling from Projects page status dropdown
- Maintain oval-like appearance with `px-2 py-0.5 rounded text-xs`
- Use same color scheme and hover states
- Preserve assignment row height and spacing
- Ensure status display doesn't crowd project name

### Integration Points:
- Must work with existing Active/Hours filter (project status affects filter results)
- Should update `projectsData` state to maintain consistency
- Needs to handle assignment project references correctly
- Should integrate with existing toast notification system; replace any legacy `alert()` calls with toasts
- Projects and Assignments pages must both consume `StatusBadge`/shared helpers for consistency

### Data Sourcing and Derived Sets
- Build a memoized `projectsById` map from `projectsData` and read status by `assignment.project`.
- Recompute the Active/Hours `allowedProjectIds` when `projectsData` or `assignmentsData` change; use early-exit when checking if an assignment has any hours (> 0) to avoid summing all weeks when not needed.
- When hours are edited in the grid, update `assignmentsData` alongside `people` to keep `allowedProjectIds` and derived filters in sync.
- Guard initial render: do not apply the Active/Hours filter until both datasets are present.

### Department Scope Decision
- If you want project search to honor the current department filter when the toggle is ON, intersect `projectsData` with projects present in `assignmentsData` for the department. Otherwise, document that project search is global.

### Accessibility and Event Handling
- Use a single `openStatusProjectId` and one document-level outside-click handler (or a focus strategy) to close the menu; clean up listeners on unmount.
- Ensure the button/menu use proper aria roles/attrs and that focus returns to the trigger on close.

### Caching and Refetch
- The API layer employs a short-lived GET cache; do not assume an immediate refetch will show the new status. Prefer optimistic UI updates and an optional background refetch with cache-busting when needed.
- **Cache Strategy**: Implement cache-busting with timestamp or version parameters
- **Background Sync**: Schedule periodic background refetch to maintain data consistency

### Types and Styling
- Type `newStatus` as `Project['status']` for safety.
- Reuse Tailwind utility classes consistent with Projects; avoid new hex values outside existing palette/tokens.

---

## Quality Gates

Run these after each major prompt to keep things consistent:

1) Frontend typecheck with enhanced safety checks

```powershell
docker exec workload-tracker-frontend npx tsc --noEmit --strict
```

2) Backend tests (only if backend touched)

```powershell
docker exec workload-tracker-backend python manage.py test people assignments --noinput -v 2
```

3) **Enhanced Manual Testing**
- Verify status pills render identically on Projects and Assignments (visual regression)
- Test single status dropdown behavior with keyboard navigation
- Test optimistic update flow with network throttling
- Verify ARIA accessibility with screen reader
- Test error scenarios and rollback behavior
- Performance test with 500+ assignments

4) **Automated Testing** 
```powershell
# Run integration tests for status update flow
docker exec workload-tracker-frontend npm run test:status-updates

# Run visual regression tests
docker exec workload-tracker-frontend npm run test:visual-regression

# Run performance benchmarks  
docker exec workload-tracker-frontend npm run test:performance
```

---

**Created**: 2025-09-02  
**Status**: Ready for Implementation  
**Dependencies**: Existing Active/Hours filter implementation (R2-REBUILD-ASSIGNMENTS-ACTIVE-OR-WITH-HOURS-FILTER.md)











