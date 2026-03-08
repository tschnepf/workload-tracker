# Changelog (Last 72 Hours)

Generated on 2026-03-08 for commits in the last 72 hours (`git log --since='72 hours ago'`).

## 1) `99dc8d27` - Project task completion mode + task-progress colors
- Added project-level task completion mode support (`quantity` vs `complete`) and task-progress color customization.
- Frontend template editor changed from a flat list to a vertical hierarchy: **Projects -> Tasks -> Departments** with expand/collapse controls.
- Added completion type controls in template editing.
- UI behavior change: project task screens now support binary **Complete** checkboxes for completion-mode workflows instead of quantity-only input.

## 2) `5da93304` - Push notifications foundation + mobile app controls
- Added initial push notification and PWA admin controls in **Settings -> Mobile**.
- Expanded profile push settings with richer controls and snooze options.
- New/updated frontend controls include push toggles and snooze action buttons in user settings surfaces.
- Backend added global push settings/VAPID support, APIs, models, and tests.

## 3) `a01da990` - Notification bell and in-app notifications (v1)
- Added notification bell to the top navigation bar, positioned **between “Install App” and “Log out.”**
- Bell dropdown introduced with quick actions:
  - **Mark all read**
  - Per-notification **Clear**
- Added channel preference matrix and in-app notification delivery plumbing.

## 4) `18072a09` - Notification defaults tightened
- Notification preference defaults shifted toward safer opt-in behavior (`false` defaults for several channels/events).
- Backend migration updated default preference initialization.

## 5) `15ed35b4` - Notification settings ordering/refactor
- Refactored notification setting structures and ordering around default values.
- Functional impact: cleaner consistency between frontend defaults and backend defaulting behavior.

## 6) `aedc91fc` - Bell dropdown bulk clear + quiet-hours defaults update
- Added **Clear all** action in the notification bell dropdown.
- Updated profile-level quiet-hours/weekend default settings.

## 7) `8caa1a53` - Notifications v2: tabs, full page, project mutes
- Bell dropdown upgraded with tabbed view and **View all** action.
- Added dedicated `/notifications` page with header actions:
  - **Mark All Read**
  - **Clear All**
- Added project mute controls in project settings/notifications UI.
- Backend added richer policy/delivery/template/analytics and mute support.

## 8) `e91ea3c9` - Major shell/theme update + backup automation UI
- Significant shell/theme refresh across app chrome and visual tokens.
- Added sidebar collapse/expand control (new sidebar toggle button behavior).
- Added mobile filter sheet trigger button in responsive views.
- Added backup automation controls in settings with explicit action buttons:
  - **Save Schedule**
  - **Reset**
- Backend introduced backup automation scheduling support.

## 9) `5a7549ae` - Skills access control + initial dashboard customization
- Restricted skills route/nav visibility to manager/admin roles.
- Added skills workspace and add-skill drawer flow.
- Introduced initial dashboard customization surface.

## 10) `e2160a22` - Dashboard edit/resize iteration + person skill detail panel
- Continued dashboard edit/resize architecture refactor.
- Added person skill detail panel UX and autosave hook integration.

## 11) `2b8f7c27` - Dashboard layout engine migration + edit affordances
- Migrated dashboard card layout flow to `react-grid-layout` style behavior.
- Added explicit dashboard edit-state entry via **Unlock Dashboard** control.
- Card-level movement/resizing affordances added:
  - **Move** handle
  - Resize drag interaction
- Split dashboard default definitions into dedicated modules for maintainability.

## 12) `aae8e2df` - Global department filter and personal summary widgetization
- Enabled global department filter behavior across more surfaces.
- Personal summary moved into widgetized dashboard layout.
- Skills split layout sizing and spacing adjustments.

## 13) `def41214` - People skills detail table interaction + schedule heatmap redesign
- People skills detail view shifted to table-like draggable row interactions between sections.
- **My Schedule** visual updated to a compact heatmap strip presentation.

## 14) `20bd6c5f` - Skill taxonomy rename
- Renamed skill progression taxonomy labels:
  - `development` -> `in_progress`
  - `learning` -> `goals`
- Applied consistently across frontend displays, forms, and backend contracts.

## 15) `e6f8541d` - Skills default view and interaction flow update
- Changed default skills mode to **People -> Skills**.
- **Skill -> People** view now uses selection + detail-pane pattern.
- Added/updated mobile drawer detail behavior for skill/person context.

## 16) `ae68ff32` - New Person Report page
- Added new report route/page: `/reports/person-report`.
- Updated sidebar/report navigation entries to surface Person Report.
- Departments report card links now route into the new person-report flow.
- Backend added person report models/APIs/sync paths.

## 17) `d4c2404f` - Settings navigation regroup + logs/general surfaces + visibility scope
- Settings navigation reorganized into collapsible groups:
  - Company
  - Projects
  - Admin
- Added new **General** and **Logs** settings surfaces.
- Logs view added header actions/buttons:
  - **Refresh**
  - **Save**
  - Tabbed log sections
- Moved network graph exclusion controls into General settings.
- Backend introduced project visibility scoping (`visibility_scope`) and applied scoped filtering across analytics/dashboards/reports.

## 18) `1d1fe0ae` - Frontend theme hardening and token standardization
- Introduced typed copy catalog and typed theme contracts.
- Expanded semantic token use and focus-ring standardization across frontend components.
- Added status color fallback tokenization for safer theming.
- Included supporting docs/scripts cleanup and updates.

## Notes
- Total commits included: **18**
- Scope window: last 72 hours from generation time.
