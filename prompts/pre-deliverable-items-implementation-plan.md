# Pre-Deliverable Items Implementation Plan
**Workload Tracker - Auto-Generated Pre-Deliverable Calendar Items**

Note: “Settings” below refers to the frontend Settings page UI (`frontend/src/pages/Settings/Settings.tsx`). We will not create a new Django app named “settings”; global defaults are stored in backend models (e.g., in `core`) and edited from that UI.

## Overview
This plan implements automatic generation of pre-deliverable items (sub-milestones) that appear on assigned team members' calendars before main deliverables. Each deliverable will automatically create configurable lead-time items based on default settings that can be customized per project and globally through the Settings interface.

## Current System Analysis
The workload tracker has:
- **Deliverables Model**: Links to projects, has dates, descriptions, assignments
- **DeliverableAssignment Model**: Links people to deliverables with roles
- **Calendar System**: Displays deliverables on a calendar view
- **Settings System**: Role management and backup/restore functionality
- **Assignment System**: Weekly hours allocation for project assignments

## Architecture Design

### Database Schema Changes
1. **PreDeliverableType Model**: Define types of pre-deliverable items (unique `name`, positive `default_days_before`).
2. **PreDeliverableItem Model**: Generated items linked to main deliverables (add UniqueConstraint on `(deliverable, pre_deliverable_type)` and indexes for calendar queries).
3. **ProjectPreDeliverableSettings Model**: Per-project customization (FK to `Project`, UniqueConstraint on `(project, pre_deliverable_type)`).
4. **PreDeliverableGlobalSettings Model (core app)**: System-wide default pre-deliverable rules (OneToOne with `PreDeliverableType`).

### Frontend Components
1. **Settings Interface**: Configure default pre-deliverable rules (UI)
2. **Project Settings**: Override defaults per project
3. **Calendar Enhancement**: Display pre-deliverable items with visual distinction
4. **Assignment Calendar**: Show pre-deliverables for assigned team members only

### Feature Flag
- Add `FEATURES['USE_PRE_DELIVERABLES']` to gate signals and the combined calendar endpoint; default on in dev.
- Optionally extend the `/api/capabilities/` endpoint to advertise a simple flag (e.g., `preDeliverables: true`) so the frontend can conditionally render UI based on server capabilities.

## Guiding Principles
- Fix root causes, not symptoms; avoid shortcuts and band‑aids.
- Use transactions, database constraints, and idempotent migrations for safety.
- Centralize business logic in service layers; serialize via DRF serializers (no hand‑built dicts in views).
- Optimize queries with `select_related`/`prefetch_related`; avoid N+1 patterns.
- Offload heavy/long‑running work to Celery; throttle signals; guard with feature flags.
- Document endpoints with drf‑spectacular; keep frontend types in sync via OpenAPI and `generate-types`.
- Write unit/integration tests; ensure accessibility (labels, keyboard, contrast) and performance.

## Implementation Steps

---

### Step 0: Implement Working Days Calculation Service (Prerequisite)
Best‑practice directive: Centralize all business‑day math here; add unit tests; do not reimplement date logic elsewhere.
**Prompt for AI Agent:**
```

Acceptance checklist:
- End-to-end journey verified (create → plan → complete → report)
- No orphaned or duplicate records after changes
- Response times acceptable under expected load
- Deployment checklist fully executed (migrations, schema, cache, monitoring)

Acceptance checklist:
- User/admin/dev docs are clear and actionable with examples
- Configuration reference prevents guesswork (env vars, defaults)
- README mentions the feature and links deeper docs
- FAQ covers common pitfalls and troubleshooting steps

Acceptance checklist:
- Critical user flows covered by UI tests (settings, overrides, calendar, personal)
- Accessibility basics (labels, keyboard nav, contrast) verified
- Performance holds up with large datasets on calendar view
- Visual regressions minimized; intentional changes documented

Acceptance checklist:
- Email settings verified; reminders send on schedule without spamming
- Users can manage preferences (timing, digest) and opt-out
- Notification logs record success/failure for admin review
- In-app notices are visible, dismissible, and non-intrusive

Acceptance checklist:
- Only assigned users (or managers/admins) can mark items complete
- Reports match underlying data for selected filters
- Aggregated queries return quickly; cached where reasonable
- UI conveys progress and problem areas (overdue, frequently missed)

Acceptance checklist:
- Personal view shows only the signed-in user’s items
- Quick complete action updates status without page refresh
- Overdue/due-soon highlighting is accurate and helpful
- Navigation integrates cleanly with existing routes

Acceptance checklist:
- Global defaults exist in core and are editable by admins
- New projects inherit these defaults; project overrides take priority
- Data migration seeds defaults for all types reliably
- No new Django app named "settings" is introduced

Acceptance checklist:
- Project overrides clearly show what’s custom vs using defaults
- Unique per (project, type) is enforced; no duplicate rows
- Disabling a type at project level stops future generation
- UI/API roundtrip reflects changes only for that project

Acceptance checklist:
- Creating a deliverable with a date generates the expected prep tasks once
- Duplicate prevention works (same deliverable + type is unique)
- Completion and notes fields behave as expected in admin/API
- Indexes are present to keep calendar queries fast

Acceptance checklist:
- Types have unique names and sensible default timing
- Admin can see and reorder types in the UI
- Defaults seeded via migration (idempotent) and safe to re-run
- Type on/off switch respected across the app

Acceptance checklist:
- Business day calculations skip weekends and match example cases
- Clear place to add holiday rules later without code churn
- Unit tests cover edge dates (month/year boundaries)
- Service is stateless and safe to call from multiple places
Create a robust WorkingDaysService in core/services.py for business-day calculations used throughout pre-deliverable date generation.

Implementation note:
- Create the file `backend/core/services.py` if it does not already exist.

Methods:
- calculate_working_days_before(target_date, business_days)
- calculate_working_days_after(start_date, business_days)
- is_working_day(date)
- get_working_days_between(start_date, end_date)

Requirements:
- Weekend exclusion (Sat/Sun); holiday support can be added later.
- Stateless, unit-tested, with type hints and error handling.
- Document examples and edge cases (month/year boundaries).
```

