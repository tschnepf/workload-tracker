# QA Testing Guide: Assignments Active/Hours Filter

## Overview
This document provides comprehensive testing scenarios for the "Projects: Active or with hours" filter on the Assignments page, including dual-filter integration tests with the Global Department Filter.

## Basic Filter Functionality

### Test 1: Toggle Behavior
**Objective**: Verify basic toggle functionality and UI feedback

**Steps**:
1. Navigate to Assignments page (http://localhost:3000/assignments)
2. Locate "Projects: Active or with hours" checkbox in the header
3. Note initial state (should be unchecked by default)
4. Check the box
5. Uncheck the box
6. Refresh the page

**Expected Results**:
- Checkbox is accessible via mouse and keyboard
- State persists across page reloads
- No console errors during state changes
- Visual feedback shows current state clearly

### Test 2: Project Search Filtering
**Objective**: Verify filter applies to project search dropdown

**Setup**: Create test projects with different states:
- Project A: `isActive = true`, no assignments
- Project B: `isActive = false`, has 20h assignments  
- Project C: `isActive = false`, no assignments

**Steps**:
1. Click "+ Add Assignment" for any person
2. **Filter OFF**: Type partial project name
3. Note which projects appear in dropdown
4. Enable the Active/Hours filter  
5. **Filter ON**: Type same partial project name
6. Compare dropdown results

**Expected Results**:
- **Filter OFF**: All matching projects appear (A, B, C)
- **Filter ON**: Only projects A and B appear (Project C filtered out)

### Test 3: Assignment Row Visibility
**Objective**: Verify filter hides irrelevant assignment rows

**Setup**: Create assignments:
- Person 1 → Project A (active, 0 hours)
- Person 1 → Project B (inactive, 15 hours)  
- Person 1 → Project C (inactive, 0 hours)

**Steps**:
1. Expand Person 1's assignment rows
2. **Filter OFF**: Count visible assignment rows
3. Enable Active/Hours filter
4. **Filter ON**: Count visible assignment rows
5. Check person's weekly totals

**Expected Results**:
- **Filter OFF**: 3 assignment rows visible
- **Filter ON**: 2 assignment rows visible (Project C row hidden)
- Totals reflect only visible assignments when filtered

## Dual-Filter Integration Tests

### Test 4: Department + Active/Hours Filter Interaction
**Objective**: Verify both filters work together correctly

**Setup**: Create structure:
- Department Engineering: Person A, Person B
- Department Marketing: Person C  
- Project X (active): assigned to Person A (10h), Person C (5h)
- Project Y (inactive, 0h): assigned to Person B, Person C
- Project Z (inactive, 20h): assigned to Person A

**Steps**:
1. **Both filters OFF**: Note visible people and assignments
2. **Department ON (Engineering), Active/Hours OFF**: Note visible data
3. **Department OFF, Active/Hours ON**: Note visible data  
4. **Both filters ON**: Note visible data
5. Change Department filter to Marketing with Active/Hours ON

**Expected Results**:
1. **Both OFF**: All people, all assignments visible
2. **Dept ON only**: Person A, B visible; all their assignments shown
3. **Active/Hours ON only**: All people visible; Projects Y rows hidden
4. **Both ON**: Person A, B visible; Project Y rows hidden
5. **Marketing + Active/Hours**: Person C visible; Project Y row hidden

### Test 5: Filter State Independence
**Objective**: Verify filter state changes don't affect each other

**Steps**:
1. Enable Department filter (select Engineering)
2. Enable Active/Hours filter  
3. Change Department to Marketing (keep Active/Hours ON)
4. Disable Department filter (keep Active/Hours ON)
5. Disable Active/Hours filter

**Expected Results**:
- Each filter change triggers appropriate data recomputation
- No filter interferes with the other's state
- URL reflects Department filter changes only
- localStorage reflects Active/Hours filter changes only

## Error Resilience Testing

### Test 6: Malformed Assignment Data
**Objective**: Verify graceful handling of data inconsistencies

**Test Data** (simulate via browser dev tools):
```javascript
// In browser console, modify assignments data:
window.testMalformedData = () => {
  // Simulate assignments with null projects, invalid hours
  const malformed = [
    { id: 999, project: null, weeklyHours: { '2025-01-06': 'invalid' }},
    { id: 998, project: undefined, weeklyHours: null },
    { id: 997, project: 'string', weeklyHours: { '2025-01-06': 25 }}
  ];
  // Test how filter computation handles this data
};
```

**Steps**:
1. Enable Active/Hours filter
2. Simulate malformed data scenarios
3. Check console for error messages
4. Verify UI doesn't crash
5. Test project search still functions

**Expected Results**:
- No UI crashes or blank screens
- Console shows error messages with context
- Safe fallbacks preserve basic functionality
- Filter gracefully ignores malformed data

### Test 7: Empty Dataset Scenarios  
**Objective**: Verify filter works with edge cases

**Steps**:
1. Test with no projects in system
2. Test with no assignments in system
3. Test with projects but no active/hours projects
4. Enable/disable filter in each scenario

**Expected Results**:
- No console errors in empty data scenarios
- Appropriate empty state messages shown
- Filter toggle remains functional
- No infinite loading or crash states

## Performance and UX Testing

### Test 8: Large Dataset Performance
**Objective**: Verify filter performance with realistic data volumes

**Setup**: Load test data:
- 50+ people
- 100+ projects (mix of active/inactive)
- 500+ assignments with varied hours

**Steps**:
1. Navigate to Assignments page
2. Toggle Active/Hours filter multiple times
3. Expand/collapse person rows while filtered
4. Use project search while filtered

**Expected Results**:
- Filter toggle responds within 200ms
- No noticeable lag during filter changes
- Smooth scrolling and interactions
- Memory usage remains stable

### Test 9: Filter Feedback and Usability
**Objective**: Verify user experience quality

**Steps**:
1. Enable filter with no matching projects
2. Try project search with no results due to filter
3. Test keyboard navigation to filter checkbox
4. Test screen reader compatibility (if available)

**Expected Results**:
- Clear visual indication when filter is active
- Helpful feedback when search yields no results
- Accessible via keyboard (Tab, Space, Enter)
- Proper ARIA labels and announcements

## Persistence Testing

### Test 10: Cross-Session Persistence
**Objective**: Verify localStorage persistence works correctly

**Steps**:
1. Enable Active/Hours filter
2. Refresh page - verify state persists
3. Open new tab to same page - verify state persists
4. Close browser, reopen - verify state persists
5. Clear localStorage - verify defaults restore

**Expected Results**:
- Filter state persists across page refreshes
- Filter state persists across browser sessions
- Clearing storage resets to default (OFF)
- No conflicts with other localStorage data

## Regression Testing

### Test 11: Existing Functionality Preservation
**Objective**: Verify new filter doesn't break existing features

**Steps**:
1. Test all existing assignment operations:
   - Add new assignments
   - Edit assignment hours
   - Delete assignments
   - Multi-cell selection and editing
2. Test with filter ON and OFF for each operation
3. Verify Department filter still works independently

**Expected Results**:
- All existing assignment operations work normally
- Filter state doesn't interfere with data operations
- Person totals update correctly after edits
- No new bugs introduced in existing workflows

## Test Data Setup Script

For consistent testing, use this test data structure:

```javascript
// Recommended test projects
const testProjects = [
  { id: 1, name: 'Website Redesign', isActive: true, status: 'active' },
  { id: 2, name: 'Mobile App', isActive: false, status: 'active' },  
  { id: 3, name: 'Legacy System', isActive: false, status: 'inactive' },
  { id: 4, name: 'Research Project', isActive: true, status: 'inactive' }
];

// Recommended test assignments
const testAssignments = [
  { person: 1, project: 1, weeklyHours: { '2025-01-06': 20 }}, // Active + Hours
  { person: 1, project: 2, weeklyHours: { '2025-01-06': 0 }},  // Active + No Hours  
  { person: 1, project: 3, weeklyHours: { '2025-01-06': 10 }}, // Inactive + Hours
  { person: 1, project: 4, weeklyHours: { '2025-01-06': 0 }}   // Inactive + No Hours
];
```

## Success Criteria

**All tests must pass for filter to be considered ready for production:**

✅ **Basic functionality**: Toggle, persistence, UI feedback  
✅ **Filter behavior**: Project search and row filtering work correctly  
✅ **Dual-filter integration**: No conflicts with Department filter  
✅ **Error resilience**: Graceful handling of malformed data  
✅ **Performance**: Acceptable response times with large datasets  
✅ **Accessibility**: Keyboard navigation and screen reader support  
✅ **Regression**: No existing functionality broken  

**Test Environment**: http://localhost:3000/assignments  
**Last Updated**: 2025-09-02  
**Status**: Ready for Testing