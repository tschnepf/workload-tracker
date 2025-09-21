# Pre-Deliverable Items Implementation Plan (Corrected)
**Workload Tracker - Auto-Generated Pre-Deliverable Calendar Items**

## Overview
This plan implements automatic generation of pre-deliverable items (sub-milestones) that appear on assigned team members' calendars before main deliverables. Each deliverable will automatically create configurable lead-time items based on default settings that can be customized per project and globally through the Settings interface.

## Current System Analysis
The workload tracker has:
- **Deliverables Model**: Links to projects, has dates, descriptions, assignments
- **DeliverableAssignment Model**: Links people to deliverables with roles
- **Calendar System**: Displays deliverables on a calendar view at `/pages/Deliverables/Calendar.tsx`
- **Settings System**: Role management and backup/restore functionality at `/pages/Settings/Settings.tsx`
- **Assignment System**: Weekly hours allocation for project assignments
- **Existing Apps**: core, people, projects, assignments, deliverables, departments, roles, accounts, skills, dashboard

## Architecture Design

### Database Schema Changes
1. **PreDeliverableType Model**: Define types of pre-deliverable items (in deliverables app)
2. **PreDeliverableItem Model**: Generated items linked to main deliverables (in deliverables app)
3. **ProjectPreDeliverableSettings Model**: Per-project customization of pre-deliverable rules (in projects app)
4. **PreDeliverableGlobalSettings Model**: System-wide default pre-deliverable rules (in core app)

### Frontend Components
1. **Settings Interface**: Add pre-deliverable defaults section to existing Settings page
2. **Project Settings**: Add pre-deliverable overrides to existing Project form
3. **Calendar Enhancement**: Enhance existing calendar to display pre-deliverable items
4. **Personal View**: Add personal pre-deliverable tracking within existing structure

## Implementation Steps

---

### Step 1: Create Working Days Calculation Service
**Prompt for AI Agent:**
```
Create a robust working days calculation service in core/services.py that handles business day calculations for pre-deliverable date generation. This must be implemented first as other services depend on it.

Create a WorkingDaysService class with these methods:
- calculate_working_days_before(target_date, business_days) - Calculate date X business days before target
- calculate_working_days_after(start_date, business_days) - Calculate date X business days after start
- is_working_day(date) - Determine if a date is a working day (exclude weekends)
- get_working_days_between(start_date, end_date) - Count working days between dates

Implementation requirements:
- Use Python datetime and timedelta for calculations
- Exclude weekends (Saturday/Sunday) when counting business days
- Include comprehensive error handling for invalid dates
- Add type hints throughout
- Create unit tests for edge cases (month boundaries, year boundaries)
- Document with clear examples

For now, implement basic weekend exclusion. Holiday support can be added later. Ensure the service is stateless and thread-safe.

Test scenarios to include:
- calculate_working_days_before('2024-01-15', 3) should return '2024-01-10' (skipping weekend)
- Handle edge cases like target dates on weekends
- Validate input parameters (positive business_days, valid dates)
```

---

### Step 2: Create Pre-Deliverable Type Model
**Prompt for AI Agent:**
```
Create a new Django model called PreDeliverableType in the deliverables app. This model defines the types of pre-deliverable items that can be automatically generated.

Fields:
- name: CharField(max_length=100, unique=True) - Name of the pre-deliverable type
- description: TextField(blank=True) - Description of what this type represents
- default_days_before: IntegerField(validators=[MinValueValidator(1)]) - Default working days before deliverable
- is_active: BooleanField(default=True) - Whether this type is available for use
- sort_order: IntegerField(default=0) - Display order in UI
- created_at: DateTimeField(auto_now_add=True)
- updated_at: DateTimeField(auto_now=True)

Meta configuration:
- ordering = ['sort_order', 'name']
- verbose_name = 'Pre-Deliverable Type'
- verbose_name_plural = 'Pre-Deliverable Types'

Include str method returning the name field.

Create a data migration (separate from schema migration) to create these default instances:
1. Specification TOC (3 days before, sort_order=10)
2. Specifications (1 day before, sort_order=20)
3. Model Delivery (1 day before, sort_order=30)
4. Sheet List (1 day before, sort_order=40)

Add the model to deliverables/admin.py with proper list_display and list_editable fields.

Ensure migration dependencies are correct and follow Django naming conventions. Test the migration on a clean database.
```

---

