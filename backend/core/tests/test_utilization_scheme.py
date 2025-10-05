from django.test import TestCase
from django.core.exceptions import ValidationError
from core.models import UtilizationScheme


class UtilizationSchemeModelTests(TestCase):
    def test_defaults_are_valid(self):
        s = UtilizationScheme.get_active()
        # Should not raise
        s.clean()

    def test_contiguity_validation(self):
        s = UtilizationScheme.get_active()
        # Break green_min contiguity
        s.green_min = s.blue_max  # should be blue_max + 1
        with self.assertRaises(ValidationError):
            s.clean()

    def test_invalid_bounds_and_overlaps(self):
        s = UtilizationScheme.get_active()
        s.blue_min = 2
        s.blue_max = 1  # invalid (min > max)
        with self.assertRaises(ValidationError):
            s.clean()

        s = UtilizationScheme.get_active()
        s.green_max = s.green_min - 1  # invalid
        with self.assertRaises(ValidationError):
            s.clean()

        s = UtilizationScheme.get_active()
        s.orange_min = s.green_max  # overlap (should be +1)
        with self.assertRaises(ValidationError):
            s.clean()

        s = UtilizationScheme.get_active()
        s.red_min = 0  # lower bounds must be >=1
        with self.assertRaises(ValidationError):
            s.clean()
