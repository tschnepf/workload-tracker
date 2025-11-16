import os
import re
import json
import gzip
import shutil
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.core.management import call_command

from core.backup_utils import meta_path_for

try:  # pragma: no cover - defensive import
    from integrations.services import flag_connections_after_restore  # type: ignore
except Exception:  # pragma: no cover
    def flag_connections_after_restore(_meta):
        return False

CONFIRM_PHRASE = "I understand this will irreversibly overwrite data"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_dsn(dsn: str) -> dict:
    u = urlparse(dsn)
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
    # Prefer PGPASSFILE if provided; otherwise pass PGPASSWORD
    env.update({
        "PGHOST": parts["host"],
        "PGPORT": parts["port"],
        "PGUSER": parts["user"],
        "PGDATABASE": parts["dbname"],
    })
    if not env.get("PGPASSFILE") and parts["password"]:
        env["PGPASSWORD"] = parts["password"]
    return env


def _psql_ok(env: dict) -> bool:
    try:
        subprocess.run(["psql", "-At", "-c", "SELECT 1"], env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return False


def _read_sidecar(archive_path: str) -> dict | None:
    try:
        with open(meta_path_for(archive_path), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _current_migration_state(env: dict) -> dict:
    sql = "SELECT app, max(name) FROM django_migrations GROUP BY app ORDER BY app;"
    try:
        proc = subprocess.run(["psql", "-At", "-c", sql], env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        state = {}
        for line in proc.stdout.strip().splitlines():
            parts = line.split("|")
            if len(parts) == 2:
                state[parts[0]] = parts[1]
        return state
    except Exception:
        return {}


def _terminate_sessions(env: dict):
    dbname = env.get("PGDATABASE", "")
    sqls = [
        # Prevent new connections from PUBLIC (use psql var for dbname)
        "REVOKE CONNECT ON DATABASE :\"dbname\" FROM PUBLIC;",
        # Terminate other backends connected to this DB
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();",
    ]
    for sql in sqls:
        try:
            subprocess.run(
                [
                    "psql",
                    "-X",
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-v",
                    f"dbname={dbname}",
                    "-c",
                    sql,
                ],
                env=env,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            # Ignore if lacking privilege
            pass


def _drop_and_recreate_public(env: dict):
    sql = """
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO PUBLIC;
    """
    subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-c", sql], env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    # Optionally grant CREATE to an application role if provided
    import re as _re
    app_role = os.getenv("DB_APP_ROLE")
    if app_role and _re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", app_role):
        grant_sql = f'GRANT CREATE ON SCHEMA public TO "{app_role}";'
        try:
            subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-c", grant_sql], env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        except Exception:
            # Non-fatal if role is missing or lacks privileges
            pass


class Command(BaseCommand):
    help = "Restore database from a backup archive under BACKUPS_DIR"

    def add_arguments(self, parser):
        parser.add_argument("--path", required=True, help="Path to backup archive under BACKUPS_DIR")
        parser.add_argument("--jobs", type=int, default=2, help="Parallel jobs for pg_restore (custom format)")
        parser.add_argument("--migrate", action="store_true", help="Run manage.py migrate after restore if mismatched")
        parser.add_argument("--postvacuum", action="store_true", help="Run VACUUM ANALYZE after restore")
        parser.add_argument("--confirm", required=True, help=f"Confirmation phrase: {CONFIRM_PHRASE}")

    def handle(self, *args, **opts):  # noqa: C901
        confirm = opts.get("confirm")
        if confirm != CONFIRM_PHRASE:
            raise CommandError("Confirmation phrase mismatch. Aborting.")

        dsn = os.getenv("DB_ADMIN_URL") or os.getenv("DATABASE_URL")
        if not dsn:
            raise CommandError("DATABASE_URL not configured; cannot run restore")
        env = _env_for_pg(dsn)
        if not _psql_ok(env):
            raise CommandError("Cannot connect to database with provided credentials")

        backups_dir = os.path.abspath(str(getattr(settings, "BACKUPS_DIR", "/backups")))
        path_in = os.path.abspath(os.path.join(backups_dir, os.path.basename(opts["path"])) if not os.path.isabs(opts["path"]) else opts["path"])
        # Ensure within BACKUPS_DIR
        if not path_in.startswith(backups_dir + os.sep):
            raise CommandError("Refusing to restore from outside BACKUPS_DIR")
        if not os.path.exists(path_in):
            raise CommandError(f"Backup archive not found: {path_in}")

        fmt = "custom" if path_in.endswith(".pgcustom") else ("plain" if path_in.endswith(".sql.gz") else None)
        if not fmt:
            raise CommandError("Unsupported archive type. Expect .pgcustom or .sql.gz")

        # Validate custom archive
        if fmt == "custom":
            try:
                subprocess.run(["pg_restore", "-l", path_in], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            except subprocess.CalledProcessError as e:
                raise CommandError("pg_restore -l failed; archive may be corrupt") from e

        # Read sidecar and warn on mismatches
        sidecar = _read_sidecar(path_in) or {}
        current_hash = None
        try:
            # Recompute current migrations hash similarly to backup command
            import hashlib
            from pathlib import Path as _P
            h = hashlib.sha256()
            root = _P(settings.BASE_DIR)
            for app_dir in (root / "..").resolve().glob("backend/*/migrations"):
                if not app_dir.is_dir():
                    continue
                for f in sorted(app_dir.glob("*.py")):
                    try:
                        data = f.read_bytes()
                        h.update(f.as_posix().encode())
                        h.update(b"\0")
                        h.update(hashlib.sha256(data).digest())
                    except Exception:
                        continue
            current_hash = h.hexdigest()
        except Exception:
            pass

        if sidecar.get("migrationsHash") and current_hash and sidecar["migrationsHash"] != current_hash:
            self.stderr.write("Warning: migrationsHash mismatch between backup and current code.")

        # Acquire lock
        lock_path = os.path.join(backups_dir, ".restore.lock")
        if os.path.exists(lock_path):
            raise CommandError("Restore already in progress (.restore.lock present)")
        Path(lock_path).write_text(_now_iso(), encoding="utf-8")

        jobs = int(opts.get("jobs") or 2)
        migrated = False
        vacuumed = False

        try:
            # Prechecks
            try:
                self.stderr.write("PROGRESS 5 Prechecks")
            except Exception:
                pass
            # Session control best-effort
            _terminate_sessions(env)

            # Capture pre-restore migration state
            before_state = _current_migration_state(env)

            # Drop and recreate schema
            try:
                self.stderr.write("PROGRESS 25 Drop schema")
            except Exception:
                pass
            _drop_and_recreate_public(env)

            # Restore
            if fmt == "custom":
                # Determine total items for coarse progress (TOC lines)
                total_items = 0
                try:
                    toc = subprocess.run(["pg_restore", "-l", path_in], env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    total_items = len([ln for ln in toc.stdout.splitlines() if ln.strip() and not ln.lstrip().startswith(";")])
                except Exception:
                    total_items = 0
                cmd = [
                    "pg_restore",
                    "-j", str(max(1, jobs)),
                    "--no-owner",
                    "--no-privileges",
                    "--if-exists",
                    "--clean",
                    "-v",  # verbose for progress lines
                    "-d", env.get("PGDATABASE", ""),
                    path_in,
                ]
                try:
                    # Stream stderr to estimate progress
                    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    processed = 0
                    last_percent = 0
                    if proc.stderr is not None:
                        for line in proc.stderr:
                            # Heuristic: count creation/restoration messages
                            l = (line or "").strip().lower()
                            if l.startswith("pg_restore:"):
                                if any(tok in l for tok in ["creating ", "restoring ", "processing ", "creating table", "restoring data"]):
                                    processed += 1
                            # Emit progress when percentage increases
                            if total_items > 0:
                                percent = 30 + int(65 * processed / max(1, total_items))
                                percent = max(30, min(95, percent))
                                if percent > last_percent:
                                    last_percent = percent
                                    try:
                                        self.stderr.write(f"PROGRESS {percent} Restoring")
                                    except Exception:
                                        pass
                    ret_out, ret_err = proc.communicate()
                    if proc.returncode != 0:
                        raise subprocess.CalledProcessError(proc.returncode, cmd, output=ret_out, stderr=ret_err)
                except subprocess.CalledProcessError as e:
                    # Handle cross-version dumps containing GUCs unknown to the
                    # target server (e.g., transaction_timeout from PG17 -> PG15).
                    err = (e.stderr or b"").decode("utf-8", "ignore") if isinstance(e.stderr, (bytes, bytearray)) else (e.stderr or "")
                    if "transaction_timeout" in err.lower():
                        # Fallback: generate SQL with pg_restore, filter out
                        # offending SET commands, then apply via psql.
                        script_cmd = [
                            "pg_restore",
                            "--no-owner",
                            "--no-privileges",
                            "--if-exists",
                            "--clean",
                            "-f", "-",
                            path_in,
                        ]
                        gen = subprocess.run(script_cmd, env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                        script = []
                        for line in gen.stdout.splitlines():
                            ln = line.strip()
                            if ln.upper().startswith("SET TRANSACTION_TIMEOUT"):
                                continue
                            script.append(line)
                        script_text = "\n".join(script) + "\n"
                        try:
                            self.stderr.write("PROGRESS 60 Applying filtered script")
                        except Exception:
                            pass
                        apply = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1"], env=env, input=script_text, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                        if apply.returncode != 0:
                            raise CommandError(f"psql restore failed: {apply.stderr[:8000]}")
                    else:
                        raise CommandError(f"pg_restore failed: {err[:8000]}") from e
            else:
                # plain sql.gz
                with gzip.open(path_in, "rb") as gz:
                    try:
                        self.stderr.write("PROGRESS 30 Restoring")
                    except Exception:
                        pass
                    proc = subprocess.Popen(["psql", "-v", "ON_ERROR_STOP=1"], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    if proc.stdin is None:
                        # Defensive: avoid relying on assert (stripped under -O)
                        try:
                            proc.terminate()
                        except Exception:
                            pass
                        raise CommandError("psql restore failed: no stdin pipe available")
                    shutil.copyfileobj(gz, proc.stdin)
                    try:
                        proc.stdin.close()
                    except Exception:
                        pass
                    out, err = proc.communicate()
                    if proc.returncode != 0:
                        e = (err or b"").decode("utf-8", "ignore").strip()
                        raise CommandError(f"psql restore failed: {e[:8000]}")

            # Post-restore migration check
            after_state = _current_migration_state(env)
            try:
                self.stderr.write("PROGRESS 95 Post-restore")
            except Exception:
                pass
            if before_state != after_state and opts.get("migrate"):
                # Run migrations to align with current code
                call_command("migrate", interactive=False, verbosity=0)
                migrated = True

            if opts.get("postvacuum"):
                try:
                    subprocess.run(["psql", "-c", "VACUUM ANALYZE;"], env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    vacuumed = True
                except Exception:
                    pass

            try:
                flag_connections_after_restore(sidecar)
            except Exception:
                pass

            out = {
                "success": True,
                "restoredFrom": os.path.basename(path_in),
                "jobs": jobs if fmt == "custom" else 0,
                "migrated": migrated,
                "vacuumed": vacuumed,
            }
            try:
                self.stdout.write(json.dumps(out))
            except Exception:
                self.stdout.write(json.dumps({"success": True}))
            return ""
        finally:
            try:
                if os.path.exists(lock_path):
                    os.remove(lock_path)
            except Exception:
                pass