### Step 3: Create Pre-Deliverable Item Model
**Prompt for AI Agent:**
```
Create a new Django model called PreDeliverableItem in the deliverables app. This represents automatically generated pre-deliverable items created from main deliverables.

Fields:
- deliverable: ForeignKey to Deliverable model with on_delete=CASCADE and related_name='pre_items'
- pre_deliverable_type: ForeignKey to PreDeliverableType model with on_delete=CASCADE and related_name='items'
- generated_date: DateField - The calculated date for this pre-deliverable item
- days_before: PositiveIntegerField - Working days before the main deliverable (stored for reference)
- is_completed: BooleanField(default=False) - Whether this pre-deliverable is done
- completed_date: DateField(blank=True, null=True) - When it was actually completed
- completed_by: ForeignKey to User model (blank=True, null=True, on_delete=SET_NULL) - Who completed it
- notes: TextField(blank=True) - Additional notes for this specific pre-deliverable
- is_active: BooleanField(default=True) - Whether this item should be displayed
- created_at: DateTimeField(auto_now_add=True)
- updated_at: DateTimeField(auto_now=True)

Meta configuration:
- ordering = ['generated_date', 'deliverable__date']
- unique_together = [['deliverable', 'pre_deliverable_type']] - Prevent duplicates
- verbose_name = 'Pre-Deliverable Item'
- verbose_name_plural = 'Pre-Deliverable Items'

Add property methods:
- display_name: Returns f"{self.pre_deliverable_type.name} - {self.deliverable.description}"
- get_assigned_people: Returns people assigned to the parent deliverable via DeliverableAssignment
- is_overdue: Returns True if generated_date is past and not completed

Add method:
- mark_completed(user): Sets is_completed=True, completed_date=today, completed_by=user

Add to admin.py with proper list filters, search fields, and readonly fields. Include proper foreign key relationships and follow Django best practices.
```

---

### Step 4: Create Project Pre-Deliverable Settings Model
**Prompt for AI Agent:**
```
Create a new Django model called ProjectPreDeliverableSettings in the projects app. This allows per-project customization of pre-deliverable generation rules.

IMPORTANT: Use ForeignKey NOT OneToOneField as multiple records per project are needed (one per pre-deliverable type).

Fields:
- project: ForeignKey to Project model with on_delete=CASCADE and related_name='pre_deliverable_settings'
- pre_deliverable_type: ForeignKey to PreDeliverableType model with on_delete=CASCADE
- days_before: PositiveIntegerField - Custom working days before deliverable for this project
- is_enabled: BooleanField(default=True) - Whether this type is enabled for this project
- created_at: DateTimeField(auto_now_add=True)
- updated_at: DateTimeField(auto_now=True)

Meta configuration:
- unique_together = [['project', 'pre_deliverable_type']] - Prevent duplicate settings per project+type
- ordering = ['project__name', 'pre_deliverable_type__sort_order']
- verbose_name = 'Project Pre-Deliverable Setting'

Add class method:
@classmethod
def get_project_settings(cls, project_instance):
    """Returns dict mapping pre_deliverable_type_id to settings for the project"""
    settings = {}
    for setting in cls.objects.filter(project=project_instance).select_related('pre_deliverable_type'):
        settings[setting.pre_deliverable_type.id] = {
            'days_before': setting.days_before,
            'is_enabled': setting.is_enabled,
            'type_name': setting.pre_deliverable_type.name
        }
    return settings

Add str method returning f"{self.project.name} - {self.pre_deliverable_type.name}".

Add to projects/admin.py with proper filtering and inline editing capabilities. Include migration with proper dependencies.
```

---

### Step 5: Create Global Pre-Deliverable Settings Model
**Prompt for AI Agent:**
```
Create a new Django model called PreDeliverableGlobalSettings in the core app (NOT a new settings app to avoid conflicts). This stores system-wide default settings.

Fields:
- pre_deliverable_type: OneToOneField to PreDeliverableType model with on_delete=CASCADE and related_name='global_settings'
- default_days_before: PositiveIntegerField - System default for days before deliverable
- is_enabled_by_default: BooleanField(default=True) - Whether new projects should have this type enabled
- created_at: DateTimeField(auto_now_add=True)
- updated_at: DateTimeField(auto_now=True)

Meta configuration:
- ordering = ['pre_deliverable_type__sort_order']
- verbose_name = 'Global Pre-Deliverable Setting'

Add class method:
@classmethod
def get_effective_settings(cls, project_instance, pre_deliverable_type_id):
    """Returns effective settings for a project+type, checking in order:
    1. Project-specific settings
    2. Global settings
    3. PreDeliverableType defaults
    """
    # Check project-specific first
    try:
        from projects.models import ProjectPreDeliverableSettings
        project_setting = ProjectPreDeliverableSettings.objects.get(
            project=project_instance,
            pre_deliverable_type_id=pre_deliverable_type_id
        )
        return {
            'days_before': project_setting.days_before,
            'is_enabled': project_setting.is_enabled,
            'source': 'project'
        }
    except ProjectPreDeliverableSettings.DoesNotExist:
        pass

    # Check global settings
    try:
        global_setting = cls.objects.get(pre_deliverable_type_id=pre_deliverable_type_id)
        return {
            'days_before': global_setting.default_days_before,
            'is_enabled': global_setting.is_enabled_by_default,
            'source': 'global'
        }
    except cls.DoesNotExist:
        pass

    # Fall back to type defaults
    from deliverables.models import PreDeliverableType
    try:
        type_obj = PreDeliverableType.objects.get(id=pre_deliverable_type_id)
        return {
            'days_before': type_obj.default_days_before,
            'is_enabled': type_obj.is_active,
            'source': 'default'
        }
    except PreDeliverableType.DoesNotExist:
        return None

Create data migration to populate global settings for all existing PreDeliverableType instances. Add to core/admin.py with appropriate configuration.
```

---

