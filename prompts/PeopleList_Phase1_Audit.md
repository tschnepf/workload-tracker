# People List – Phase 1 Split Layout Audit

## Overview
- `frontend/src/pages/People/PeopleList.tsx` renders the dual-pane view (list on the left, details on the right) inside the global `Layout`.citefrontend/src/pages/People/PeopleList.tsx:1-205
- Data dependencies flow through hooks that already enforce authentication (`useAuthenticatedEffect`, `useDepartmentFilter`) and are tied to backend pagination/contracts via `usePeopleQueryPagination`, `usePersonSelection`, and `useUpdatePerson`. Any responsive refactor has to keep those hooks intact so cursor/page state survives view swaps.citefrontend/src/pages/People/PeopleList.tsx:13-73

## Two-Pane Structure
- **PeopleListPane (left)** receives filtered/sorted arrays, bulk-mode state, and pagination callbacks (`hasNextPage`, `fetchNextPage`). It assumes infinite scroll semantics: when `onLoadMore` fires it expects `usePeopleQueryPagination` to append pages while keeping `people` stable. Mobile stacks/drawers cannot reset the hook or the selection index mid-scroll without rehydrating from `usePeopleQueryPagination`.citefrontend/src/pages/People/PeopleList.tsx:206-326
- **PersonDetailsContainer (right)** expects to be mounted whenever `selectedPerson` is truthy; the auto-select effect (`useEffect` around line 170) primes index `0`. Responsive layouts must preserve that effect or manually seed selection so details never open empty.citefrontend/src/pages/People/PeopleList.tsx:152-205
- **FiltersPanel + BulkActionsBar** sit inside the left pane header. Both depend on shared state in `PeopleList` (search term, department/location filter arrays, `bulkMode`, `selectedPeopleIds`). Any drawer/sheet needs to keep these states co-located or lift them into a controller so bulk updates still reference the same `Set`.citefrontend/src/pages/People/PeopleList.tsx:76-144

## Pagination + Selection Risks
- `usePeopleQueryPagination(showInactive)` encapsulates backend paging, including `hasNextPage` booleans. If the UI collapses into cards or accordions, ensure virtualization or infinite scroll still calls `fetchNextPage()` with the same cadence; otherwise list exhaustion will stall bulk operations.citefrontend/src/pages/People/PeopleList.tsx:48-74
- `usePersonSelection(people)` tracks both `selectedPerson` and `selectedIndex`. The keyboard handler passed to `PeopleListPane` assumes synchronous arrays; slicing/reordering for mobile must update `onRowClick`/`selectByIndex` so indexes map back to the original dataset.citefrontend/src/pages/People/PeopleList.tsx:41-148

## Bulk Actions + Department Sync
- Bulk updates call `useUpdatePerson().mutateAsync` per ID, then reload department metadata to refresh filter lists. A mobile-first flow must keep the async loop plus toast feedback; batching in a background thread without showing `showToast` would hide confirmation.citefrontend/src/pages/People/PeopleList.tsx:100-149
- Global department filter drives default list filtering; the effect mirrors `deptState.selectedDepartmentId` into `departmentFilter`. Any separate filter UI has to keep that linkage or risk mismatched query params vs. UI.citefrontend/src/pages/People/PeopleList.tsx:120-148

## Identified Pitfalls
1. **State Fragmentation:** Moving filters/bulk actions into drawers without sharing the same `useState` instances will desync the list and BulkActionsBar.
2. **Pagination Reset:** Switching between desktop split view and mobile stack must not remount `PeopleListPane`; otherwise infinite scroll restarts at page 1.
3. **Selection Consistency:** Auto-select effect assumes `filteredAndSortedPeople` changes infrequently; mobile presenters must debounce resorting to avoid thrashing `selectedPerson`.
4. **Department Mirror:** Respect the `useDepartmentFilter` bridge so global selections stay authoritative even when mobile hides the full filter UI.

These constraints should guide Phase 2 responsive changes so backend contracts remain untouched.

