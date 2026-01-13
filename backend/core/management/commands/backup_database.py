import os
import re
import json
import gzip
import shutil
import hashlib
import subprocess  # nosec B404
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.backup_utils import (
    build_paths,
    sanitize_part,
    compute_sha256,
    meta_path_for,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_dsn(dsn: str) -> dict:
    u = urlparse(dsn)
    # Handle postgres schemes
    if u.scheme not in {"postgres", "postgresql"}:
        raise CommandError("Unsupported DSN scheme; expected postgres or postgresql")
    return {
        "host": u.hostname or "localhost",
        "port": str(u.port or 5432),
        "user": u.username or "postgres",
        "password": u.password or "",
        "dbname": (u.path or "/").lstrip("/") or os.getenv("POSTGRES_DB", "postgres"),
    }


def _env_for_pg(dsn: str) -> dict:
    parts = _parse_dsn(dsn)
    env = os.environ.copy()
    # Avoid leaking credentials into argv; use env for libpq
    env.update({
        "PGHOST": parts["host"],
        "PGPORT": parts["port"],
        "PGUSER": parts["user"],
        "PGDATABASE": parts["dbname"],
    })
    if parts["password"]:
        env["PGPASSWORD"] = parts["password"]
    return env


def _resolve_pg_bin(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise CommandError(f"{name} not found in PATH")
    return path


def _estimate_db_size_bytes(env: dict) -> int | None:
    try:
        psql_bin = _resolve_pg_bin("psql")
        proc = subprocess.run(  # nosec B603
            [psql_bin, "-At", "-c", "SELECT pg_database_size(current_database());"],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True,
        )  # nosec B603
        s = proc.stdout.strip()
        return int(s) if s.isdigit() else None
    except Exception:
        return None


def _server_version(env: dict) -> str | None:
    try:
        psql_bin = _resolve_pg_bin("psql")
        proc = subprocess.run(  # nosec B603
            [psql_bin, "-At", "-c", "SHOW server_version;"],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True,
        )  # nosec B603
        return proc.stdout.strip() or None
    except Exception:
        return None


def _migrations_hash() -> str:
    h = hashlib.sha256()
    root = Path(settings.BASE_DIR)
    for app_dir in (root / "..").resolve().glob("backend/*/migrations"):
        if not app_dir.is_dir():
            continue
        for f in sorted(app_dir.glob("*.py")):
            try:
                data = f.read_bytes()
                h.update(f.as_posix().encode())
                h.update(b"\0")
                h.update(hashlib.sha256(data).digest())
            except Exception:  # nosec B112
                continue
    return h.hexdigest()


class Command(BaseCommand):
    help = "Create a database backup into settings.BACKUPS_DIR"

    def add_arguments(self, parser):
        parser.add_argument("--filename", type=str, help="Optional filename override (basename only)")
        parser.add_argument(
            "--format",
            type=str,
            choices=["custom", "plain"],
            default="custom",
            help="Backup format: custom (pg_dump -Fc) or plain (SQL gzipped)",
        )
        parser.add_argument("--description", type=str, default=None, help="Optional description stored in metadata")

    def handle(self, *args, **options):  # noqa: C901
        # Resolve DSN without ORM
        dsn = os.getenv("DB_ADMIN_URL") or os.getenv("DATABASE_URL")
        if not dsn:
            raise CommandError("DATABASE_URL not configured; cannot run pg_dump")
        env = _env_for_pg(dsn)

        backups_dir = str(getattr(settings, "BACKUPS_DIR", "/backups"))
        backups_dir_abs = os.path.abspath(backups_dir)
        os.makedirs(backups_dir_abs, exist_ok=True)
        if not (os.access(backups_dir_abs, os.W_OK) and os.access(backups_dir_abs, os.X_OK)):
            raise CommandError(f"Backups dir not writable: {backups_dir_abs}")

        # Preflight: free disk vs DB size
        try:
            usage = shutil.disk_usage(backups_dir_abs)
            free_bytes = usage.free
        except Exception:
            free_bytes = None
        est_bytes = _estimate_db_size_bytes(env)
        # Require 1.2x estimated size when available
        if est_bytes and free_bytes and free_bytes < int(est_bytes * 1.2):
            raise CommandError("Insufficient free disk space for backup")

        # Acquire lock
        lock_path = os.path.join(backups_dir_abs, ".backup.lock")
        if os.path.exists(lock_path):
            raise CommandError("Backup already in progress (.backup.lock present)")
        Path(lock_path).write_text(_now_iso(), encoding="utf-8")

        started = _now_iso()
        try:
            fmt = options.get("format") or "custom"
            description = options.get("description")
            user_filename = options.get("filename")

            # Build destination paths
            if user_filename:
                # Sanitize to basename; force correct extension
                base = os.path.basename(user_filename)
                base = re.sub(r"[^a-zA-Z0-9_.-]+", "-", base).strip("-._") or "backup"
                if fmt == "custom" and not base.endswith(".pgcustom"):
                    base += ".pgcustom"
                if fmt == "plain" and not base.endswith(".sql.gz"):
                    # If endswith .sql, convert to .sql.gz
                    base = re.sub(r"\.sql(\.gz)?$", "", base) + ".sql.gz"
                archive_path = os.path.abspath(os.path.join(backups_dir_abs, base))
                meta_path = meta_path_for(archive_path)
            else:
                app_part = os.getenv("APP_NAME", "workload-tracker")
                env_part = os.getenv("ENVIRONMENT", os.getenv("ENV", "dev"))
                dbname = _parse_dsn(dsn)["dbname"]
                archive_path, meta_path = build_paths(backups_dir_abs, app_part, env_part, dbname, fmt=fmt)

            # Safety: ensure archive lives under BACKUPS_DIR only
            if not archive_path.startswith(backups_dir_abs + os.sep):
                raise CommandError("Refusing to write backup outside BACKUPS_DIR")
            # Refuse MEDIA_ROOT or project paths
            media_root = str(getattr(settings, "MEDIA_ROOT", ""))
            base_dir = str(getattr(settings, "BASE_DIR", ""))
            if media_root and archive_path.startswith(os.path.abspath(media_root) + os.sep):
                raise CommandError("Refusing to write under MEDIA_ROOT")
            if base_dir and archive_path.startswith(os.path.abspath(base_dir) + os.sep):
                # BASE_DIR contains the backend app code; ensure not inside project tree
                # but allow when BASE_DIR is inside backups_dir (unlikely). We only block if parent is project.
                backups_abs = Path(backups_dir_abs).resolve()
                archive_abs = Path(archive_path).resolve()
                try:
                    archive_abs.relative_to(backups_abs)
                except Exception:
                    raise CommandError("Refusing to write backup inside project tree")

            # Build pg_dump command
            common_args = [
                _resolve_pg_bin("pg_dump"),
                "--no-owner",
                "--no-privileges",
            ]

            if fmt == "custom":
                cmd = common_args + ["-Fc", "-Z", "6", "-f", archive_path]
                subprocess.run(cmd, env=env, check=True)  # nosec B603
            else:
                # plain format -> pipe stdout to gzip
                cmd = common_args + ["-Fp"]
                with subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE) as proc, gzip.open(archive_path, "wb", compresslevel=6) as gz:  # nosec B603
                    if proc.stdout is None:
                        raise CommandError("pg_dump failed to produce output")
                    for chunk in iter(lambda: proc.stdout.read(1024 * 1024), b""):
                        gz.write(chunk)
                    ret = proc.wait()
                    if ret != 0:
                        raise CommandError(f"pg_dump exited with code {ret}")

            # Compute metadata
            size = os.path.getsize(archive_path)
            sha256 = compute_sha256(archive_path)
            finished = _now_iso()
            app_version = os.getenv("APP_VERSION") or (
                getattr(settings, "SPECTACULAR_SETTINGS", {}).get("VERSION") if hasattr(settings, "SPECTACULAR_SETTINGS") else None
            )
            db_version = _server_version(env)
            meta = {
                "appVersion": app_version,
                "migrationsHash": _migrations_hash(),
                "dbVersion": db_version,
                "startedAt": started,
                "finishedAt": finished,
                "size": size,
                "sha256": sha256,
                "format": fmt,
                "description": description,
            }
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(meta, f, indent=2, sort_keys=True)

            result = {
                "path": archive_path,
                "filename": os.path.basename(archive_path),
                "size": size,
                "sha256": sha256,
                "createdAt": started,
            }
            # Emit JSON to stdout so callers (Celery tasks/tests) can capture and parse
            try:
                self.stdout.write(json.dumps(result))
            except Exception:
                # Best effort
                self.stdout.write(json.dumps({"filename": os.path.basename(archive_path)}))
            return ""
        finally:
            try:
                if os.path.exists(lock_path):
                    os.remove(lock_path)
            except Exception:  # nosec B110
                pass
