from datetime import date, timedelta
from django.test import TestCase
from projects.models import Project
from deliverables.models import Deliverable, PreDeliverableType, PreDeliverableItem


class PreDeliverableItemTests(TestCase):
    def setUp(self):
        self.project = Project.objects.create(name="Proj")
        self.deliv = Deliverable.objects.create(project=self.project, description="IFC", date=date.today() + timedelta(days=7))
        self.ptype, _ = PreDeliverableType.objects.get_or_create(
            name="Specifications",
            defaults={"default_days_before": 1, "sort_order": 5}
        )

    def test_create_and_props(self):
        item = PreDeliverableItem.objects.create(
            deliverable=self.deliv,
            pre_deliverable_type=self.ptype,
            generated_date=date.today() + timedelta(days=6),
            days_before=1,
        )
        self.assertIn("Specifications - IFC", item.display_name)
        self.assertFalse(item.is_overdue)

    def test_is_overdue(self):
        past = PreDeliverableItem.objects.create(
            deliverable=self.deliv,
            pre_deliverable_type=self.ptype,
            generated_date=date.today() - timedelta(days=1),
            days_before=2,
        )
        self.assertTrue(past.is_overdue)
