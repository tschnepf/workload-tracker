from datetime import date, timedelta
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from projects.models import Project
from people.models import Person
from deliverables.models import Deliverable, PreDeliverableType, PreDeliverableItem, DeliverableAssignment


class PreDeliverableReportsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username='user', password='pw')
        self.client.force_authenticate(user=u)
        # Seed types if not present
        self.specs, _ = PreDeliverableType.objects.get_or_create(name='Specifications', defaults={'default_days_before': 1})
        self.toc, _ = PreDeliverableType.objects.get_or_create(name='Specification TOC', defaults={'default_days_before': 3})
        self.p = Project.objects.create(name='Proj A')
        self.p2 = Project.objects.create(name='Proj B')
        self.alice = Person.objects.create(name='Alice', weekly_capacity=40)
        self.bob = Person.objects.create(name='Bob', weekly_capacity=36)
        d0 = Deliverable.objects.create(project=self.p, description='IFC', date=date.today() + timedelta(days=10))
        d1 = Deliverable.objects.create(project=self.p2, description='DD', date=date.today() + timedelta(days=5))
        DeliverableAssignment.objects.create(deliverable=d0, person=self.alice)
        DeliverableAssignment.objects.create(deliverable=d0, person=self.bob)
        DeliverableAssignment.objects.create(deliverable=d1, person=self.alice)
        PreDeliverableItem.objects.create(deliverable=d0, pre_deliverable_type=self.specs, generated_date=date.today() + timedelta(days=9), days_before=1, is_completed=True, completed_date=date.today())
        PreDeliverableItem.objects.create(deliverable=d0, pre_deliverable_type=self.toc, generated_date=date.today() - timedelta(days=1), days_before=3, is_completed=False)
        PreDeliverableItem.objects.create(deliverable=d1, pre_deliverable_type=self.specs, generated_date=date.today() + timedelta(days=4), days_before=1, is_completed=False)

    def test_completion_summary(self):
        resp = self.client.get('/api/reports/pre-deliverable-completion/?date_from=' + (date.today() - timedelta(days=30)).isoformat())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data['total'], 3)
        self.assertEqual(data['completed'], 1)
        self.assertGreaterEqual(data['overdue'], 1)
        self.assertIn('byProject', data)
        self.assertIn('byType', data)

    def test_team_performance(self):
        # Requires admin; but endpoint enforces IsAdminUser; here we simulate by is_staff
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username='admin', password='pw', is_staff=True)
        self.client.force_authenticate(user=u)
        resp = self.client.get('/api/reports/pre-deliverable-team-performance/?date_from=' + (date.today() - timedelta(days=30)).isoformat())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        items = resp.json().get('people', [])
        # Alice is assigned to both deliverables; Bob to one
        names = {i['personName'] for i in items}
        self.assertIn('Alice', names)
        self.assertIn('Bob', names)


