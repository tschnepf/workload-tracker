from datetime import date
from django.test import SimpleTestCase

from core.week_utils import (
    sunday_of_week,
    week_key,
    shift_week_key,
    list_sundays_between,
    is_working_day,
    working_days_before,
    working_days_after,
    count_working_days_between,
)


class WeekUtilsTests(SimpleTestCase):
    def test_sunday_of_week_basic(self):
        # Monday -> previous Sunday
        self.assertEqual(sunday_of_week(date(2024, 3, 11)), date(2024, 3, 10))
        # Sunday -> same day
        self.assertEqual(sunday_of_week(date(2024, 3, 10)), date(2024, 3, 10))
        # Friday -> previous Sunday
        self.assertEqual(sunday_of_week(date(2024, 3, 15)), date(2024, 3, 10))

    def test_week_key(self):
        self.assertEqual(week_key(date(2024, 3, 12)), '2024-03-10')
        self.assertEqual(week_key(date(2024, 11, 3)), '2024-11-03')  # DST fall Sunday (US)

    def test_shift_week_key(self):
        self.assertEqual(shift_week_key('2024-03-10', 1), '2024-03-17')
        self.assertEqual(shift_week_key('2024-03-10', -2), '2024-02-25')
        # Normalize non-Sunday input before shift
        self.assertEqual(shift_week_key('2024-03-12', 0), '2024-03-10')

    def test_list_sundays_between_inclusive(self):
        keys = list_sundays_between(date(2024, 3, 5), date(2024, 3, 24), inclusive=True)
        self.assertEqual(keys, ['2024-03-03', '2024-03-10', '2024-03-17', '2024-03-24'])

    def test_list_sundays_between_exclusive(self):
        keys = list_sundays_between(date(2024, 3, 5), date(2024, 3, 24), inclusive=False)
        self.assertEqual(keys, ['2024-03-03', '2024-03-10', '2024-03-17'])

    def test_list_sundays_between_same_week(self):
        keys = list_sundays_between(date(2024, 3, 11), date(2024, 3, 13), inclusive=True)
        self.assertEqual(keys, ['2024-03-10'])

    # -----------------------------
    # Business-day helper tests
    # -----------------------------

    def test_is_working_day(self):
        self.assertTrue(is_working_day(date(2024, 1, 12)))  # Fri
        self.assertFalse(is_working_day(date(2024, 1, 13))) # Sat
        self.assertFalse(is_working_day(date(2024, 1, 14))) # Sun

    def test_working_days_before_basic_and_weekend(self):
        # Tue 2024-01-15 minus 3 business days = Wed 2024-01-10
        self.assertEqual(working_days_before(date(2024, 1, 15), 3), date(2024, 1, 10))
        # Monday minus 1 -> previous Friday
        self.assertEqual(working_days_before(date(2024, 1, 8), 1), date(2024, 1, 5))
        # Sunday target normalizes to Friday first
        self.assertEqual(working_days_before(date(2024, 1, 7), 1), date(2024, 1, 5))

    def test_working_days_before_month_boundary(self):
        # Mon 2024-02-05 minus 6 business days -> Fri 2024-01-26
        self.assertEqual(working_days_before(date(2024, 2, 5), 6), date(2024, 1, 26))

    def test_working_days_after_basic_and_weekend(self):
        # Fri + 1 business day = next Mon
        self.assertEqual(working_days_after(date(2024, 1, 12), 1), date(2024, 1, 15))
        # Saturday start normalizes to Monday
        self.assertEqual(working_days_after(date(2024, 1, 6), 1), date(2024, 1, 8))

    def test_working_days_after_year_boundary(self):
        # Fri 2023-12-29 + 3 business days -> Wed 2024-01-03
        self.assertEqual(working_days_after(date(2023, 12, 29), 3), date(2024, 1, 3))

    def test_count_working_days_between(self):
        self.assertEqual(count_working_days_between(date(2024, 1, 8), date(2024, 1, 12)), 5)
        self.assertEqual(count_working_days_between(date(2024, 1, 13), date(2024, 1, 14)), 0)
        self.assertEqual(count_working_days_between(date(2023, 12, 29), date(2024, 1, 3)), 4)

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            working_days_before(date(2024, 1, 10), -1)
        with self.assertRaises(ValueError):
            working_days_after(date(2024, 1, 10), -2)
        with self.assertRaises(ValueError):
            count_working_days_between(date(2024, 1, 12), date(2024, 1, 11))
