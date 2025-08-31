# Role Management System Implementation Plan

## Overview
Implement a comprehensive role management system that allows administrators to define, add, edit, and delete roles through the Settings page, replacing the current hardcoded role system.

## Current State Analysis
- **Backend**: `role = models.CharField(max_length=100, default='Engineer')` in Person model
- **Frontend**: Hardcoded `roleOptions` array with 17 predefined roles in PeopleList.tsx
- **Settings Page**: Currently unused - perfect place for role management
- **No CRUD operations**: No way to manage roles through UI

## Implementation Steps

### Phase 1: Backend Implementation

#### Step 1.1: Create Role Model
- [ ] Create `backend/roles/` Django app
- [ ] Define Role model with fields:
  - `name` (CharField, unique)
  - `description` (TextField, optional)
  - `is_active` (BooleanField, default=True)
  - `created_at`, `updated_at` (auto timestamps)
- [ ] Add proper model constraints and validation
- [ ] Configure admin interface for roles

#### Step 1.2: Create Role API Endpoints  
- [ ] Create RoleSerializer with naming prevention (camelCase) 
- [ ] **CRITICAL**: Include ALL frontend-needed fields in serializer (follow Serializer Field Completeness Rule)
- [ ] Implement CRUD ViewSets (list, create, retrieve, update, destroy)
- [ ] Add URL routing for `/api/roles/` (snake_case URLs)
- [ ] Add bulk operations endpoint (`/api/roles/?all=true`) for autocomplete
- [ ] **MANDATORY**: Restart backend container after serializer changes

#### Step 1.3: Direct Migration Strategy
- [ ] Create migration to add Role model
- [ ] Create basic default roles (Engineer, Manager, Designer, etc.)
- [ ] Update Person model to use ForeignKey to Role (replace CharField)
- [ ] Set default role for existing people (Engineer)
- [ ] Remove old role CharField in same migration

#### Step 1.4: Update Person API
- [ ] Update PersonSerializer to include role relationship 
- [ ] Add `roleName` field to API responses (for display) - **CRITICAL**: Must be in serializer fields list
- [ ] Follow Schema-API Alignment Checklist: model field → serializer field → frontend interface → UI display
- [ ] Ensure role updates work through person endpoints
- [ ] **MANDATORY**: Restart backend container after PersonSerializer changes
- [ ] Test person CRUD operations with new role relationship
- [ ] Verify full CRUD cycle: frontend save → backend store → frontend retrieve → display

### Phase 2: Frontend Implementation

#### Step 2.1: Create Role Management Types
- [ ] Add Role interface to `types/models.ts`
- [ ] Update Person interface to use role relationship
- [ ] Create API service methods in `services/api.ts`

#### Step 2.2: Implement Settings Page
- [ ] Create or update `src/pages/Settings/Settings.tsx`
- [ ] Add role management section to settings
- [ ] **CRITICAL**: Implement role list with clickable column headers (follow TABLE COLUMN SORTING STANDARDS)
- [ ] Add/edit/delete functionality with proper loading/error/success states
- [ ] Use consistent VSCode dark theme styling: `bg-[#2d2d30] border-[#3e3e42] text-[#cccccc]`

#### Step 2.3: Create Role Management Components
- [ ] `RoleList.tsx` - Display roles with clickable sortable headers and triangle indicators
- [ ] `RoleForm.tsx` - Add/edit role form with **CRITICAL** autocomplete name field (follows AUTOCOMPLETE STANDARDS)
- [ ] `RoleDeleteConfirm.tsx` - Confirmation dialog for deletion
- [ ] Implement proper error handling and loading states
- [ ] **NO separate sort dropdowns** - only clickable column headers allowed

#### Step 2.4: Update People Components
- [ ] Update PeopleList.tsx to fetch roles from API (`rolesApi.listAll()` for autocomplete)
- [ ] Replace hardcoded roleOptions with dynamic roles
- [ ] Update PersonForm.tsx role dropdown to **MANDATORY** autocomplete with keyboard navigation
- [ ] **CRITICAL**: Role field MUST implement full autocomplete (arrow keys, Enter, Escape, filtering)
- [ ] Preserve existing role column sorting functionality
- [ ] Test role column sorting with new data structure

### Phase 3: Integration & Setup

#### Step 3.1: Default Role Setup
- [ ] Create standard role set (Engineer, Senior Engineer, Manager, Designer, etc.)
- [ ] Assign default roles to existing people
- [ ] Ensure all people have valid role assignments

#### Step 3.2: Navigation Integration
- [ ] Add Settings link to main navigation/sidebar
- [ ] Ensure proper routing to Settings page
- [ ] Add breadcrumbs or back navigation as needed

#### Step 3.3: Permissions & Validation
- [ ] Add role name validation (required, unique, length limits)
- [ ] Implement proper error messages for duplicate names
- [ ] Consider access control for role management (admin-only?)

### Phase 4: Testing & Documentation

#### Step 4.1: Testing Scenarios - MANDATORY STANDARDS COMPLIANCE
- [ ] **Backend API Testing**:
  - [ ] Verify all API responses use camelCase (not snake_case)
  - [ ] Test container restart after serializer changes
  - [ ] Verify Schema-API Alignment: model → serializer → API → frontend
- [ ] **Role Management Settings Page**:
  - [ ] Test clickable column headers with triangle indicators
  - [ ] Verify NO separate sort dropdowns exist
  - [ ] Test role CRUD operations through Settings page
  - [ ] Test autocomplete with keyboard navigation (arrow keys, Enter, Escape)