### Step 6: Create Migration Strategy and Validation Commands
**Prompt for AI Agent:**
```
Create migration utilities and validation commands before implementing the generation service. This ensures data integrity during development and deployment.

Create Django management command 'validate_pre_deliverable_data' in core/management/commands/:
1. Check for orphaned PreDeliverableItem records (deliverable deleted but items remain)
2. Verify all generated_date calculations are correct using WorkingDaysService
3. Report inconsistencies between PreDeliverableItem.days_before and actual calculation
4. Check for duplicate pre-deliverable items (same deliverable+type combination)
5. Validate that all active PreDeliverableType instances have global settings

Create management command 'migrate_existing_deliverables' in deliverables/management/commands/:
1. Analyze all existing deliverables with dates
2. Generate pre-deliverable items for deliverables created before this feature
3. Use batch processing (process 100 deliverables at a time)
4. Skip deliverables with dates in the past (more than 30 days ago)
5. Provide detailed logging of what was created
6. Include dry-run option (--dry-run) to preview changes

Create management command 'cleanup_pre_deliverables' in deliverables/management/commands/:
1. Remove all pre-deliverable items (for rollback scenarios)
2. Require confirmation flag (--confirm) to prevent accidental execution
3. Export data to JSON before deletion for potential restoration
4. Log all deletion activity

Add database indexes for performance:
- PreDeliverableItem: INDEX on (deliverable_id, is_active, generated_date)
- PreDeliverableItem: INDEX on (generated_date, is_completed) for calendar queries
- ProjectPreDeliverableSettings: INDEX on (project_id, is_enabled)

Include comprehensive logging using Python logging module and follow Django command best practices.
```

---

### Step 7: Implement Pre-Deliverable Generation Service
**Prompt for AI Agent:**
```
Create a service class called PreDeliverableService in deliverables/services.py. This handles automatic generation and management of pre-deliverable items.

The service should use the WorkingDaysService from Step 1 and models from Steps 2-5.

Methods to implement:
1. generate_pre_deliverables(deliverable_instance):
   - Get effective settings for the deliverable's project
   - Create PreDeliverableItem for each enabled type
   - Use WorkingDaysService to calculate dates
   - Avoid creating duplicates (check existing items first)
   - Return list of created items

2. update_pre_deliverables(deliverable_instance, old_date, new_date):
   - Update generated_date for all related pre-deliverable items
   - Recalculate dates using WorkingDaysService
   - Handle case where new_date is None (delete items)
   - Return count of updated items

3. delete_pre_deliverables(deliverable_instance):
   - Remove all related PreDeliverableItem records
   - Log deletion activity
   - Return count of deleted items

4. regenerate_pre_deliverables(deliverable_instance):
   - Delete existing + generate new (useful for settings changes)
   - Preserve completion status where possible
   - Return summary of changes

5. get_upcoming_for_user(user, days_ahead=14):
   - Get pre-deliverable items for deliverables assigned to user
   - Filter by generated_date within days_ahead
   - Include parent deliverable and project info
   - Order by generated_date

Implementation requirements:
- Use Django transactions for data consistency
- Include comprehensive error handling and logging
- Add type hints for all methods
- Use select_related/prefetch_related for efficient queries
- Validate input parameters
- Include docstrings with usage examples

Create unit tests covering all methods and edge cases. Follow Python service layer best practices.
```

---

### Step 8: Add Django Signals for Automatic Generation
**Prompt for AI Agent:**
```
Create Django signals in deliverables/signals.py to automatically manage pre-deliverable items. Include throttling and performance considerations.

Signals to implement:

1. post_save signal for Deliverable model:
   @receiver(post_save, sender=Deliverable)
   def handle_deliverable_save(sender, instance, created, **kwargs):
   - On create: Generate pre-deliverables if date is set
   - On update: Check if date field changed, update pre-deliverables accordingly
   - Include throttling: don't regenerate if updated within last 5 minutes
   - Use cache to track recent regenerations

2. post_delete signal for Deliverable model:
   @receiver(post_delete, sender=Deliverable)
   def handle_deliverable_delete(sender, instance, **kwargs):
   - Clean up all related PreDeliverableItem records
   - Log deletion activity

3. post_save signal for ProjectPreDeliverableSettings model:
   @receiver(post_save, sender=ProjectPreDeliverableSettings)
   def handle_project_settings_change(sender, instance, created, **kwargs):
   - Regenerate pre-deliverables for affected project deliverables
   - Use Celery task for bulk operations (if available)
   - Limit to deliverables with future dates only

4. post_save signal for PreDeliverableGlobalSettings model:
   @receiver(post_save, sender=PreDeliverableGlobalSettings)
   def handle_global_settings_change(sender, instance, created, **kwargs):
   - Regenerate pre-deliverables for projects without custom settings
   - Queue as background task due to potential large scope

Signal safety measures:
- Use signal_kwargs to prevent infinite loops
- Include try/except blocks with proper logging
- Add signal.disconnect() during testing
- Use transaction.on_commit() for post-transaction execution
- Include rate limiting using Django cache

Connect signals in deliverables/apps.py ready() method. Add comprehensive error handling and logging throughout.

Include tests that verify signals fire correctly and handle edge cases safely.
```

---

