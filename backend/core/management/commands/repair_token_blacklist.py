from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.db import connections
from django.db.utils import OperationalError
from django.conf import settings
import time
from django.core.management import call_command
import os


EXPECTED_OUTSTANDING_COLS = {"id", "user_id", "jti", "token", "created_at", "expires_at"}
EXPECTED_BLACKLISTED_COLS = {"id", "token_id", "blacklisted_at"}


class Command(BaseCommand):
    help = (
        "Verify and repair SimpleJWT token_blacklist tables (dev-safe). "
        "If schema mismatch is detected, drops token_blacklist tables and re-applies migrations."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Run without prompting (intended for containers/CI).",
        )

    def _is_postgres_engine(self) -> bool:
        try:
            engine = settings.DATABASES.get('default', {}).get('ENGINE', '')
        except Exception:
            engine = ''
        return 'postgresql' in engine

    def _wait_for_db(self, timeout: int = None, interval: float = None) -> bool:
        timeout = int(os.getenv('DB_WAIT_TIMEOUT_SECS', str(timeout or 60)))
        interval = float(os.getenv('DB_WAIT_SLEEP_SECS', str(interval or 1)))
        start = time.time()
        while True:
            try:
                connections['default'].ensure_connection()
                return True
            except OperationalError:
                if time.time() - start >= timeout:
                    return False
                time.sleep(interval)

    def handle(self, *args, **options):
        if not self._is_postgres_engine():
            self.stdout.write('PostgreSQL engine not detected; skipping token_blacklist repair.')
            return ""
        if not self._wait_for_db():
            self.stdout.write(self.style.WARNING('Database unreachable after wait; skipping token_blacklist repair.'))
            return ""
        # Opt-in via env in production; default true in dev
        auto_fix = os.getenv("AUTO_FIX_JWT_BLACKLIST", "true").lower() == "true"
        if not auto_fix:
            self.stdout.write("AUTO_FIX_JWT_BLACKLIST is disabled; skipping.")
            return ""

        import re as _re
        schema_env = os.getenv("DB_SCHEMA", "public") or "public"
        schema = schema_env.lower()
        if not _re.match(r"^[a-z0-9_]+$", schema):
            self.stdout.write("Invalid DB_SCHEMA; defaulting to 'public'.")
            schema = "public"

        needs_repair = False
        with connection.cursor() as cursor:
            # Check if tables exist
            cursor.execute(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = %s AND table_name = 'token_blacklist_outstandingtoken'
                )
                """,
                [schema],
            )
            has_outstanding = bool(cursor.fetchone()[0])
            cursor.execute(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = %s AND table_name = 'token_blacklist_blacklistedtoken'
                )
                """,
                [schema],
            )
            has_blacklisted = bool(cursor.fetchone()[0])

            if has_outstanding:
                cursor.execute(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = 'token_blacklist_outstandingtoken'
                """,
                    [schema],
                )
                cols = {r[0] for r in cursor.fetchall()}
                if not EXPECTED_OUTSTANDING_COLS.issubset(cols):
                    needs_repair = True

            if has_blacklisted:
                cursor.execute(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = 'token_blacklist_blacklistedtoken'
                """,
                    [schema],
                )
                cols = {r[0] for r in cursor.fetchall()}
                if not EXPECTED_BLACKLISTED_COLS.issubset(cols):
                    needs_repair = True

        if not (has_outstanding or has_blacklisted):
            # Tables don't exist yet; a normal migrate will create them
            self.stdout.write("token_blacklist tables not present; no repair needed.")
            return ""

        if not needs_repair:
            self.stdout.write("token_blacklist tables look OK; no action taken.")
            return ""

        # Confirm or proceed
        if not options.get("yes") and os.isatty(0):
            resp = input("Schema mismatch detected for token_blacklist. Drop and recreate tables? [y/N]: ").strip().lower()
            if resp not in {"y", "yes"}:
                self.stdout.write("Aborted.")
                return ""

        self.stdout.write("Repairing token_blacklist schema (dropping and re-migrating)...")
        with transaction.atomic():
            with connection.cursor() as cursor:
                # Safe to interpolate because schema is regex-validated to [a-z0-9_]+
                cursor.execute(f"DROP TABLE IF EXISTS {schema}.token_blacklist_blacklistedtoken CASCADE;")
                cursor.execute(f"DROP TABLE IF EXISTS {schema}.token_blacklist_outstandingtoken CASCADE;")

        # Reset just this app and re-apply migrations
        call_command("migrate", "token_blacklist", "zero", fake=True, verbosity=0)
        call_command("migrate", "token_blacklist", verbosity=0)
        self.stdout.write(self.style.SUCCESS("token_blacklist schema repaired."))
        return ""