### Step 1: Create Pre-Deliverable Type Model
Best‑practice directive: Use schema migrations and data migrations (no raw SQL); expose admin list/order cleanly; no ad‑hoc seeding.
**Prompt for AI Agent:**
```
Create a new Django model called PreDeliverableType in the deliverables app. This model should define the types of pre-deliverable items that can be automatically generated. The model should include:

Fields:
- name: CharField(max_length=100) - Name of the pre-deliverable type
- description: TextField(blank=True) - Description of what this type represents
- default_days_before: PositiveIntegerField (validators=[MinValueValidator(1)]) - Default number of working days before the main deliverable
- is_active: BooleanField(default=True) - Whether this type is available for use
- sort_order: IntegerField(default=0) - Display order in UI
- created_at: DateTimeField(auto_now_add=True)
- updated_at: DateTimeField(auto_now=True)

Create the following default instances via a data migration:
1. Specification TOC (3 days before)
2. Specifications (1 day before)
3. Model Delivery (1 day before)
4. Sheet List (1 day before)

Follow Django best practices for models, include proper meta class with ordering, add str method, and create appropriate migration files. Add the model to admin.py for administrative access. Use snake_case naming conventions consistent with the existing codebase.
```

---

### Step 2: Create Pre-Deliverable Item Model
Best‑practice directive: Keep models thin; validate via serializers; avoid business logic in admin; enforce uniqueness and indexing.
**Prompt for AI Agent:**
```
Create a new Django model called PreDeliverableItem in the deliverables app. This model represents automatically generated pre-deliverable items that are created based on main deliverables. The model should include:

Fields:
- deliverable: ForeignKey to Deliverable model with on_delete=CASCADE and related_name='pre_items'
- pre_deliverable_type: ForeignKey to PreDeliverableType model with on_delete=CASCADE
- generated_date: DateField - The calculated date for this pre-deliverable item
- days_before: PositiveIntegerField - Number of working days before the main deliverable (can be customized per item)
- is_completed: BooleanField(default=False) - Whether this pre-deliverable is done
- completed_date: DateField(blank=True, null=True) - When it was actually completed
- notes: TextField(blank=True) - Additional notes for this specific pre-deliverable
- is_active: BooleanField(default=True) - Whether this item should be displayed
- created_at: DateTimeField(auto_now_add=True)
- updated_at: DateTimeField(auto_now=True)

Add a property method called 'display_name' that combines the pre_deliverable_type name with the parent deliverable description.

Add a method called 'get_assigned_people' that returns people assigned to the parent deliverable.

Constraints and performance:
- Add UniqueConstraint on `(deliverable, pre_deliverable_type)` to prevent duplicates
- Add indexes: `(deliverable_id, is_active, generated_date)` and `(generated_date, is_completed)` for calendar queries

Follow Django best practices including meta class ordering by generated_date, str method, and proper foreign key relationships. Add to admin.py for administrative access.
```

---

