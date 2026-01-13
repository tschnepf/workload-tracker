from __future__ import annotations

import os
import json
import subprocess  # nosec B404
import shutil
import sys
from datetime import datetime, timezone
from typing import Optional

from django.core.management.base import BaseCommand
from django.conf import settings

from core.backup_service import BackupService, meta_path_for
from core.notifications import notify_slack
from core.management.commands.restore_database import _env_for_pg


def _resolve_bin(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"{name} not found in PATH")
    return path


class Command(BaseCommand):
    help = (
        "Restore latest backup into a temporary database and run health checks. "
        "Disabled by default; enable with RESTORE_TEST_ENABLED=true."
    )

    def add_arguments(self, parser):
        parser.add_argument("--keep-db", action="store_true", help="Do not drop the temp database on completion")
        parser.add_argument("--timeout", type=int, default=3600, help="Max seconds to allow for restore + checks")

    def handle(self, *args, **opts):
        if os.getenv("RESTORE_TEST_ENABLED", "false").lower() != "true":
            self.stdout.write("Restore test disabled; skipping.")
            return ""

        svc = BackupService()
        # Skip if a real restore is in progress
        if os.path.exists(svc.lock_file("restore")):
            self.stdout.write("Restore lock present; skipping restore test.")
            return ""

        # Find latest backup
        items = svc.list_backups(include_hash=False)
        if not items:
            self.stdout.write(json.dumps({"error": "no_backups"}))
            return ""
        latest = max(items, key=lambda it: it.get("createdAt") or "")
        filename = latest.get("filename")
        path = os.path.join(svc.backups_dir, filename)

        # Build env for pg tools
        dsn = os.getenv("DB_ADMIN_URL") or os.getenv("DATABASE_URL")
        if not dsn:
            self.stdout.write(json.dumps({"error": "no_dsn"}))
            return ""
        env = _env_for_pg(dsn)

        # Create temp database
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        temp_db = f"restore_test_{ts}"
        try:
            subprocess.run([_resolve_bin("psql"), "-v", "ON_ERROR_STOP=1", "-c", f"CREATE DATABASE \"{temp_db}\" TEMPLATE template0;"], env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)  # nosec B603
        except subprocess.CalledProcessError as e:
            self.stdout.write(json.dumps({"error": "create_db_failed", "detail": e.stderr.decode("utf-8", "ignore")[:1000]}))
            return ""

        # Point env to the temp DB
        env_tmp = dict(env)
        env_tmp["PGDATABASE"] = temp_db

        success = False
        detail: Optional[str] = None
        try:
            # Restore
            if path.endswith(".pgcustom"):
                cmd = [_resolve_bin("pg_restore"), "--no-owner", "--no-privileges", "--if-exists", "--clean", "-j", "2", "-d", temp_db, path]
                proc = subprocess.run(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)  # nosec B603
                if proc.returncode != 0:
                    raise RuntimeError(proc.stderr[:2000])
            else:
                # .sql.gz -> stream into psql
                import gzip
                with gzip.open(path, "rb") as gz:
                    p = subprocess.Popen([_resolve_bin("psql"), "-v", "ON_ERROR_STOP=1"], env=env_tmp, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)  # nosec B603
                    if p.stdin is None:
                        try:
                            p.terminate()
                        except Exception:  # nosec B110
                            pass
                        raise RuntimeError("psql restore failed: no stdin pipe available")
                    import shutil
                    shutil.copyfileobj(gz, p.stdin)
                    try:
                        p.stdin.close()
                    except Exception:  # nosec B110
                        pass
                    out, err = p.communicate()
                    if p.returncode != 0:
                        raise RuntimeError((err or b"").decode("utf-8", "ignore")[:2000])

            # Run Django checks and migrate --check against temp DB via subprocess with DATABASE_URL override
            # Build DSN for Django (postgres://user:pass@host:port/dbname)
            user = env.get("PGUSER") or "postgres"
            pw = env.get("PGPASSWORD") or ""
            host = env.get("PGHOST") or "localhost"
            port = env.get("PGPORT") or "5432"
            dsn_tmp = f"postgresql://{user}:{pw}@{host}:{port}/{temp_db}"

            dj_env = os.environ.copy()
            dj_env["DATABASE_URL"] = dsn_tmp
            dj_env.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

            c1 = subprocess.run([sys.executable, "manage.py", "check"], env=dj_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)  # nosec B603
            if c1.returncode != 0:
                raise RuntimeError((c1.stderr or "")[:1000])
            c2 = subprocess.run([sys.executable, "manage.py", "migrate", "--check"], env=dj_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)  # nosec B603
            if c2.returncode != 0:
                raise RuntimeError((c2.stderr or "")[:1000])

            success = True
        except Exception as e:
            detail = str(e)
        finally:
            if not opts.get("keep_db"):
                try:
                    subprocess.run([_resolve_bin("psql"), "-v", "ON_ERROR_STOP=1", "-c", f"DROP DATABASE IF EXISTS \"{temp_db}\";"], env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)  # nosec B603
                except Exception:  # nosec B110
                    pass

        out = {"success": success, "database": temp_db, "filename": filename}
        if detail:
            out["detail"] = detail[:1000]
        self.stdout.write(json.dumps(out))
        try:
            notify_slack(f"Restore test: {'ok' if success else 'failed'} db={temp_db}")
        except Exception:  # nosec B110
            pass
        return ""
