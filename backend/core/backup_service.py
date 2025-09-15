from __future__ import annotations

import gzip
import json
import logging
import os
import shutil
import subprocess
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

from django.conf import settings
from django.core.management import call_command

from .backup_utils import (
    BackupInfo,
    compute_sha256,
    discover_backups,
    meta_path_for,
    parse_filename,
)


class BackupService:
    """High-level backup/restore utilities with safety and retention.

    - Lists and validates backups under BACKUPS_DIR
    - Manages 'incoming' quarantine folder for uploads
    - Guards concurrency via lock files (.backup.lock / .restore.lock)
    - Wraps management commands to create/restore backups
    - Applies simple GFS-style retention (daily/weekly/monthly)
    """

    CONFIRM_PHRASE = "I understand this will irreversibly overwrite data"

    def __init__(self, backups_dir: Optional[str] = None) -> None:
        self.backups_dir = os.path.abspath(backups_dir or getattr(settings, "BACKUPS_DIR", "/backups"))
        self.incoming_dir = os.path.join(self.backups_dir, "incoming")
        os.makedirs(self.backups_dir, exist_ok=True)
        os.makedirs(self.incoming_dir, exist_ok=True)
        self.log = logging.getLogger("db")

    # -------- Path helpers --------
    def _abs(self, path: str) -> str:
        return os.path.abspath(path)

    def _ensure_under_backups(self, path: str) -> str:
        ap = self._abs(path)
        if not ap.startswith(self.backups_dir + os.sep):
            raise ValueError("Path must be under BACKUPS_DIR")
        return ap

    def _backups_path(self, filename: str) -> str:
        # Only filename allowed to avoid traversal
        base = os.path.basename(filename)
        return self._ensure_under_backups(os.path.join(self.backups_dir, base))

    # -------- Locking --------
    def lock_file(self, kind: str) -> str:
        if kind not in {"backup", "restore"}:
            raise ValueError("kind must be 'backup' or 'restore'")
        return os.path.join(self.backups_dir, f".{kind}.lock")

    def has_active_lock(self) -> bool:
        return any(os.path.exists(self.lock_file(k)) for k in ("backup", "restore"))

    def acquire_lock(self, kind: str) -> None:
        lf = self.lock_file(kind)
        if os.path.exists(lf):
            raise RuntimeError(f"{kind.capitalize()} already in progress")
        Path(lf).write_text(datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), encoding="utf-8")

    def release_lock(self, kind: str) -> None:
        lf = self.lock_file(kind)
        try:
            if os.path.exists(lf):
                os.remove(lf)
        except Exception:
            pass

    # -------- Listing --------
    def list_backups(self, include_hash: bool = False) -> List[Dict]:
        infos = discover_backups(self.backups_dir, include_hash=include_hash)
        return [asdict(i) for i in infos]

    def get_backup(self, filename: str, include_hash: bool = False) -> Optional[Dict]:
        path = self._backups_path(filename)
        if not os.path.exists(path):
            return None
        # Use discover to keep formatting consistent
        items = discover_backups(self.backups_dir, include_hash=include_hash)
        for it in items:
            if it.filename == os.path.basename(path):
                return asdict(it)
        return None

    def get_status(self) -> Dict:
        """Return coarse backup status for dashboards.

        Fields:
        - lastBackupAt: ISO timestamp of the newest backup (if any)
        - lastBackupSize: size in bytes
        - retentionOk: bool (at least one backup exists)
        - offsiteEnabled: bool from settings
        - offsiteLastSyncAt: null (placeholder)
        - policy: string description of retention policy
        - encryptionEnabled: bool (if encryption at rest is configured)
        - encryptionProvider: optional provider id (e.g., 'gpg'|'kms')
        """
        items = discover_backups(self.backups_dir, include_hash=False)
        last_at = None
        last_size = None
        if items:
            # items sorted by filename; compute max by createdAt
            newest = max(items, key=lambda i: i.createdAt or "")
            last_at = newest.createdAt
            last_size = newest.size
        return {
            "lastBackupAt": last_at,
            "lastBackupSize": last_size,
            "retentionOk": bool(items),
            "offsiteEnabled": bool(getattr(settings, 'BACKUP_OFFSITE_ENABLED', False)),
            "offsiteLastSyncAt": None,
            "policy": "daily=7 weekly=4 monthly=12",
            "encryptionEnabled": bool(getattr(settings, 'BACKUP_ENCRYPTION_ENABLED', False)),
            "encryptionProvider": getattr(settings, 'BACKUP_ENCRYPTION_PROVIDER', None),
        }

    # -------- Validation --------
    def validate_backup(self, path: str, verify_checksum: bool = True) -> Dict:
        ap = self._ensure_under_backups(path)
        if not os.path.exists(ap):
            raise FileNotFoundError(ap)

        fmt = "custom" if ap.endswith(".pgcustom") else ("plain" if ap.endswith(".sql.gz") else None)
        if not fmt:
            raise ValueError("Unsupported archive type")

        # Check structure
        if fmt == "custom":
            try:
                subprocess.run(["pg_restore", "-l", ap], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            except subprocess.CalledProcessError as e:
                raise ValueError("pg_restore -l failed; archive may be corrupt") from e
        else:
            # gzip header check
            with open(ap, "rb") as f:
                magic = f.read(2)
                if magic != b"\x1f\x8b":
                    raise ValueError("Not a valid gzip file")

        # Checksum vs sidecar if present
        sidecar = self._load_meta(ap)
        sha = None
        if verify_checksum:
            try:
                sha = compute_sha256(ap)
            except Exception:
                sha = None
        if sidecar and sidecar.get("sha256") and sha and sidecar["sha256"] != sha:
            raise ValueError("Checksum mismatch with sidecar metadata")

        return {
            "path": ap,
            "filename": os.path.basename(ap),
            "format": fmt,
            "size": os.path.getsize(ap),
            "sha256": sha or (sidecar or {}).get("sha256"),
            "description": (sidecar or {}).get("description"),
        }

    # -------- Incoming (quarantine) --------
    def incoming_path(self, original_filename: str) -> str:
        base = os.path.basename(original_filename)
        safe = self._sanitize_filename(base)
        return os.path.join(self.incoming_dir, safe)

    def store_incoming(self, src_path: str, original_filename: Optional[str] = None) -> str:
        dest = self.incoming_path(original_filename or os.path.basename(src_path))
        os.makedirs(self.incoming_dir, exist_ok=True)
        shutil.move(src_path, dest)
        return dest

    def promote_incoming(self, incoming_path: str) -> str:
        ap = os.path.abspath(incoming_path)
        if not ap.startswith(self.incoming_dir + os.sep):
            raise ValueError("Path must be under incoming/")
        # Validate first (without checksum to save time; caller may verify separately)
        try:
            self.validate_backup(ap, verify_checksum=False)
        except Exception as e:
            raise ValueError(f"Invalid incoming archive: {e}")
        target = os.path.join(self.backups_dir, os.path.basename(ap))
        if os.path.exists(target):
            # Avoid overwrite
            name, ext = os.path.splitext(os.path.basename(ap))
            target = os.path.join(self.backups_dir, f"{name}.{int(datetime.now().timestamp())}{ext}")
        shutil.move(ap, target)
        return target

    # -------- Create / Restore wrappers --------
    def create_backup(self, description: Optional[str] = None, fmt: str = "custom", filename: Optional[str] = None) -> Dict:
        # backup_database command already does locking and safety
        kwargs = {"description": description}
        if fmt:
            kwargs["format"] = fmt
        if filename:
            kwargs["filename"] = filename
        self.log.info("Starting backup", extra={"format": fmt})
        result = call_command("backup_database", **kwargs)
        self.log.info("Backup complete", extra={"filename": result.get("filename")})
        return result

    def restore_backup(
        self,
        filename: str,
        *,
        jobs: int = 2,
        migrate: bool = False,
        postvacuum: bool = False,
        confirm: Optional[str] = None,
    ) -> Dict:
        # Ensure path safety
        path = self._backups_path(filename)
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        if confirm is None:
            confirm = self.CONFIRM_PHRASE
        if confirm != self.CONFIRM_PHRASE:
            raise ValueError("Invalid confirmation phrase")
        # restore_database command handles locking and privileges
        self.log.warning("Starting restore", extra={"filename": os.path.basename(path)})
        result = call_command(
            "restore_database",
            path=path,
            jobs=jobs,
            migrate=migrate,
            postvacuum=postvacuum,
            confirm=confirm,
        )
        self.log.warning("Restore complete", extra={"filename": os.path.basename(path), "migrated": result.get("migrated")})
        return result

    # -------- Deletion --------
    def delete_backup(self, filename: str) -> bool:
        path = self._backups_path(filename)
        if not os.path.exists(path):
            return False
        meta = meta_path_for(path)
        # Avoid clobbering reserved logging attribute names like 'filename'
        self.log.warning("Deleting backup", extra={"backup_filename": os.path.basename(path)})
        os.remove(path)
        try:
            if os.path.exists(meta):
                os.remove(meta)
        except Exception:
            pass
        return True

    # -------- Retention --------
    def cleanup_retention(self, keep_daily: int = 7, keep_weekly: int = 4, keep_monthly: int = 12, dry_run: bool = False) -> Dict:
        items = discover_backups(self.backups_dir, include_hash=False)
        # Build map filename -> datetime
        def parse_iso(s: str) -> datetime:
            try:
                if s.endswith("Z"):
                    s = s[:-1] + "+00:00"
                return datetime.fromisoformat(s)
            except Exception:
                return datetime.now(timezone.utc)

        entries: List[Tuple[str, datetime]] = [(it.filename, parse_iso(it.createdAt)) for it in items]
        entries.sort(key=lambda t: t[1], reverse=True)

        keep: Set[str] = set()

        # Daily: latest per day
        seen_days: Set[Tuple[int, int, int]] = set()
        for name, dt in entries:
            key = (dt.year, dt.month, dt.day)
            if key not in seen_days:
                keep.add(name)
                seen_days.add(key)
                if len(seen_days) >= keep_daily:
                    break

        # Weekly: latest per ISO week
        seen_weeks: Set[Tuple[int, int]] = set()
        for name, dt in entries:
            iso = dt.isocalendar()
            key = (iso.year, iso.week)
            if key not in seen_weeks and name not in keep:
                keep.add(name)
                seen_weeks.add(key)
                if len(seen_weeks) >= keep_weekly:
                    break

        # Monthly: latest per month
        seen_months: Set[Tuple[int, int]] = set()
        for name, dt in entries:
            key = (dt.year, dt.month)
            if key not in seen_months and name not in keep:
                keep.add(name)
                seen_months.add(key)
                if len(seen_months) >= keep_monthly:
                    break

        deleted: List[str] = []
        for name, _ in entries:
            if name in keep:
                continue
            if not dry_run:
                try:
                    self.delete_backup(name)
                    deleted.append(name)
                except Exception as e:
                    self.log.error("Failed to delete backup", extra={"filename": name, "error": str(e)})
            else:
                deleted.append(name)

        return {
            "kept": sorted(keep),
            "deleted": deleted,
        }

    # -------- Internals --------
    def _load_meta(self, archive_path: str) -> Optional[dict]:
        try:
            with open(meta_path_for(archive_path), "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def _sanitize_filename(self, filename: str) -> str:
        base = os.path.basename(filename)
        # allow . .
        base = base.replace(" ", "-")
        base = "".join(ch for ch in base if ch.isalnum() or ch in {"_", "-", "."})
        base = base.strip("-_.") or "backup"
        return base