### Step 3: Create Project Settings Model for Customization
Best‑practice directive: Document precedence (project > global > type); use `select_related/prefetch_related` to avoid N+1.
**Prompt for AI Agent:**
```
Create a new Django model called ProjectPreDeliverableSettings in the projects app. This model allows per-project customization of pre-deliverable generation rules. The model should include:

Fields:
- project: ForeignKey to Project model with on_delete=CASCADE and related_name='pre_deliverable_settings'
- pre_deliverable_type: ForeignKey to PreDeliverableType model
- days_before: PositiveIntegerField - Custom number of working days before deliverable for this project
- is_enabled: BooleanField(default=True) - Whether this type is enabled for this project
- created_at: DateTimeField(auto_now_add=True)
- updated_at: DateTimeField(auto_now=True)

Add unique_together constraint for project and pre_deliverable_type to prevent duplicates.

Create a class method called 'get_project_settings' that takes a project instance and returns a dictionary mapping pre-deliverable type IDs to their custom settings for that project, falling back to default settings from PreDeliverableType model.

Add to admin.py and follow Django best practices with appropriate meta class and str method.
```

---

### Step 4: Create Global Settings Model for System Defaults
Best‑practice directive: Avoid import cycles; admin edit restricted to staff; seeding must be idempotent and reversible.
**Prompt for AI Agent:**
```
Create a new Django model called PreDeliverableGlobalSettings in the existing `core` app (do not create a new 'settings' app). This model stores system-wide default settings for pre-deliverable generation. The model should include:

Fields:
- pre_deliverable_type: OneToOneField to PreDeliverableType model with on_delete=CASCADE and related_name='global_settings'
- default_days_before: PositiveIntegerField - System default for days before deliverable
- is_enabled_by_default: BooleanField(default=True) - Whether new projects should have this type enabled by default
- created_at: DateTimeField(auto_now_add=True)
- updated_at: DateTimeField(auto_now=True)

Create a class method called 'get_effective_settings' that returns the effective settings for a given project and pre-deliverable type, checking in this order:
1. Project-specific settings (ProjectPreDeliverableSettings)
2. Global settings (PreDeliverableGlobalSettings)
3. Pre-deliverable type defaults

Add data migration to create default global settings for all existing PreDeliverableType instances.

Implementation notes:
- Create `backend/core/models.py` if it does not already exist.
- Set migration dependencies so deliverables' `PreDeliverableType` exists before seeding global defaults.

Follow Django standards, add to admin, and include proper app configuration.
```

---

### Step 5: Implement Pre-Deliverable Generation Service
Best‑practice directive: Make this the single source of truth; add unit tests; emit structured logs with IDs for traceability.
**Prompt for AI Agent:**
```
Create a service class called PreDeliverableService in deliverables/services.py. This service handles automatic generation and management of pre-deliverable items. The service should include:

Methods:
1. generate_pre_deliverables(deliverable_instance) - Creates pre-deliverable items for a given deliverable based on project and global settings
2. update_pre_deliverables(deliverable_instance) - Updates existing pre-deliverable items when the main deliverable date changes
3. delete_pre_deliverables(deliverable_instance) - Removes all pre-deliverable items for a deliverable
4. calculate_working_days_before(target_date, days_before) - (Use core.services.WorkingDaysService) Calculates the actual date considering working days (exclude weekends)
5. get_effective_settings_for_project(project_instance) - Returns the effective pre-deliverable settings for a project

The service should:
- Handle date calculations properly, skipping weekends when counting working days
- Use the PreDeliverableGlobalSettings.get_effective_settings method to determine what to generate
- Only generate pre-deliverables for deliverables that have dates assigned
- Avoid creating duplicates by checking for existing pre-deliverable items
- Log generation activities for debugging
- Wrap changes in database transactions and prefer bulk operations (bulk_create/bulk_update) where appropriate for performance

Use clean, well-documented code following Python best practices. Include proper error handling and type hints where appropriate.

Acceptance checklist:
- Regenerating/Updating respects completed items where feasible
- No duplicates created during updates/regeneration
- All operations wrapped in transactions; bulk ops used where suitable
- Logging provides enough detail to trace generation decisions
```

---

### Step 6: Create Migration Strategy and Data Validation
Best‑practice directive: Use bounded, resumable batches; gate with feature flags; comprehensive logging and dry‑run first.
**Prompt for AI Agent:**
```
Create a comprehensive migration strategy for rolling out pre-deliverable items to existing projects. Implement the following:

1. Data migration script:
   - Analyze existing deliverables and generate pre-deliverable items retroactively
   - Handle edge cases like deliverables without dates or past deliverables
   - Default: skip deliverables older than 30 days in the past (configurable)
   - Batch processing for large datasets

2. Validation management command:
   - Django management command to validate pre-deliverable item consistency
   - Check for orphaned pre-deliverable items
   - Verify date calculations are correct
   - Report on data integrity issues

3. Rollback capability:
   - Management command to remove all generated pre-deliverable items
   - Safe rollback without affecting main deliverable data
   - Data export before major changes

4. Performance optimization:
   - Database indexes for efficient pre-deliverable queries
   - Query optimization for calendar and reporting views
   - Caching strategy for frequently accessed data

5. Monitoring and logging:
   - Logging for pre-deliverable generation activities
   - Performance monitoring for new database operations
   - Error tracking and alerting

Create comprehensive documentation for the migration process including:
- Pre-migration checklist
- Step-by-step migration instructions
- Post-migration validation procedures
- Troubleshooting guide

Ensure the migration can be safely executed on production systems with minimal downtime and clear rollback procedures.
```