- [ ] **People Integration**:
  - [ ] Test person role assignment/updates with autocomplete
  - [ ] Test role column sorting in people list still works
  - [ ] Test role deletion with existing person assignments
- [ ] **Migration & Data Integrity**:
  - [ ] Test direct migration from CharField to ForeignKey
  - [ ] Verify all people have valid role assignments
  - [ ] Test full CRUD cycle: frontend save → backend store → frontend retrieve → display

#### Step 4.2: Update Documentation
- [ ] Update R2-REBUILD-STANDARDS.md with role management patterns
- [ ] Document Settings page component standards
- [ ] Add testing checklist for role management features

## 🎯 STANDARDS COMPLIANCE REQUIREMENTS

### Critical Standards That Must Be Followed

#### Naming Convention Standards
- **Backend**: ALL snake_case (model fields, methods, URLs, variables)
- **Frontend**: ALL camelCase (variables, methods, properties)
- **API**: Transform at boundary (snake_case ↔ camelCase via serializers)

#### Serializer Field Completeness Rule
- **CRITICAL**: Every model field needed by frontend MUST be explicitly in serializer fields list
- **MANDATORY**: Container restart after ANY serializer changes
- Test full cycle: frontend → API → database → API → frontend

#### UI Component Standards  
- **TABLE SORTING**: All data tables MUST use clickable column headers with triangle indicators
- **AUTOCOMPLETE**: All text inputs that reuse existing data MUST have full keyboard navigation
- **VSCode THEME**: Use exact colors: `bg-[#2d2d30] border-[#3e3e42] text-[#cccccc]`

#### Zero Debt Tolerance
- **NO TODO comments** in final code
- **NO commented code** blocks  
- **NO temporary workarounds**
- **NO abstractions** until pattern repeats 3+ times

## Technical Implementation Details

### Backend Schema Changes
```python
# New Role model
class Role(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

# Updated Person model
class Person(models.Model):
    role = models.ForeignKey('roles.Role', on_delete=models.SET_NULL, null=True, blank=True)
    # Remove: role = models.CharField(max_length=100, default='Engineer')
```

### API Endpoints to Create
- `GET /api/roles/` - List all roles (paginated) - **snake_case URL**
- `GET /api/roles/?all=true` - List all roles (bulk) - **Required for autocomplete**
- `POST /api/roles/` - Create new role
- `GET /api/roles/{id}/` - Get specific role  
- `PATCH /api/roles/{id}/` - Update role
- `DELETE /api/roles/{id}/` - Delete role

### Required API Response Format (camelCase)
```json
{
  "id": 1,
  "name": "Senior Engineer",
  "description": "Senior level engineering role",
  "isActive": true,
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

### Frontend Components Structure  
```
src/pages/Settings/
├── Settings.tsx (main settings page)
├── components/
│   ├── RoleList.tsx (with SortableHeader components)
│   ├── RoleForm.tsx (with autocomplete name field)
│   └── RoleDeleteConfirm.tsx
└── hooks/
    └── useRoles.tsx (role data management)
```

### Required Frontend Standards Compliance
```typescript
// ✅ CORRECT - SortableHeader for role table  
<SortableHeader column="name">ROLE NAME</SortableHeader>
<SortableHeader column="description">DESCRIPTION</SortableHeader>

// ✅ CORRECT - Autocomplete role input
<input
  value={roleInputValue}
  onChange={(e) => {
    setRoleInputValue(e.target.value);
    setShowDropdown(e.target.value.length > 0 && filteredRoles.length > 0);
  }}
  onKeyDown={handleKeyDown} // Arrow keys, Enter, Escape
/>

// ✅ CORRECT - VSCode theme colors
className="bg-[#2d2d30] border-[#3e3e42] text-[#cccccc]"
```

## Migration Strategy

### Direct Migration Steps
1. **Create Role model**: Add Role table with basic roles
2. **Add default roles**: Insert standard roles (Engineer, Manager, Designer, etc.)
3. **Update Person model**: Replace CharField with ForeignKey in single migration
4. **Assign default roles**: Set all existing people to 'Engineer' role
5. **Complete migration**: Single atomic migration operation

## Risk Assessment

### Medium Risk Items
- **API Breaking Changes**: Person API responses will change structure
- **Frontend State Management**: Multiple components need role data
- **Direct Migration**: Single migration without rollback safety net

### Mitigation Strategies
- **Database Backup**: Take full backup before migration
- **Development Testing**: Test migration thoroughly in development
- **Comprehensive Testing**: Test all role-related functionality extensively

## Success Criteria

### Must Have Features
- [ ] Settings page with full role CRUD functionality
- [ ] All people assigned valid roles after migration
- [ ] Person role assignment works seamlessly
- [ ] Role column sorting still functions
- [ ] Role autocomplete in person forms

### Nice to Have Features
- [ ] Role usage analytics (show count of people per role)
- [ ] Role archiving instead of hard deletion
- [ ] Role templates or suggestions
- [ ] Bulk role assignment tools

## Estimated Timeline
- **Phase 1 (Backend)**: 1-2 hours
- **Phase 2 (Frontend)**: 3-4 hours  
- **Phase 3 (Integration)**: 1 hour
- **Phase 4 (Testing)**: 1 hour
- **Total**: 6-8 hours of development time

## Next Steps
1. Start with Phase 1.1 - Create Role model and Django app
2. Implement basic CRUD endpoints
3. Create simple Settings page role management
4. Test with existing person data
5. Gradually migrate from old to new system

---

**Status**: Planning Complete ✅  
**Next Action**: Begin Phase 1.1 - Create Role Model
