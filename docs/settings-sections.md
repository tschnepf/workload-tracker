# Settings Sections Inventory

This document captures every current Settings section, the data/state it depends on, gating rules, and regression scenarios that must continue to work after the split-pane refactor.

## Shared State & Effects

- `roles`/`loading`/`reorderMode`: fetched in `useAuthenticatedEffect`, mutated when reordering or creating/editing roles.
- `showRoleForm`, `editingRole`, `deletingRole`: drive the `RoleForm` and `RoleDeleteConfirm` modals (must move with the Role Management section).
- `peopleOptions`: populated via `peopleApi.autocomplete`, used by the “Create User” and “Linked Person” selectors.
- `users`, `usersLoading`, `usersMsg`: drive the admin user table, invites, and role/person updates.
- `createBusy`, `createMsg`, `inviteBusy`, `audit`, `auditLoading`, `caps`: additional shared bits that sections need from a central context/store.
- Toast bus (`showToast`) and error handling are scattered throughout; the new `SettingsSectionFrame` should centralize messaging where possible.

## Anchor References

- `#role-management` (Quick nav link in Settings page)
- `#backup-restore` (Quick nav link in Settings page)

No other repo references were found via `rg -n "#role" -g"*.md"`.

## Sections

| Section | Component(s) | Admin Required | Feature Flag/Capability | Data Sources | Notes |
| --- | --- | --- | --- | --- | --- |
| Role Management | `RoleList`, `RoleForm`, `RoleDeleteConfirm` | No (but creation/editing limited by backend perms) | None | `rolesApi`, local modal state | Handles reordering, add/edit/delete, uses `reorderMode` |
| Utilization Scheme | `UtilizationSchemeEditor` | Editable only for admins | None | `useUtilizationScheme` (internal) | Read-only view for non-admins |
| Department Project Roles | `DepartmentProjectRolesSection` | Yes | `caps.projectRolesByDepartment` | `deptProjectRolesApi` | Hidden when capability disabled |
| Pre-Deliverables Backfill | `PreDeliverablesBackfill` | Yes | None | `deliverables` endpoints | Shares card with Calendar Feeds today |
| Calendar Feeds | `CalendarFeeds` | Yes | None | `/api/personal/calendar-feed` | Provides ICS tokens |
| Create User & Admin User Table | Inline JSX + `authApi` calls | Yes | None | `authApi` (create user, invite, list, role/person updates, delete) | Includes invite resend, delete, linked person selection |
| Backup & Restore | `BackupOverview`, `BackupManagement`, `RestoreManagement` | Yes | None | `/api/backups/*` endpoints | Anchor `#backup-restore` | 
| Admin Audit Log | Inline table | Yes | None | `authApi.listAdminAudit` | Refresh button triggers fetch |

## Regression Scenarios

1. Create/Edit/Delete/Reorder roles (including modal validation and toast messaging).
2. Utilization scheme editing (admin) and read-only view for non-admins.
3. Department Project Roles listing and CRUD (when capability flag enabled/disabled).
4. Pre-Deliverables backfill trigger (admin-only) and its status messaging.
5. Calendar feed generation/regeneration, copy link, and revoke actions.
6. Create user form: username/email/password/role/person fields, success/error toasts, inputs reset.
7. Admin user table:
   - Change role (guard minimum admin constraint).
   - Link/unlink person dropdown.
   - Resend invite button state.
   - Delete user and associated confirmation.
8. Backup overview stats render and backup list interactions (download/delete).
9. Backup creation, upload-restore, and status refresh flows.
10. RestoreManagement action guardrails (warnings, disabled state when another restore runs).
11. Admin audit log refresh, loading spinner, empty-state message.
12. Quick navigation links (`#role-management`, `#backup-restore`) still deep link until redirects are in place.

### Split-Pane Specific Checks

- Verify the split-pane nav search filters sections and selection persists on reload (localStorage + `?section=` param).
- Ensure legacy anchors redirect to the matching section when visiting links such as `/settings#backup-restore`.
- Confirm the `VITE_SETTINGS_SPLITPANE` flag can disable the split-pane to fall back to sequential cards without breaking functionality.

This inventory must stay updated as new sections are added so the split-pane navigation metadata and regression checklist remain accurate.
