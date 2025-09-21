from django.test import SimpleTestCase
from datetime import date, timedelta

from deliverables.reallocation import reallocate_weekly_hours


class ReallocationCoreTests(SimpleTestCase):
    def test_forward_shift_two_weeks(self):
        old = date(2024, 3, 10)  # Sunday
        new = date(2024, 3, 24)  # +2 weeks
        wh = { '2024-03-10': 3, '2024-03-17': 2 }
        res = reallocate_weekly_hours(wh, old, new)
        self.assertEqual(res, { '2024-03-24': 3, '2024-03-31': 2 })

    def test_backward_shift_one_week_with_ceil(self):
        old = date(2024, 3, 10)
        new = date(2024, 3, 3)
        wh = { '2024-03-10': 1.2 }
        res = reallocate_weekly_hours(wh, old, new)
        # 1.2 -> ceil to 2
        self.assertEqual(res, { '2024-03-03': 2 })

    def test_collision_sums_then_ceil(self):
        old = date(2024, 3, 10)
        new = date(2024, 3, 17)  # +1 week, collisions to 03-17
        wh = { '2024-03-10': 0.6, '2024-03-17': 0.6 }
        # Move only the source week (03-10) to collide with existing 03-17
        res = reallocate_weekly_hours(wh, old, new, window=(old, old))
        # both buckets move forward or collide -> 1.2 -> ceil to 2
        self.assertEqual(res, { '2024-03-17': 2 })

    def test_window_only_moves_keys_in_range(self):
        old = date(2024, 3, 10)
        new = date(2024, 3, 24)  # +2 weeks
        wh = { '2024-03-03': 1, '2024-03-10': 1, '2024-03-17': 1, '2024-03-24': 1 }
        # Window [2024-03-10 .. 2024-03-24]; keys outside (03-03) remain
        res = reallocate_weekly_hours(wh, old, new, window=(date(2024, 3, 10), date(2024, 3, 24)))
        self.assertEqual(res, {
            '2024-03-03': 1,   # unchanged
            '2024-03-24': 1,   # was 03-10 moved +2
            '2024-03-31': 1,   # was 03-17 moved +2
            '2024-04-07': 1,   # was 03-24 moved +2
        })