### Step 9: Update Deliverable Serializers and Create API Endpoints
**Prompt for AI Agent:**
```
Update existing deliverable API and create new endpoints for pre-deliverable functionality. Ensure backward compatibility.

1. Create PreDeliverableItemSerializer in deliverables/serializers.py:
   - Include all fields from PreDeliverableItem model
   - Nest PreDeliverableType details (name, description)
   - Add computed fields: display_name, is_overdue, assigned_people
   - Include parent deliverable basic info (id, description, date)

2. Update DeliverableSerializer to include pre_items field:
   - Add SerializerMethodField for pre_items showing related PreDeliverableItem
   - Make it optional (only include when requested via query param ?include_pre_items=true)
   - Order pre_items by generated_date

3. Create PreDeliverableItemViewSet in deliverables/views.py:
   - List: Filter by deliverable, project, date_range, is_completed
   - Retrieve: Standard detail view
   - Update: Allow updating is_completed, notes, completed_date only
   - No create/delete (managed automatically)
   - Add custom action 'mark_completed' for easy completion

4. Add action to DeliverableViewSet:
   @action(detail=True, methods=['post'])
   def regenerate_pre_items(self, request, pk=None):
   - Manually regenerate pre-deliverable items for a deliverable
   - Return count of items created/updated

5. Create new calendar endpoint for pre-deliverable items:
   - URL: /api/deliverables/calendar-with-pre-items/
   - Include both deliverables and pre-deliverable items
   - Add 'item_type' field: 'deliverable' or 'pre_deliverable'
   - Maintain existing calendar API for backward compatibility

6. Add filtering and permissions:
   - Users can only see pre-deliverable items for deliverables they're assigned to
   - Managers can see all pre-deliverable items for their projects
   - Admins can see everything
   - Add proper DRF filtering backends

Update deliverables/urls.py to include new ViewSet. Add API documentation using drf-spectacular decorators. Follow existing API patterns for consistency.
```

---

### Step 10: Add Pre-Deliverable Settings to Existing Settings Page
**Prompt for AI Agent:**
```
Add a new "Pre-Deliverable Defaults" section to the existing Settings page (frontend/src/pages/Settings/Settings.tsx). This section should integrate seamlessly with the current role management and backup sections.

Updates to Settings.tsx:
1. Add new state for pre-deliverable settings:
   - preDeliverableTypes: Array of type definitions
   - globalSettings: Array of global settings
   - loading and error states

2. Add new section in the settings navigation:
   - Update the "Sections:" navigation to include "Pre-Deliverable Defaults"
   - Add anchor link: #pre-deliverable-defaults

3. Create new section after backup-restore section:
   - Title: "Pre-Deliverable Defaults"
   - Description: "Configure default timing for automatically generated pre-deliverable items"
   - Only show to admin users (auth.user?.is_staff)

4. Section content:
   - Table/grid showing each pre-deliverable type
   - Editable fields: default_days_before, is_enabled_by_default
   - Save/Reset buttons
   - Loading and success/error feedback

5. API integration:
   - Create API service methods in services/api.ts:
     - getPreDeliverableGlobalSettings()
     - updatePreDeliverableGlobalSettings(settings)
   - Use existing toast system for feedback
   - Follow existing error handling patterns

6. Form validation:
   - Ensure days_before is positive integer (1-30 range)
   - Provide clear validation messages
   - Disable save button when invalid

Styling requirements:
- Use existing VSCode dark theme colors from the Settings page
- Follow established card layout pattern: bg-[#2d2d30] border-[#3e3e42]
- Use existing form input styling
- Maintain responsive design patterns

Create corresponding Django API endpoints:
- GET /api/core/pre-deliverable-global-settings/
- PUT /api/core/pre-deliverable-global-settings/

Test the integration thoroughly and ensure it doesn't break existing Settings functionality.
```

---

### Step 11: Add Project-Specific Pre-Deliverable Settings to Project Form
**Prompt for AI Agent:**
```
Add project-specific pre-deliverable settings to the existing Project form (frontend/src/pages/Projects/ProjectForm.tsx).

Create new component ProjectPreDeliverableSettings.tsx in frontend/src/components/projects/:

Component structure:
1. Props: { projectId: number | null, onSettingsChange?: () => void }
2. State management for:
   - globalDefaults: Array of global settings for reference
   - projectSettings: Array of project-specific overrides
   - hasChanges: Boolean for unsaved changes tracking

3. UI sections:
   - Header: "Pre-Deliverable Settings" with description
   - Global defaults display (read-only, for reference)
   - Project overrides section with toggle for each type:
     - Enable/disable checkbox
     - Days before input (when enabled)
     - "Use global default" vs "Custom" radio buttons
   - Reset all to defaults button

4. API integration:
   - getProjectPreDeliverableSettings(projectId)
   - updateProjectPreDeliverableSettings(projectId, settings)
   - Handle both new projects (projectId=null) and existing projects

5. Form validation:
   - Days before must be 1-30
   - Show validation errors inline
   - Prevent save when invalid

Integration with ProjectForm.tsx:
1. Add ProjectPreDeliverableSettings component as new section
2. Position after basic project fields but before save buttons
3. Pass projectId from form state
4. Handle unsaved changes properly (warn on navigation)

Styling:
- Use existing project form styling patterns
- Card layout: bg-[#2d2d30] border-[#3e3e42]
- Form inputs match existing styling
- Clear visual distinction between global defaults and project overrides

Backend API endpoints to create:
- GET /api/projects/{id}/pre-deliverable-settings/
- PUT /api/projects/{id}/pre-deliverable-settings/
- For new projects, show global defaults only

Error handling:
- Network errors with retry options
- Validation errors with clear messaging
- Optimistic updates with rollback on failure

Include comprehensive testing and ensure form integration works smoothly.
```

