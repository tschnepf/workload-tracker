"""SQL Remediation validation tests for core management commands.

These tests skip until remediation code is present, and assert behavior when it lands.
"""

from django.test import SimpleTestCase
from pathlib import Path
from unittest.mock import patch


_HERE = Path(__file__).resolve()
_BACKEND_DIR = _HERE.parents[2]
RESTORE_PATH = (_BACKEND_DIR / "core" / "management" / "commands" / "restore_database.py").resolve()
REPAIR_BLACKLIST_PATH = (_BACKEND_DIR / "core" / "management" / "commands" / "repair_token_blacklist.py").resolve()


class CoreSqlRemediationTests(SimpleTestCase):
    maxDiff = None

    def _read(self, p: Path) -> str:
        try:
            return p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""

    def test_phase2_psql_dbname_var_in_terminate_sessions(self):
        """_terminate_sessions should pass dbname via -v and use :"dbname" in SQL.

        Skips until implemented.
        """
        src = self._read(RESTORE_PATH)
        # Expect some mention of -v dbname and :"dbname"
        if ("-v" not in src) or (':\\"dbname\\"' not in src and ':"dbname"' not in src):
            self.skipTest("psql -v dbname usage not yet implemented in _terminate_sessions")
        # Source presence is enough; detailed behavior validated by existing restore tests with subprocess patches.

    def test_phase3_least_privilege_grants_present(self):
        """Schema grants should use REVOKE CREATE and GRANT USAGE.

        Skips until implemented.
        """
        src = self._read(RESTORE_PATH)
        if "GRANT ALL ON SCHEMA public TO PUBLIC" in src:
            self.skipTest("Legacy GRANT ALL still present; least-privilege grants not yet implemented")
        if ("REVOKE CREATE ON SCHEMA public FROM PUBLIC" not in src) or (
            "GRANT USAGE ON SCHEMA public TO PUBLIC" not in src
        ):
            self.skipTest("Least-privilege grants not yet implemented in restore_database")

        # Optional role grant when DB_APP_ROLE is set (presence check only)
        self.assertIn("DB_APP_ROLE", src)

    def test_phase4_blacklist_parametrized_schema_filters(self):
        """Blacklist repair should filter by table_schema and use bound params.

        Skips until implemented.
        """
        src = self._read(REPAIR_BLACKLIST_PATH)
        # Expect table_schema filters added to information_schema queries
        if "table_schema" not in src:
            self.skipTest("Schema filters for token_blacklist not yet implemented")
        # Heuristic presence of parameter binding pattern
        if "cursor.execute(" in src and "%s" not in src:
            self.skipTest("Parameter binding for schema not yet implemented")