Acceptance checklist:
- Dry-run output looks correct and is safe to execute
- Backfill skips old/past deliverables by default (configurable window)
- Rollback command removes generated items without touching deliverables
- Validation finds and reports orphans/duplicates accurately

---

### Step 7: Add Django Signals for Automatic Generation
Best‑practice directive: Never run heavy work inline; guard re‑entrancy; measure with metrics; use Celery for bulk operations.
**Prompt for AI Agent:**
```
Create Django signals in deliverables/signals.py to automatically manage pre-deliverable items when deliverables are created, updated, or deleted. The signals should handle:

1. post_save signal for Deliverable model:
   - When a new deliverable is created with a date, generate pre-deliverable items
   - When an existing deliverable's date is updated, update all related pre-deliverable dates
   - When a deliverable is assigned a date for the first time, generate pre-deliverable items

2. post_delete signal for Deliverable model:
   - When a deliverable is deleted, clean up all related pre-deliverable items

3. post_save signal for ProjectPreDeliverableSettings model:
   - When project settings are updated, regenerate pre-deliverables for affected deliverables

The signals should:
- Use the PreDeliverableService methods created in Step 5
- Include proper error handling and logging
- Avoid infinite loops or cascade issues
- Only trigger generation when appropriate (deliverable has date, project settings exist, etc.)
- Use transaction.on_commit for post-save work and add simple throttling (e.g., cache) to avoid rapid repeated regenerations.
 - Guard execution behind `FEATURES['USE_PRE_DELIVERABLES']`; disable signals during bulk backfills/migrations.
 - For project-wide changes, enqueue Celery tasks rather than doing heavy work inline; prefer bulk operations in service methods.

Make sure to connect the signals properly in the app configuration. Follow Django signal best practices and include comprehensive error handling.
```

Acceptance checklist:
- Signals respect feature flag and are disabled during migrations/backfills
- Rapid updates do not cause repeated regeneration (throttled)
- Project‑wide changes use background jobs; UI/API remain responsive
- No recursion or infinite loops observed in logs/tests

---

### Step 8: Update Deliverable Serializers and Views
Best‑practice directive: Always use DRF serializers (no hand‑rolled dicts); paginate; test ETag/If‑None‑Match; document with drf‑spectacular.
**Prompt for AI Agent:**
```
Update the existing DeliverableViewSet in deliverables/views.py and related serializers to include pre-deliverable items in API responses. Make the following changes:

1. Update the Deliverable serializer to include a 'pre_items' field that shows related pre-deliverable items with their details

2. Create a new PreDeliverableItemSerializer with fields:
   - id, pre_deliverable_type (nested), generated_date, days_before, is_completed, completed_date, notes, display_name

3. Add a new action to DeliverableViewSet called 'regenerate_pre_items' that allows manual regeneration of pre-deliverable items for a specific deliverable

4. Create a new ViewSet called PreDeliverableItemViewSet with:
   - List and retrieve actions for pre-deliverable items
   - Update action for marking items as completed
   - Filter by deliverable, project, and date range

5. Add a new calendar endpoint (keep existing endpoint unchanged) to include pre-deliverable items in the calendar data with a distinct visual indicator:
   - New: GET /api/deliverables/calendar-with-pre-items/?start=YYYY-MM-DD&end=YYYY-MM-DD
   - Include both deliverables and pre-deliverable items; add fields: item_type ('deliverable'|'pre_deliverable'), parent_deliverable_id (for pre-items), pre_deliverable_type (name)
   - ETag/Last-Modified behavior should mirror the existing calendar endpoint
   - Filters: support `assigned_to_me=1` (only pre-items where the user is assigned), and `pre_type_id` or `pre_type_name` to filter types

Add proper permissions, filtering, and pagination. Follow existing code patterns in the codebase for consistency. Include comprehensive API documentation (drf-spectacular annotations) and maintain naming discipline (snake_case model fields; camelCase serializer outputs via `source=` mapping). For PreDeliverableItemViewSet, ensure only assigned users (checked via DeliverableAssignment), managers, or admins can update completion state.
```

