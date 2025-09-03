# Project Status QA Scenarios

## Manual Testing Checklist

### ✅ Status Badge Display
- [ ] Verify all status colors match VSCode theme (active=emerald, planning=blue, etc.)
- [ ] Test display variant shows status without interaction
- [ ] Test editable variant shows dropdown arrow and proper hover states
- [ ] Verify loading state shows spinner and disables interaction

### ✅ Status Dropdown Functionality
- [ ] Dropdown opens on badge click
- [ ] Only one dropdown open at a time (single-instance)
- [ ] Clicking outside closes dropdown
- [ ] Escape key closes dropdown
- [ ] Arrow keys navigate options
- [ ] Enter/Space selects option
- [ ] Current status is visually highlighted

### ✅ Status Updates
- [ ] Optimistic updates show immediately
- [ ] Loading states display during API calls
- [ ] Error states rollback optimistic changes
- [ ] Success updates persist across page refresh
- [ ] Multiple assignment rows with same project sync status changes

### ✅ Accessibility
- [ ] Screen reader announces status changes
- [ ] Keyboard navigation works throughout
- [ ] ARIA attributes are properly set
- [ ] Focus management is correct
- [ ] Color contrast meets WCAG standards

### ✅ Performance
- [ ] Large assignment lists (100+) remain responsive
- [ ] Status changes don't cause unnecessary re-renders
- [ ] Memory usage stable with multiple dropdowns
- [ ] No console warnings or errors

## ✅ Recent Fixes (2025-09-03)
- **Fixed page scroll/jump issue** when clicking status dropdown
  - Added `preventDefault()` and `stopPropagation()` to all click handlers
  - Implemented scroll behavior locking during dropdown interactions
  - Added `preventScroll: true` to focus management
  - Used CSS containment and hardware acceleration for better performance

### Specific Fixes Applied:
1. **StatusBadge.tsx**: Added event prevention in onClick handler
2. **StatusDropdown.tsx**: 
   - Added scroll behavior control during dropdown open
   - Enhanced focus management with `preventScroll`
   - Added CSS containment and GPU acceleration
   - Prevented default on all dropdown option clicks

## Known Issues
- Performance tests may show some React warnings (expected in test environment)  
- QueryClient provider needed for full integration tests
- Memoization thresholds may need adjustment based on actual usage