---

### Step 12: Enhance Existing Calendar to Display Pre-Deliverable Items
**Prompt for AI Agent:**
```
Enhance the existing calendar component (frontend/src/pages/Deliverables/Calendar.tsx) to display pre-deliverable items with clear visual distinction from main deliverables.

Calendar API updates:
1. Modify the existing calendar API call to include pre-deliverable items
2. Use new endpoint: /api/deliverables/calendar-with-pre-items/?start={start}&end={end}
3. Maintain backward compatibility with existing calendar functionality

Visual enhancements to Calendar.tsx:
1. Update the DeliverableCalendarItem type to include:
   - item_type: 'deliverable' | 'pre_deliverable'
   - parent_deliverable_id?: number (for pre-deliverables)
   - pre_deliverable_type?: string

2. Modify the classify() function to handle pre-deliverable items:
   - Add new type: 'pre_deliverable'
   - Use different visual styling for pre-deliverable items

3. Update typeColors to include pre-deliverable styling:
   - pre_deliverable: '#64748b' (muted gray)
   - Use semi-transparent background for pre-deliverable items

4. Visual distinctions for pre-deliverable items:
   - Smaller height (reduced padding)
   - Dashed border style
   - Prefix with "PRE: " in the display text
   - Lighter opacity (70-80%)

5. Enhanced tooltips:
   - For pre-deliverables: show parent deliverable info
   - Include completion status
   - Show assigned team members

6. Add filtering controls:
   - Toggle button: "Show Pre-Deliverables" (default: true)
   - Filter dropdown: Pre-deliverable type filter
   - "My Items Only" toggle (show only user's assigned items)

7. Update the legend section:
   - Add pre-deliverable item explanation
   - Include visual sample of pre-deliverable styling
   - Update the "How to use" section

Interaction enhancements:
1. Click handler for pre-deliverable items:
   - Show modal with completion option
   - Display parent deliverable context
   - Allow adding notes

2. Hover effects:
   - Highlight parent deliverable when hovering pre-deliverable
   - Show connection lines (if feasible)

Performance considerations:
- Efficient rendering with large numbers of items
- Proper memoization of filtered data
- Lazy loading for date ranges outside viewport

Maintain all existing calendar functionality while seamlessly integrating pre-deliverable items. Test with various data scenarios to ensure performance remains acceptable.
```

---

### Step 13: Create Personal Pre-Deliverable Dashboard Widget
**Prompt for AI Agent:**
```
Create a personal pre-deliverable tracking widget for the main Dashboard page (frontend/src/pages/Dashboard.tsx).

Create new component UpcomingPreDeliverablesWidget.tsx in frontend/src/components/dashboard/:

Widget features:
1. Display upcoming pre-deliverable items for the logged-in user (next 14 days)
2. Show overdue pre-deliverable items prominently
3. Quick completion actions directly from widget
4. Link to full personal calendar view

Component structure:
1. Props: { className?: string }
2. API integration:
   - Use new endpoint: /api/calendar/personal-pre-deliverables/?days_ahead=14
   - Auto-refresh every 5 minutes
   - Handle loading and error states

3. Widget layout:
   - Header: "My Upcoming Pre-Deliverables" with count badge
   - Overdue section (if any): Red background, urgent styling
   - Upcoming section: Grouped by due date
   - "View All" link to full calendar

4. Item display:
   - Pre-deliverable type and parent deliverable name
   - Due date with relative timing ("Due tomorrow", "Due in 3 days")
   - Project name/client
   - Quick complete button (checkmark icon)
   - Notes field (if has notes)

5. Interactions:
   - Click item: Navigate to parent deliverable
   - Complete button: Mark as completed with API call
   - Quick add note functionality

Integration with Dashboard.tsx:
1. Add widget to existing dashboard layout
2. Position in appropriate grid location (consider screen sizes)
3. Use same styling patterns as existing dashboard cards

Styling requirements:
- Match existing dashboard card styling
- Use VSCode dark theme colors
- Overdue items: Red accent (#ef4444)
- Due soon (1-2 days): Amber accent (#f59e0b)
- Normal items: Default styling
- Completed items: Strikethrough with green accent

API endpoints to create:
- GET /api/calendar/personal-pre-deliverables/ (with filters)
- POST /api/pre-deliverable-items/{id}/complete/
- PATCH /api/pre-deliverable-items/{id}/ (for notes)

Error handling:
- Network failures with retry
- Optimistic updates for completion actions
- Clear feedback for user actions

Performance:
- Efficient queries (only user's assigned items)
- Proper caching/memoization
- Minimal re-renders

Include loading skeleton and empty state handling. Test thoroughly with various data scenarios.
```

---

