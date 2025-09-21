from datetime import date
from django.test import SimpleTestCase

from core.week_utils import sunday_of_week, week_key, shift_week_key, list_sundays_between


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

