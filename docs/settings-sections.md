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
| Deliverable Phase Mapping | `DeliverablePhaseMappingSection` | Yes | None | `/api/core/deliverable_phase_mapping/` | Defines SD/DD/IFP/IFC token + percentage rules |
| Deliverable Task Templates | `DeliverableTaskTemplatesSection` | Yes | None | `/api/deliverables/task_templates/`, departments list | Spreadsheet-style task template editor |
| Calendar Feeds | `CalendarFeeds` | Yes | None | `/api/personal/calendar-feed` | Provides ICS tokens |
| Create User & Admin User Table | Inline JSX + `authApi` calls | Yes | None | `authApi` (create user, invite, list, role/person updates, delete) | Includes invite resend, delete, linked person selection |
| Backup & Restore | `BackupOverview`, `BackupManagement`, `RestoreManagement` | Yes | None | `/api/backups/*` endpoints | Anchor `#backup-restore` | 
| Admin Audit Log | Inline table | Yes | None | `authApi.listAdminAudit` | Refresh button triggers fetch |
| Project Audit Log | Inline table | Yes | None | `projectsApi.listProjectAudit` | Creation/deletion history for projects |
| Integrations Hub | `IntegrationsSection` | Yes | `caps.integrations.enabled` | `integrationsApi` (secret key, providers, connections, mapping, rules, jobs, matching) | Secret-key gate, provider cards, connection attention banner, matching wizard, job filters + retry |

## Regression Scenarios

1. Create/Edit/Delete/Reorder roles (including modal validation and toast messaging).
2. Utilization scheme editing (admin) and read-only view for non-admins.
3. Department Project Roles listing and CRUD (when capability flag enabled/disabled).
4. Pre-Deliverables backfill trigger (admin-only) and its status messaging.
5. Deliverable Phase Mapping: load/save, validation errors, and persistence.
6. Deliverable Task Templates: add/edit/remove rows, department dropdown, status dropdowns, save flow.
7. Calendar feed generation/regeneration, copy link, and revoke actions.
8. Create user form: username/email/password/role/person fields, success/error toasts, inputs reset.
9. Admin user table:
   - Change role (guard minimum admin constraint).
   - Link/unlink person dropdown.
   - Resend invite button state.
   - Delete user and associated confirmation.
10. Backup overview stats render and backup list interactions (download/delete).
11. Backup creation, upload-restore, and status refresh flows.
12. RestoreManagement action guardrails (warnings, disabled state when another restore runs).
13. Admin audit log refresh, loading spinner, empty-state message.
14. Project audit log refresh, loading spinner, empty-state message.
15. Quick navigation links (`#role-management`, `#backup-restore`) still deep link until redirects are in place.
16. Integrations secret-key flow: locked state shows instructions, generate/save works, unlocking triggers provider fetch.
17. Integrations provider/connection management: add connection modal, disable/enable toggle, “Mark tokens invalid” button, and the admin attention banner actions (revoke tokens, force reconnect, disable/enable).
18. Mapping + rule config: field toggles, client sync policy select, save rule, save mapping, and initial matching wizard load/edit/save (including enable-rule toggle).
19. Sync controls: worker outage banner, job metric cards, status/object filters, refresh button, job retry action, and Post-restore Resync modal.

### Split-Pane Specific Checks

- Verify the split-pane nav search filters sections and selection persists on reload (localStorage + `?section=` param).
- Ensure legacy anchors redirect to the matching section when visiting links such as `/settings#backup-restore`.
- Confirm the `VITE_SETTINGS_SPLITPANE` flag can disable the split-pane to fall back to sequential cards without breaking functionality.

This inventory must stay updated as new sections are added so the split-pane navigation metadata and regression checklist remain accurate.
