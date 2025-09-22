Pre‑Deliverable API Reference

Endpoints

Deliverables
- GET /api/deliverables/calendar_with_pre_items/?start&end&mine_only&type_id
  • Returns array of union items { itemType: 'deliverable' | 'pre_deliverable', ... }.

- GET /api/deliverables/personal_pre_deliverables/?days_ahead=14
  • Returns upcoming items for the authenticated user.

Pre‑Deliverable Items
- GET /api/deliverables/pre_deliverable_items/?deliverable=&project=&type_id=&start=&end=&is_completed=&is_active=&mine_only=
- PATCH /api/deliverables/pre_deliverable_items/{id}/ { isCompleted, completedDate, notes }
- POST /api/deliverables/pre_deliverable_items/{id}/complete/
- POST /api/deliverables/pre_deliverable_items/{id}/uncomplete/
- POST /api/deliverables/pre_deliverable_items/bulk_complete/ { ids: number[] }

Core (Admin)
- GET /api/core/pre-deliverable-global-settings/
- PUT /api/core/pre-deliverable-global-settings/ { settings: [{ typeId, defaultDaysBefore, isEnabledByDefault }] }

Projects
- GET /api/projects/{id}/pre-deliverable-settings/
- PUT /api/projects/{id}/pre-deliverable-settings/ { settings: [{ typeId, isEnabled, daysBefore|null }] }

Accounts
- GET /api/accounts/notification-preferences/
- PUT /api/accounts/notification-preferences/ { emailPreDeliverableReminders, reminderDaysBefore, dailyDigest }

