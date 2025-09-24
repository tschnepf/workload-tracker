from django.test import TestCase
from django.contrib.auth import get_user_model
from datetime import date, timedelta

from people.models import Person
from projects.models import Project
from deliverables.models import Deliverable, DeliverableAssignment, PreDeliverableType, PreDeliverableItem
from assignments.models import Assignment


class CalendarUnionMineOnlyTests(TestCase):
    def setUp(self):
        User = get_user_model()
        # People
        self.p1 = Person.objects.create(name='Alice')
        self.p2 = Person.objects.create(name='Bob')
        # Users
        self.u1 = User.objects.create_user(username='u1', password='pw')
        self.u2 = User.objects.create_user(username='u2', password='pw')
        # Link u1->p1
        from accounts.models import UserProfile
        UserProfile.objects.get_or_create(user=self.u1, defaults={'person': self.p1})
        # Project and deliverables
        self.proj = Project.objects.create(name='Proj X')
        today = date.today()
        self.d1 = Deliverable.objects.create(project=self.proj, description='D1', date=today)
        self.d2 = Deliverable.objects.create(project=self.proj, description='D2', date=today)
        # Assignments
        DeliverableAssignment.objects.create(deliverable=self.d1, person=self.p1, is_active=True)
        DeliverableAssignment.objects.create(deliverable=self.d2, person=self.p2, is_active=True)
        # Pre-deliverable types/items
        self.ptype, _ = PreDeliverableType.objects.get_or_create(name='Spec', defaults={'default_days_before': 3})
        PreDeliverableItem.objects.create(
            deliverable=self.d1, pre_deliverable_type=self.ptype,
            generated_date=today, days_before=3
        )
        PreDeliverableItem.objects.create(
            deliverable=self.d2, pre_deliverable_type=self.ptype,
            generated_date=today, days_before=3
        )

    def _call(self, user, mine_only=True, start=None, end=None):
        self.client.force_login(user)
        params = {}
        if mine_only:
            params['mine_only'] = '1'
        if not start:
            start = (date.today() - timedelta(days=1)).isoformat()
        if not end:
            end = (date.today() + timedelta(days=1)).isoformat()
        params['start'] = start
        params['end'] = end
        return self.client.get('/api/deliverables/calendar_with_pre_items/', params)

    def test_mine_only_filters_deliverables_and_pre_items(self):
        resp = self._call(self.u1, mine_only=True)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)
        # Separate deliverables vs pre_items
        dels = [it for it in data if it.get('itemType') == 'deliverable']
        pre = [it for it in data if it.get('itemType') == 'pre_deliverable']
        # Only d1 should be present for u1
        self.assertTrue(all(it['id'] == self.d1.id for it in dels))
        # Only pre item for d1 should be present
        self.assertTrue(all(it['parentDeliverableId'] == self.d1.id for it in pre))

    def test_duplicate_deliverables_eliminated_with_distinct(self):
        # Add another assignment for same deliverable/person
        DeliverableAssignment.objects.create(deliverable=self.d1, person=self.p1, is_active=True)
        resp = self._call(self.u1, mine_only=True)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        dels = [it for it in data if it.get('itemType') == 'deliverable']
        # Only one entry for d1 expected
        self.assertEqual(len([it for it in dels if it['id'] == self.d1.id]), 1)

    def test_mine_only_no_linked_person_returns_empty(self):
        # u2 has no linked person profile
        resp = self._call(self.u2, mine_only=True)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data, [])

    def test_mine_only_includes_deliverables_via_project_assignments(self):
        # Create a new deliverable without a DeliverableAssignment for p1
        d3 = Deliverable.objects.create(project=self.proj, description='D3', date=date.today())
        # Link p1 to the project via Assignment (project-level)
        Assignment.objects.create(person=self.p1, project=self.proj, weekly_hours={})
        resp = self._call(self.u1, mine_only=True)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        dels = [it for it in data if it.get('itemType') == 'deliverable']
        self.assertIn(d3.id, [it['id'] for it in dels])
