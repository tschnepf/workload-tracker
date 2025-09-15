from __future__ import annotations

import os
import json
from django.core.management.base import BaseCommand
from django.conf import settings
from core.backup_service import BackupService
from core.notifications import notify_slack


def _int_env(name: str, default: int) -> int:
    try:
        v = os.getenv(name)
        return int(v) if v and str(v).isdigit() else default
    except Exception:
        return default


class Command(BaseCommand):
    help = "Enforce backup retention (daily/weekly/monthly). Safe during normal ops; skips during restore."

    def add_arguments(self, parser):
        parser.add_argument("--daily", type=int, default=None, help="Keep N daily backups (default from env or 7)")
        parser.add_argument("--weekly", type=int, default=None, help="Keep N weekly backups (default from env or 4)")
        parser.add_argument("--monthly", type=int, default=None, help="Keep N monthly backups (default from env or 12)")
        parser.add_argument("--dry-run", action="store_true", help="Do not delete; just report what would be removed")

    def handle(self, *args, **opts):
        svc = BackupService()
        # Skip if a restore is in progress
        if os.path.exists(svc.lock_file("restore")):
            self.stdout.write("Restore lock present; skipping cleanup.")
            return ""

        keep_daily = opts.get("daily") if opts.get("daily") is not None else _int_env("BACKUP_RETENTION_DAILY", 7)
        keep_weekly = opts.get("weekly") if opts.get("weekly") is not None else _int_env("BACKUP_RETENTION_WEEKLY", 4)
        keep_monthly = opts.get("monthly") if opts.get("monthly") is not None else _int_env("BACKUP_RETENTION_MONTHLY", 12)
        dry_run = bool(opts.get("dry_run"))

        result = svc.cleanup_retention(keep_daily, keep_weekly, keep_monthly, dry_run=dry_run)
        summary = {
            "policy": {"daily": keep_daily, "weekly": keep_weekly, "monthly": keep_monthly},
            "deleted": result.get("deleted", []),
            "kept_count": len(result.get("kept", [])),
        }
        self.stdout.write(json.dumps(summary))
        # Non-blocking notification
        try:
            notify_slack(f"Retention cleanup: deleted={len(summary['deleted'])} kept={summary['kept_count']}")
        except Exception:
            pass
        return ""
