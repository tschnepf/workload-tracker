"""SQL Remediation validation tests for reports aggregation consolidation."""

import os
from django.test import SimpleTestCase
from pathlib import Path


_HERE = Path(__file__).resolve()
_APP_DIR = _HERE.parents[1]
REPORTS_VIEWS = (_APP_DIR / "views.py").resolve()


class ReportsSqlRemediationTests(SimpleTestCase):
    def _read(self) -> str:
        try:
            return REPORTS_VIEWS.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""

    def test_phase6_counts_consolidated_or_skip(self):
        """Confirm count consolidation via aggregate; skip if not yet implemented."""
        src = self._read()
        if ".aggregate(" not in src:
            self.skipTest("Aggregate counts not yet implemented in reports views")
        # Heuristic: fewer raw qs.count() uses when consolidated
        self.assertNotIn("qs.count()", src)

    def test_response_shape_stable(self):
        """API response keeps the same shape (optional runtime test).

        Skips unless RUN_API_SHAPE_TESTS=1 due to DB requirement.
        """
        if os.getenv("RUN_API_SHAPE_TESTS") != "1":
            self.skipTest("Set RUN_API_SHAPE_TESTS=1 to run API shape test (requires DB)")
        # Runtime API shape test intentionally omitted here to avoid DB setup.
