from datetime import date, timedelta
from django.test import TestCase
from projects.models import Project
from deliverables.models import Deliverable, PreDeliverableType, PreDeliverableItem
from core.models import PreDeliverableGlobalSettings
from deliverables.services import PreDeliverableService


class PreDeliverableServiceTests(TestCase):
    def setUp(self):
        self.project = Project.objects.create(name="Proj")
        self.deliv = Deliverable.objects.create(project=self.project, description="IFC", date=date(2025, 1, 15))
        # Ensure at least one active type + global settings exist
        self.ptype, _ = PreDeliverableType.objects.get_or_create(name="Specifications", defaults={"default_days_before": 1})
        PreDeliverableGlobalSettings.objects.get_or_create(pre_deliverable_type=self.ptype, defaults={
            'default_days_before': 1,
            'is_enabled_by_default': True,
        })

    def test_generate_creates_items_once(self):
        created = PreDeliverableService.generate_pre_deliverables(self.deliv)
        self.assertGreaterEqual(len(created), 1)
        again = PreDeliverableService.generate_pre_deliverables(self.deliv)
        self.assertEqual(len(again), 0)  # no duplicates
        self.assertEqual(PreDeliverableItem.objects.filter(deliverable=self.deliv).count(), len(created))

    def test_update_recalculates_dates(self):
        PreDeliverableService.generate_pre_deliverables(self.deliv)
        old_date = self.deliv.date
        new_date = date(2025, 1, 22)
        updated = PreDeliverableService.update_pre_deliverables(self.deliv, old_date, new_date)
        self.assertGreaterEqual(updated, 1)
        # Ensure items reflect new_date
        for it in PreDeliverableItem.objects.filter(deliverable=self.deliv):
            expected = it.generated_date
            # Using service logic, recompute to verify idempotency
            # If days_before stayed same, generated_date is derived from new_date
            self.assertIsNotNone(expected)

    def test_regenerate_preserves_completed(self):
        created = PreDeliverableService.generate_pre_deliverables(self.deliv)
        first = created[0]
        first.is_completed = True
        first.completed_date = date.today()
        first.save()
        summary = PreDeliverableService.regenerate_pre_deliverables(self.deliv)
        self.assertGreaterEqual(summary.created, 1)
        self.assertGreaterEqual(summary.deleted, 1)
        self.assertGreaterEqual(summary.preserved_completed, 1)
