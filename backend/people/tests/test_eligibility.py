from datetime import date, timedelta

from django.test import TestCase

from people.eligibility import first_eligible_week_start, is_hired_in_week, is_hired_on_date


def _sunday_of_week(value: date) -> date:
    days_since_sunday = (value.weekday() + 1) % 7
    return value - timedelta(days=days_since_sunday)


class EligibilityHelpersTests(TestCase):
    def test_is_hired_on_date_null_hire_date_is_eligible(self):
        self.assertTrue(is_hired_on_date(None, date.today()))

    def test_is_hired_on_date_before_and_after_hire_date(self):
        hire_date = date(2026, 3, 15)
        self.assertFalse(is_hired_on_date(hire_date, date(2026, 3, 14)))
        self.assertTrue(is_hired_on_date(hire_date, date(2026, 3, 15)))
        self.assertTrue(is_hired_on_date(hire_date, date(2026, 3, 16)))

    def test_is_hired_in_week_includes_midweek_hire(self):
        week_start = date(2026, 3, 1)  # Sunday
        midweek_hire = week_start + timedelta(days=3)
        self.assertTrue(is_hired_in_week(midweek_hire, week_start))

    def test_is_hired_in_week_excludes_week_before_hire(self):
        hire_date = date(2026, 3, 18)
        prior_week_start = _sunday_of_week(hire_date) - timedelta(days=7)
        self.assertFalse(is_hired_in_week(hire_date, prior_week_start))

    def test_first_eligible_week_start_returns_hire_week_sunday(self):
        hire_date = date(2026, 3, 18)
        self.assertEqual(first_eligible_week_start(hire_date), _sunday_of_week(hire_date))
        self.assertIsNone(first_eligible_week_start(None))
