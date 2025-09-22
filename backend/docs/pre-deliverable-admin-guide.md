Pre‑Deliverable Items — Admin Guide

Schema
- deliverables.PreDeliverableType: defines item types and default days‑before.
- deliverables.PreDeliverableItem: generated items linked to a Deliverable.
- projects.ProjectPreDeliverableSettings: per‑project overrides (enable + days_before).
- core.PreDeliverableGlobalSettings: global defaults used when no project override exists.
- core.NotificationPreference / core.NotificationLog: user‑level email prefs and audit log.

Migrations
- Types: 0006/0007 added types and seed; items: 0008; indexes: 0009.
- Project overrides: projects 0007/0008.
- Globals: core 0001/0002.
- Notifications: core 0003.

Commands
- core: validate_pre_deliverable_data
- deliverables: migrate_existing_deliverables, cleanup_pre_deliverables

Signals
- Generate/update pre‑items on deliverable create/date change.
- Regenerate on global/project settings changes (future dates only).

Performance
- Indexes on PreDeliverableItem for calendar queries.
- Caching at view level where appropriate.

Notifications
- Celery tasks send_pre_deliverable_reminders / send_daily_digest.
- Gate via env: PRED_ITEMS_NOTIFICATIONS_ENABLED / PRED_ITEMS_DIGEST_ENABLED.