### Step 14: Add Completion Tracking and Basic Reporting
**Prompt for AI Agent:**
```
Implement completion tracking workflow and basic reporting for pre-deliverable items.

Completion workflow enhancements:
1. Update PreDeliverableItemViewSet with completion actions:
   - POST /api/pre-deliverable-items/{id}/complete/
   - POST /api/pre-deliverable-items/{id}/uncomplete/
   - Validate user permissions (must be assigned to parent deliverable)
   - Auto-set completed_date and completed_by fields

2. Add bulk completion endpoint:
   - POST /api/pre-deliverable-items/bulk-complete/
   - Accept array of item IDs
   - Return success/failure counts

Create PreDeliverableReports component in frontend/src/pages/Reports/:
1. Project completion rates:
   - Chart showing completion % by project
   - Filter by date range and pre-deliverable type
   - Use existing chart library from the project

2. Team performance overview:
   - Table showing completion rates by person
   - Average days early/late completion
   - Most frequently missed pre-deliverable types

3. Time trend analysis:
   - Completion rate trends over time
   - Identify improvement or decline patterns

API endpoints for reporting:
- GET /api/reports/pre-deliverable-completion/
  - Query params: date_from, date_to, project_id, type_id
  - Return aggregated completion data
- GET /api/reports/pre-deliverable-team-performance/
  - Return per-person completion statistics
- GET /api/reports/pre-deliverable-trends/
  - Return time-series completion data

Project progress integration:
1. Add pre-deliverable progress to project detail views
2. Show completion status in project lists
3. Visual indicators for project health based on pre-deliverable adherence

Progress indicators to create:
- Circle progress charts for completion rates
- Red/yellow/green status based on overdue items
- Integration with existing project status badges

Database optimization:
- Add indexes for reporting queries:
  - (completed_date, is_completed)
  - (generated_date, completed_date)
  - (deliverable__project_id, is_completed)

Caching strategy:
- Cache report data for 15 minutes
- Use Redis if available, fallback to Django cache
- Invalidate cache on completion status changes

Follow existing reporting patterns in the codebase. Use efficient database queries with proper aggregation. Include export functionality (CSV) for reports.
```

---

### Step 15: Add Email Notification System for Pre-Deliverable Reminders
**Prompt for AI Agent:**
```
Implement an email notification system for pre-deliverable reminders using existing Celery infrastructure.

Notification models in core app (add to existing models.py):
1. NotificationPreference model:
   - user: OneToOneField to User with related_name='notification_preferences'
   - email_pre_deliverable_reminders: BooleanField(default=True)
   - reminder_days_before: PositiveIntegerField(default=1) - How many days before to send reminder
   - daily_digest: BooleanField(default=False) - Send daily digest vs individual emails
   - created_at, updated_at fields

2. NotificationLog model:
   - user: ForeignKey to User
   - pre_deliverable_item: ForeignKey to PreDeliverableItem (null=True for digest emails)
   - notification_type: CharField(choices=['reminder', 'digest', 'overdue'])
   - sent_at: DateTimeField
   - email_subject: CharField
   - success: BooleanField(default=True)

Celery tasks in core/tasks.py:
1. send_pre_deliverable_reminders():
   - Daily task to check for upcoming pre-deliverable items
   - Query items due within each user's reminder_days_before setting
   - Send individual emails or add to digest queue
   - Log all notification attempts

2. send_daily_digest():
   - Send consolidated daily digest emails
   - Include overdue items, due today, and upcoming items
   - Use HTML email template with good formatting

Email templates in core/templates/emails/:
1. pre_deliverable_reminder.html - Individual reminder
2. pre_deliverable_digest.html - Daily digest
3. Include both HTML and plain text versions

Settings integration:
1. Add notification preferences section to Settings page
2. Simple form with toggle switches and number input
3. API endpoints:
   - GET /api/accounts/notification-preferences/
   - PUT /api/accounts/notification-preferences/

Celery configuration:
1. Add to existing Celery setup in config/celery.py
2. Schedule daily task using Celery Beat:
   - send_pre_deliverable_reminders: Daily at 8 AM
   - send_daily_digest: Daily at 7 AM

Email configuration requirements:
- Use Django's existing email framework
- Respect user preferences (check email_pre_deliverable_reminders)
- Include unsubscribe functionality
- Handle email failures gracefully

Notification content:
- Clear subject lines with project context
- Include due dates and parent deliverable info
- Direct links to complete items or view in calendar
- Professional but friendly tone

Performance considerations:
- Batch email sending to avoid overwhelming mail server
- Use select_related for efficient queries
- Implement rate limiting if needed

Error handling:
- Log email failures with detailed error info
- Retry failed emails with exponential backoff
- Admin interface to view notification logs

Include comprehensive testing for email generation and delivery simulation.
```

---

