from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from datetime import date, timedelta

from projects.models import Project
from people.models import Person
from deliverables.models import Deliverable, DeliverableAssignment


class DeliverablesCalendarApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user(username='cal_user', password='pw')
        self.client.force_authenticate(user=self.user)
        self.project = Project.objects.create(name="Project A")
        self.person = Person.objects.create(name="Sarah", weekly_capacity=36)

        # Create two deliverables on different dates
        self.d1 = Deliverable.objects.create(project=self.project, description="Kickoff", date=date(2025, 9, 7))
        self.d2 = Deliverable.objects.create(project=self.project, percentage=50, date=date(2025, 9, 21))

        # Assignments: one for d1, two for d2 (no weekly hours on link model)
        DeliverableAssignment.objects.create(deliverable=self.d1, person=self.person)
        p2 = Person.objects.create(name="Alex", weekly_capacity=36)
        DeliverableAssignment.objects.create(deliverable=self.d2, person=self.person)
        DeliverableAssignment.objects.create(deliverable=self.d2, person=p2)

    def test_calendar_date_filtering_and_counts(self):
        resp = self.client.get('/api/deliverables/calendar/?start=2025-09-14&end=2025-09-28')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        items = resp.json()
        # Should include only d2
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['id'], self.d2.id)
        self.assertEqual(items[0]['project'], self.project.id)
        self.assertEqual(items[0]['projectName'], self.project.name)
        self.assertEqual(items[0]['assignmentCount'], 2)

    def test_calendar_missing_params_returns_all_dated(self):
        resp = self.client.get('/api/deliverables/calendar/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        items = resp.json()
        ids = {i['id'] for i in items}
        self.assertIn(self.d1.id, ids)
        self.assertIn(self.d2.id, ids)

    def test_calendar_etag_conditional(self):
        resp1 = self.client.get('/api/deliverables/calendar/')
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)
        etag = resp1.headers.get('ETag')
        # Second request with If-None-Match should 304
        resp2 = self.client.get('/api/deliverables/calendar/', HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(resp2.status_code, status.HTTP_304_NOT_MODIFIED)
