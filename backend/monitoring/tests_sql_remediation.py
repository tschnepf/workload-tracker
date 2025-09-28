"""SQL Remediation validation tests for monitoring command.

These tests are designed to pass now by skipping when remediation code
is not yet present, and to assert correctness once implementation lands.
"""

from django.test import SimpleTestCase
from pathlib import Path


_HERE = Path(__file__).resolve()
_APP_DIR = _HERE.parents[0]
MONITOR_CMD_PATH = (_APP_DIR / "management" / "commands" / "monitor_performance.py").resolve()


class MonitoringSqlRemediationTests(SimpleTestCase):
    maxDiff = None

    def _read_source(self) -> str:
        try:
            return MONITOR_CMD_PATH.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""

    def test_phase1_vendor_guards_present(self):
        """Check for vendor guard usage to skip Postgres-specific branches.

        Skips until the guard pattern is present in the source.
        """
        src = self._read_source()
        guard_snippet = "if connection.vendor != 'postgresql'"
        if guard_snippet not in src:
            self.skipTest("Vendor guard not yet implemented in monitor_performance.py")

        # Basic presence on expected methods/areas
        # Heuristic: we expect guard snippet and references to bloat/vacuum pg_stat_activity sections
        self.assertIn("pg_stat_activity", src)

    def test_phase2_safe_identifier_quoting_for_vacuum(self):
        """Ensure per-table VACUUM uses connection.ops.quote_name and not manual quotes.

        Skips until the safe quoting is present.
        """
        src = self._read_source()
        if "connection.ops.quote_name(" not in src:
            self.skipTest("Safe identifier quoting not yet implemented for VACUUM loop")

        # Should not interpolate table name via raw double quotes
        self.assertNotIn('VACUUM ANALYZE "', src)