### Step 16: Create Database Indexes and Performance Optimizations
**Prompt for AI Agent:**
```
Implement database indexes and performance optimizations for pre-deliverable functionality. This step focuses on ensuring the system performs well with large datasets.

Database indexes to create:
1. PreDeliverableItem indexes:
   - INDEX (deliverable_id, is_active, generated_date) - For deliverable detail queries
   - INDEX (generated_date, is_completed) - For calendar range queries
   - INDEX (is_completed, generated_date DESC) - For overdue item queries
   - INDEX (deliverable__project_id, generated_date) - For project reporting

2. ProjectPreDeliverableSettings indexes:
   - INDEX (project_id, is_enabled) - For settings lookup
   - INDEX (pre_deliverable_type_id, is_enabled) - For type-based queries

3. NotificationLog indexes:
   - INDEX (user_id, sent_at DESC) - For user notification history
   - INDEX (notification_type, sent_at) - For admin reporting

Create migration with proper index definitions:
```python
from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('deliverables', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL([
            "CREATE INDEX idx_predeliverable_deliverable_active_date ON deliverables_predeliverableitem(deliverable_id, is_active, generated_date);",
            "CREATE INDEX idx_predeliverable_calendar ON deliverables_predeliverableitem(generated_date, is_completed);",
            # ... other indexes
        ]),
    ]
```

Query optimizations:
1. Calendar queries:
   - Use select_related for deliverable and project info
   - Prefetch assigned people data
   - Implement date range pagination

2. Personal dashboard queries:
   - Filter at database level, not in Python
   - Use EXISTS subqueries for assignment checks
   - Limit results with LIMIT clause

3. Reporting queries:
   - Use database aggregation functions
   - Implement proper GROUP BY clauses
   - Cache expensive report calculations

Caching implementation:
1. Cache personal dashboard data for 5 minutes
2. Cache project settings for 30 minutes
3. Cache global settings for 1 hour
4. Use cache invalidation on settings changes

API response optimization:
1. Implement pagination for list endpoints
2. Add fields filtering (?fields=id,name,date)
3. Use compression for large responses
4. Add proper HTTP caching headers

Frontend performance:
1. Implement virtual scrolling for large calendar views
2. Debounce filter changes
3. Use React.memo for expensive components
4. Lazy load reporting components

Create performance monitoring:
1. Add logging for slow queries (>500ms)
2. Monitor API response times
3. Track database connection usage
4. Add metrics for calendar rendering time

Performance testing script:
- Create test data: 1000 deliverables, 10000 pre-deliverable items
- Test calendar queries with various date ranges
- Measure API response times under load
- Verify index usage with EXPLAIN ANALYZE

Create Django management command 'performance_test_pre_deliverables' to run performance tests and generate reports.

Document performance characteristics and recommended scaling approaches.
```

---

### Step 17: Frontend Testing and Quality Assurance
**Prompt for AI Agent:**
```
Create comprehensive frontend tests for the pre-deliverable items feature using the existing testing framework in the project.

First, analyze the existing test setup:
- Check package.json for testing dependencies
- Identify test runner (Jest, Vitest, etc.)
- Review existing test patterns in src/**/*.test.tsx files
- Use same testing utilities and patterns

Unit tests to create:

1. Component tests:
   - UpcomingPreDeliverablesWidget.test.tsx
   - ProjectPreDeliverableSettings.test.tsx
   - PreDeliverableReports.test.tsx
   - Enhanced Calendar component tests

2. API service tests:
   - Test pre-deliverable API service methods
   - Mock API responses and error scenarios
   - Verify proper error handling

3. Utility function tests:
   - Date calculation utilities
   - Pre-deliverable filtering logic
   - Form validation functions

Integration tests:
1. Settings page integration:
   - Test adding pre-deliverable settings section
   - Verify form submission and validation
   - Test admin-only visibility

2. Project form integration:
   - Test project-specific settings component
   - Verify settings save and load correctly
   - Test new project vs existing project workflows

3. Calendar integration:
   - Test pre-deliverable item display
   - Verify filtering functionality
   - Test hover and click interactions

4. Dashboard integration:
   - Test widget rendering with various data states
   - Verify completion actions work correctly
   - Test responsive behavior

End-to-end test scenarios:
1. Complete workflow test:
   - Create deliverable with date
   - Verify pre-deliverable items appear in calendar
   - Complete pre-deliverable items
   - Verify completion status updates

2. Settings workflow test:
   - Change global pre-deliverable defaults
   - Override settings at project level
   - Verify changes affect new deliverables

3. Personal workflow test:
   - View personal dashboard widget
   - Complete items from widget
   - Verify updates across all views

Accessibility testing:
1. Screen reader compatibility:
   - Test with screen reader simulation
   - Verify ARIA labels on interactive elements
   - Test keyboard navigation

2. Color contrast validation:
   - Verify pre-deliverable item colors meet WCAG standards
   - Test in high contrast mode
   - Validate focus indicators

3. Keyboard navigation:
   - Tab order through forms and calendars
   - Enter/Space activation of controls
   - Escape key handling for modals

Performance testing:
1. Calendar rendering performance:
   - Test with 1000+ calendar items
   - Measure render times
   - Verify virtual scrolling works

2. Dashboard widget performance:
   - Test with many upcoming items
   - Measure update frequency impact
   - Test auto-refresh behavior

Test data fixtures:
- Create reusable test data generators
- Mock various pre-deliverable scenarios
- Include edge cases (overdue items, complex projects)

Visual regression tests:
- Screenshot comparison for calendar view
- Settings page layout verification
- Dashboard widget appearance

Error boundary testing:
- Test component error handling
- Verify error boundaries catch failures
- Test network error scenarios

Setup and configuration:
- Use existing test configuration
- Add pre-deliverable test utilities
- Create shared mocks and fixtures
- Document test patterns for future development

Coverage requirements:
- Aim for 80%+ code coverage on new components
- Focus on business logic and user interactions
- Document any untested edge cases

Include clear documentation for running tests and interpreting results.
```