Schema annotation draft (example):
```python
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
from rest_framework import serializers

class PreDeliverableCalendarItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    project = serializers.IntegerField()
    projectName = serializers.CharField(allow_null=True)
    projectClient = serializers.CharField(allow_null=True, required=False)
    title = serializers.CharField()
    date = serializers.DateField(allow_null=True)
    itemType = serializers.ChoiceField(choices=['deliverable','pre_deliverable'])
    parentDeliverableId = serializers.IntegerField(required=False, allow_null=True)
    preDeliverableType = serializers.CharField(required=False, allow_null=True)

@extend_schema(
    parameters=[
        OpenApiParameter(name='start', type=str, required=False, description='YYYY-MM-DD'),
        OpenApiParameter(name='end', type=str, required=False, description='YYYY-MM-DD'),
        OpenApiParameter(name='assigned_to_me', type=int, required=False, description='0|1 (pre-items only)'),
        OpenApiParameter(name='pre_type_id', type=int, required=False, description='Filter pre-items by type id'),
        OpenApiParameter(name='pre_type_name', type=str, required=False, description='Filter pre-items by type name'),
    ],
    responses=PreDeliverableCalendarItemSerializer(many=True)
)
def calendar_with_pre_items(self, request):
    ...

class PreDeliverableItemUpdateSerializer(serializers.Serializer):
    is_completed = serializers.BooleanField(required=False)
    completed_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)

@extend_schema(
    request=PreDeliverableItemUpdateSerializer,
    responses=PreDeliverableItemUpdateSerializer,
)
def partial_update(self, request, *args, **kwargs):
    ...
```

---

### Step 9: Create Settings Interface for Global Defaults
Best‑practice directive: Reuse existing UI components; validate client & server; maintain a11y; avoid inline styles; use theme tokens.
**Prompt for AI Agent:**
```
Create a new settings interface for managing global pre-deliverable defaults. Add to the existing Settings page (frontend/src/pages/Settings/Settings.tsx) a new section called "Pre-Deliverable Defaults".

The interface should include:

1. A card component displaying current global pre-deliverable settings
2. An edit form that allows administrators to modify:
   - Default days before for each pre-deliverable type
   - Whether each type is enabled by default for new projects
   - Sort order for display

3. Place this as a standalone card with an anchor link (e.g., `#pre-deliverable-defaults`) and gate visibility to admin users; follow existing card layout patterns (no new tabs needed).

3. API integration with new endpoints for:
   - GET /api/core/pre-deliverable-global-settings/
   - PUT /api/core/pre-deliverable-global-settings/

4. Form validation ensuring days_before values are positive integers (e.g., 1–30)
5. Success/error feedback using the existing toast system
6. Proper loading states and error handling

Create the corresponding Django views and serializers for the settings API endpoints. Use the existing VSCode dark theme colors and component patterns established in the Settings page. Only show this section to admin users using the existing auth system. Do not introduce tabs; follow the page's existing card + anchor navigation pattern to avoid clutter.

Follow the established file structure and naming conventions. Test the API endpoints and ensure proper error handling.
```

---

### Step 10: Add Project-Specific Pre-Deliverable Settings
Best‑practice directive: Add unsaved‑changes guard; prefer optimistic UI with rollback; debounce saves; handle empty/error states.
**Prompt for AI Agent:**
```
Add project-specific pre-deliverable settings to the Project form and detail views. Make the following updates:

1. Create a new component ProjectPreDeliverableSettings.tsx in frontend/src/components/projects/ that allows editing pre-deliverable settings for a specific project

2. Add this component to the Project form (frontend/src/pages/Projects/ProjectForm.tsx) as a new section

3. The component should display:
   - Current global defaults for reference
   - Override controls for each pre-deliverable type
   - Enable/disable toggles for each type
   - Custom days_before input fields
   - Reset to defaults button

4. Create API endpoints for project-specific settings:
   - GET /api/projects/{id}/pre-deliverable-settings/
   - PUT /api/projects/{id}/pre-deliverable-settings/

5. Update the project detail API to include current pre-deliverable settings

Create the corresponding Django views, serializers, and URL patterns. Use proper form validation and error handling. Follow the existing project management UI patterns and use the established VSCode dark theme colors.

The interface should clearly indicate when settings are overridden vs using defaults, and provide easy reset functionality.
```

---

### Step 11: Enhance Calendar to Display Pre-Deliverable Items
Best‑practice directive: Use stable keys & memoization; avoid redundant computations; instrument render performance in dev.
**Prompt for AI Agent:**
```
Update the existing calendar component (frontend/src/pages/Deliverables/Calendar.tsx) to display pre-deliverable items with visual distinction from main deliverables. Make the following changes:

1. Call the new combined calendar endpoint to include pre-deliverable items while keeping the existing endpoint intact:
   - Use GET /api/deliverables/calendar-with-pre-items/?start=YYYY-MM-DD&end=YYYY-MM-DD

2. Modify the calendar display to show pre-deliverable items with:
   - Smaller, lighter colored bars/indicators
   - Different border style (dashed or dotted)
   - Prefix or suffix indicating it's a pre-deliverable (e.g., "PRE: Specification TOC")
   - Tooltip showing the parent deliverable and type

