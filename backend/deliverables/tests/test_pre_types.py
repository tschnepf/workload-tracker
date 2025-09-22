from django.test import TestCase
from deliverables.models import PreDeliverableType


class PreDeliverableTypeTests(TestCase):
    def test_seeded_types_exist(self):
        names = set(PreDeliverableType.objects.values_list('name', flat=True))
        expected = {"Specification TOC", "Specifications", "Model Delivery", "Sheet List"}
        # All expected names must be present
        self.assertTrue(expected.issubset(names))
        # Basic field defaults
        spec_toc = PreDeliverableType.objects.get(name="Specification TOC")
        self.assertEqual(spec_toc.default_days_before, 3)
        self.assertTrue(spec_toc.is_active)