---

### Step 18: Documentation and Final Integration Testing
**Prompt for AI Agent:**
```
Create comprehensive documentation and perform final integration testing for the pre-deliverable items feature.

User Documentation:

1. Create frontend/docs/pre-deliverable-user-guide.md:
   - Overview of pre-deliverable items concept
   - How to configure global defaults (admin users)
   - Setting up project-specific rules
   - Using the enhanced calendar view
   - Personal dashboard widget usage
   - Completing pre-deliverable items workflow
   - Email notification preferences
   - Screenshots of key UI elements

2. Create backend/docs/pre-deliverable-admin-guide.md:
   - Database schema overview with ERD diagram
   - Migration procedures for production deployment
   - Performance tuning recommendations
   - Monitoring and troubleshooting
   - Backup considerations for new tables
   - Django admin interface usage

3. Create docs/pre-deliverable-api-reference.md:
   - Complete API endpoint documentation
   - Request/response examples
   - Authentication and permission requirements
   - Error codes and handling
   - Rate limiting information
   - Integration examples

Developer Documentation:

1. Service layer documentation:
   - PreDeliverableService class methods
   - WorkingDaysService usage patterns
   - Signal handling best practices
   - Testing utilities and fixtures

2. Frontend component documentation:
   - Component API reference
   - Props and state management
   - Styling and theming guidelines
   - Integration patterns

Configuration Reference:

1. Environment variables:
   - Email configuration for notifications
   - Cache settings for performance
   - Feature flags (if implemented)

2. Settings reference:
   - Model field descriptions
   - Default values and validation rules
   - Relationship diagrams

Final Integration Testing:

1. End-to-end system testing:
   - Complete user journey from deliverable creation to completion
   - Cross-browser compatibility (Chrome, Firefox, Safari, Edge)
   - Mobile responsiveness testing
   - Email delivery testing

2. Data integrity validation:
   - Run validation commands on test data
   - Verify foreign key constraints
   - Test cascade delete operations
   - Confirm unique constraints work properly

3. Performance validation:
   - Load test with realistic data volumes (1000+ deliverables)
   - API response time verification under concurrent load
   - Database query performance analysis
   - Frontend rendering performance with large datasets

4. Security review:
   - Authentication/authorization on all endpoints
   - Input validation and sanitization
   - SQL injection prevention verification
   - XSS prevention validation
   - CSRF protection confirmation

5. Notification testing:
   - Email template rendering in various clients
   - Notification timing accuracy
   - Unsubscribe functionality
   - Bounce handling

Production Deployment Checklist:

1. Pre-deployment preparation:
   - Database backup procedures
   - Feature flag configuration
   - Email server configuration
   - Cache configuration
   - Static file preparation

2. Migration execution plan:
   - Order of operations
   - Rollback procedures
   - Data validation steps
   - Performance monitoring setup

3. Post-deployment verification:
   - Smoke tests for all major features
   - Data integrity checks
   - Performance monitoring setup
   - Error tracking configuration

FAQ and Troubleshooting:

1. Common user questions:
   - Why aren't pre-deliverable items appearing?
   - How to customize pre-deliverable timing?
   - Email notification not working?

2. Technical troubleshooting:
   - Performance issues and solutions
   - Data inconsistency resolution
   - Integration problems
   - Known limitations and workarounds

Update main README.md:
- Add pre-deliverable feature overview
- Link to detailed documentation
- Update screenshots and feature list

Create deployment guide with step-by-step production rollout instructions, including health checks and monitoring setup.

Document any known limitations or areas identified for future enhancement, including estimated effort for each improvement.
```

## Summary

This corrected implementation plan addresses the 16 critical issues identified in the original plan:

**Key Corrections Made:**
- **Fixed Model Relationships**: Changed ProjectPreDeliverableSettings to use ForeignKey with unique constraints instead of impossible OneToOneField design
- **Avoided App Conflicts**: Used existing core app instead of creating conflicting 'settings' app
- **Proper Dependency Order**: Moved WorkingDaysService to Step 1 and restructured dependencies
- **Backward Compatibility**: Enhanced existing calendar API instead of breaking changes
- **Integration Focus**: Used existing Settings page and Project form structure
- **Performance First**: Added database indexes, caching, and optimization in Step 16
- **Migration Strategy**: Moved data migration planning to Step 6, before implementation

**Improved Architecture:**
- Logical step progression with proper dependencies
- Comprehensive testing strategy throughout
- Production-ready performance considerations
- Seamless integration with existing codebase patterns
- Proper error handling and rollback procedures

**Enhanced Implementation:**
- Each step includes specific validation and testing requirements
- Clear API versioning and backward compatibility measures
- Comprehensive documentation strategy
- Production deployment checklist and monitoring setup

The plan now provides a robust, scalable foundation for implementing pre-deliverable items while maintaining system stability and performance.