3. Add filtering options to the calendar:
   - Toggle to show/hide pre-deliverable items
   - Filter by pre-deliverable type
   - Filter by assignment (show only items for deliverables you're assigned to)

4. Update the calendar legend to include pre-deliverable item indicators

5. Add hover interactions showing:
   - Parent deliverable information
   - Assigned team members
   - Completion status

Maintain the existing calendar functionality while seamlessly integrating pre-deliverable items. Use consistent color schemes but ensure clear visual distinction. Follow the established VSCode dark theme patterns and ensure responsive design.

Test the calendar with various combinations of deliverables and pre-deliverable items to ensure proper display and performance.

Implementation notes for the existing Calendar.tsx:
- Extend the existing `typeColors` map to include a distinct style for pre-deliverable items.
- Update `classify()` to account for `itemType === 'pre_deliverable'` and use the appropriate styling.
- Introduce a separate `CombinedCalendarItem` type for the new combined endpoint (with `itemType`, `parentDeliverableId`, `preDeliverableType`) to avoid breaking the legacy `DeliverableCalendarItem` type.
- Keep date ranges reasonable in the UI and memoize filtered/derived lists to maintain performance.
 
TypeScript shape draft (CombinedCalendarItem):
```ts
export type CombinedCalendarItem =
  | ({ itemType: 'deliverable' } & {
      id: number;
      project: number;
      projectName: string | null;
      projectClient?: string | null;
      title: string;
      date: string | null; // YYYY-MM-DD
      isCompleted?: boolean;
      assignmentCount?: number;
    })
  | ({ itemType: 'pre_deliverable' } & {
      id: number;
      project: number;
      projectName: string | null;
      projectClient?: string | null;
      title: string; // e.g., "PRE: Specification TOC"
      date: string | null; // YYYY-MM-DD (generated_date)
      parentDeliverableId: number;
      preDeliverableType: string | null;
      isCompleted?: boolean;
    });
```

Acceptance checklist:
- Legacy calendar view remains unchanged and functional
- Combined endpoint renders both item types with clear styling
- Filters (show/hide pre-items, by type, my items) work as expected
- Performance acceptable across typical ranges; UI remains responsive
```

---

### Step 12: Create Personal Calendar View for Assigned Pre-Deliverables
Best‑practice directive: Enforce server‑side permissions; provide clear empty states; retry/backoff for network actions.
**Prompt for AI Agent:**
```
Create a new personal calendar view that shows pre-deliverable items specifically for the logged-in user's assigned deliverables. Create the following:

1. New component PersonalCalendarView.tsx in frontend/src/pages/Calendar/ that displays:
   - Only pre-deliverable items for deliverables where the user is assigned
   - A more compact, task-focused view optimized for personal planning
   - Ability to mark pre-deliverable items as completed
   - Integration with existing assignment system

2. API endpoint for personal pre-deliverable items:
   - GET /api/deliverables/pre-items/personal/?days_ahead=14
   - POST /api/deliverables/pre-items/{id}/mark_completed/

3. Navigation integration:
   - Add "My Pre-Deliverables" to the main navigation
   - Update routing in App.tsx

4. Features for the personal view:
   - Week/month view options
   - Grouping by project or deliverable
   - Completion tracking with progress indicators
   - Upcoming items highlighting (items due within 3 days)

5. Dashboard integration:
   - Add a "Upcoming Pre-Deliverables" widget to the main dashboard
   - Show count of overdue pre-deliverable items

Create the corresponding backend views and serializers for personal calendar data. Use efficient queries to only fetch relevant data for the authenticated user. Follow established authentication and permission patterns.

Ensure the interface is intuitive for individual contributors to track their pre-deliverable responsibilities.
```

---

### Step 13: Add Completion Tracking and Reporting
Best‑practice directive: Favor database aggregation over Python loops; ensure indexes; cache expensive aggregates.
**Prompt for AI Agent:**
```
Implement completion tracking and reporting features for pre-deliverable items. Create the following functionality:

1. Completion workflow:
   - API endpoints for marking pre-deliverable items as complete/incomplete
   - Automatic completion date recording
   - Validation that pre-deliverable items can only be completed by assigned team members

2. Reporting dashboard component PreDeliverableReports.tsx:
   - Completion rates by project
   - Average completion time vs planned time
   - Frequently missed pre-deliverable types
   - Team performance on pre-deliverable adherence

3. Project progress tracking:
   - Visual indicators on project pages showing pre-deliverable completion status
   - Alerts for overdue pre-deliverable items
   - Progress bars showing completed vs total pre-deliverable items

4. API endpoints for reporting:
   - GET /api/reports/pre-deliverable-completion/
   - GET /api/projects/{id}/pre-deliverable-progress/

5. Integration with existing assignment system:
   - Link pre-deliverable completion to assignment hours tracking
   - Show pre-deliverable status in assignment grids

Create comprehensive Django views with proper aggregation queries for reporting data. Use efficient database queries and include proper caching for frequently accessed reports.

Follow the existing reporting patterns and ensure the interface provides actionable insights for project managers and team members.
```

---

### Step 14: Add Notification System for Pre-Deliverable Reminders
Best‑practice directive: Respect user preferences; rate‑limit; retry with backoff; test templates; feature‑flag email sending.
**Prompt for AI Agent:**
```
Implement a notification system for pre-deliverable item reminders. Create the following:

1. Notification models in the existing `core` app:
   - NotificationPreference model for user notification settings
   - NotificationLog model for tracking sent notifications
   - Support for email and in-app notification types

2. Pre-deliverable reminder service:
   - Daily task to check for upcoming pre-deliverable items
   - Configurable reminder timing (1 day before, 3 days before, etc.)
   - Email notifications using Django's email framework
   - In-app notification system

3. User notification preferences in Settings:
   - Toggle for pre-deliverable email reminders
   - Configurable reminder timing preferences
   - Digest vs immediate notification options

4. In-app notification display:
   - Notification bell icon in the main navigation
   - Dropdown showing recent notifications
   - Mark as read functionality

5. Celery task integration (with Email settings configured in Django settings):
   - Scheduled task for sending daily reminder emails
   - Background processing for notification generation
   - Integration with existing Celery configuration

Create the notification infrastructure using Django's built-in email framework and existing Celery setup. Design the notification preferences UI following the established Settings page patterns.

Ensure notifications are relevant, timely, and not overwhelming. Include proper unsubscribe mechanisms and respect user preferences.
```

---

- Run migrations: make migrate\n- Regenerate OpenAPI schema: make openapi-schema\n- Generate frontend OpenAPI TS types: make openapi-client\n- Generate TS interfaces: make generate-types\n- Validate data (after seeding):\n  - python manage.py validate_pre_deliverable_data --dry-run\n  - python manage.py migrate_existing_deliverables --dry-run\n- Enable feature flag if gated: set FEATURES.USE_PRE_DELIVERABLES=true in env/config\n

### Step 15: Frontend Testing and Quality Assurance
Best‑practice directive: Gate CI on typecheck, tests, and lint/format; include a11y checks; test large calendar datasets.
**Prompt for AI Agent:**
`\nCreate comprehensive frontend tests for the pre-deliverable items feature. Implement the following testing strategy:\n\n1. Unit tests for new components:\n   - PreDeliverableSettings component tests\n   - PersonalCalendarView component tests\n   - Pre-deliverable item display components\n   - API service method tests\n\n2. Integration tests:\n   - Calendar integration with pre-deliverable items\n   - Settings page integration\n   - Project form integration\n   - Personal dashboard integration\n\n3. End-to-end test scenarios:\n   - Create deliverable and verify pre-deliverable generation\n   - Modify deliverable date and verify updates cascade\n   - Change project settings and verify effects\n   - Complete pre-deliverable workflow testing\n\n4. Accessibility testing:\n   - Screen reader compatibility for new components\n   - Keyboard navigation support\n   - Color contrast validation\n   - ARIA label verification\n\n5. Performance testing:\n   - Calendar rendering with large numbers of pre-deliverable items\n   - Settings page load time with many pre-deliverable types\n   - API response time testing\n\nUse the existing testing framework and patterns established in the codebase. Create test data fixtures for consistent testing scenarios.\n\nInclude visual regression testing for calendar and settings interfaces. Document test coverage and create guidelines for ongoing test maintenance.\n`\n\n---\n\n### Step 16: Documentation and User Guide Creation\n**Prompt for AI Agent:**\n`\nCreate comprehensive documentation for the pre-deliverable items feature. Create the following documentation:\n\n1. User Guide (frontend/docs/pre-deliverable-guide.md):\n   - How to configure global pre-deliverable defaults\n   - Setting up project-specific pre-deliverable rules\n   - Using the personal calendar for pre-deliverable tracking\n   - Completing pre-deliverable items workflow\n\n2. Administrator Guide (backend/docs/pre-deliverable-admin.md):\n   - Database schema overview\n   - Migration procedures\n   - Troubleshooting common issues\n   - Performance tuning recommendations\n\n3. Developer Documentation (docs/pre-deliverable-api.md):\n   - API endpoint documentation\n   - Service class documentation\n   - Integration patterns for future enhancements\n   - Database query optimization guide\n\n4. Configuration Reference:\n   - Environment variable documentation\n   - Settings model field reference\n   - Default configuration values\n   - Customization options\n\n5. FAQ and Troubleshooting:\n   - Common user questions and answers\n   - Known limitations and workarounds\n   - Performance considerations\n   - Data migration issues and solutions\n\nUpdate the main project README.md to include references to the new pre-deliverable feature. Create screenshots and diagrams showing the user interface and workflow.\n\nFollow the existing documentation style and ensure all documentation is clear, comprehensive, and maintainable.\n`\n\n---\n\n### Step 17: Final Integration Testing and Production Readiness\n**Prompt for AI Agent:**\n`\nPerform final integration testing and prepare the pre-deliverable items feature for production deployment. Complete the following tasks:\n\n1. End-to-end system testing:\n   - Test complete workflow from deliverable creation to pre-deliverable completion\n   - Verify calendar display accuracy across different screen sizes\n   - Test notification delivery and timing\n   - Validate reporting accuracy and performance\n\n2. Data integrity validation:\n   - Run data consistency checks on existing test data\n   - Verify no orphaned records or broken relationships\n   - Confirm all database constraints are properly enforced\n   - Test cascade delete operations\n\n3. Performance validation:\n   - Load testing with realistic data volumes\n   - API response time verification under load\n   - Database query performance analysis\n   - Frontend rendering performance with many items\n\n4. Security review:\n   - Verify proper authentication and authorization on all new endpoints\n   - Test API parameter validation and sanitization\n   - Confirm user data isolation and privacy\n   - Review for potential SQL injection or XSS vulnerabilities\n\n5. Production deployment checklist:\n   - Environment variable configuration guide\n   - Database migration execution plan\n   - Static file deployment verification\n   - Cache configuration and warming\n   - Monitoring and alerting setup\n`\n

### Step 16: Documentation and User Guide Creation
Best‑practice directive: Version docs with the code; include ERD and endpoint lists; keep examples current.
**Prompt for AI Agent:**
`
Create comprehensive documentation for the pre-deliverable items feature. Create the following documentation:

1. User Guide (frontend/docs/pre-deliverable-guide.md):
   - How to configure global pre-deliverable defaults
   - Setting up project-specific pre-deliverable rules
   - Using the personal calendar for pre-deliverable tracking
   - Completing pre-deliverable items workflow

2. Administrator Guide (backend/docs/pre-deliverable-admin.md):
   - Database schema overview
   - Migration procedures
   - Troubleshooting common issues
   - Performance tuning recommendations

3. Developer Documentation (docs/pre-deliverable-api.md):
   - API endpoint documentation
   - Service class documentation
   - Integration patterns for future enhancements
   - Database query optimization guide

4. Configuration Reference:
   - Environment variable documentation
   - Settings model field reference
   - Default configuration values
   - Customization options

5. FAQ and Troubleshooting:
   - Common user questions and answers
   - Known limitations and workarounds
   - Performance considerations
   - Data migration issues and solutions

Update the main project README.md to include references to the new pre-deliverable feature. Create screenshots and diagrams showing the user interface and workflow.

Follow the existing documentation style and ensure all documentation is clear, comprehensive, and maintainable.
`

---

### Step 17: Final Integration Testing and Production Readiness
Best‑practice directive: Validate authZ, input validation, throttling; run an OWASP sanity check; monitor 5xx and latency.
**Prompt for AI Agent:**
`
Perform final integration testing and prepare the pre-deliverable items feature for production deployment. Complete the following tasks:

1. End-to-end system testing:
   - Test complete workflow from deliverable creation to pre-deliverable completion
   - Verify calendar display accuracy across different screen sizes
   - Test notification delivery and timing
   - Validate reporting accuracy and performance

2. Data integrity validation:
   - Run data consistency checks on existing test data
   - Verify no orphaned records or broken relationships
   - Confirm all database constraints are properly enforced
   - Test cascade delete operations

3. Performance validation:
   - Load testing with realistic data volumes
   - API response time verification under load
   - Database query performance analysis
   - Frontend rendering performance with many items

4. Security review:
   - Verify proper authentication and authorization on all new endpoints
   - Test API parameter validation and sanitization
   - Confirm user data isolation and privacy
   - Review for potential SQL injection or XSS vulnerabilities

5. Production deployment checklist:
   - Environment variable configuration guide
   - Database migration execution plan
   - Static file deployment verification
   - Cache configuration and warming
   - Monitoring and alerting setup
`

---

### Step 18: Runbook (Dev)
Best‑practice directive: Include post‑deploy smoke tests; documented rollback; verify ETag hit‑rate and index usage; feature‑flag toggles.
- Run migrations: make migrate
- Regenerate OpenAPI schema: make openapi-schema
- Generate frontend OpenAPI TS types: make openapi-client
- Generate TS interfaces: make generate-types
- Validate data (after seeding):
  - python manage.py validate_pre_deliverable_data --dry-run
  - python manage.py migrate_existing_deliverables --dry-run
- Enable feature flag if gated: set FEATURES.USE_PRE_DELIVERABLES=true in env/config
 - Confirm frontend compiles and types align (e.g., `npm run build` or `tsc`)
