from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.utils import timezone
from datetime import timedelta

from projects.models import Project
from people.models import Person
from assignments.models import Assignment
from deliverables.models import Deliverable


class ProjectFilterMetadataTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Endpoint path as mounted in config.urls -> /api/projects/ + action url_path
        self.url = "/api/projects/filter-metadata/"

        # Common person for assignments
        self.person = Person.objects.create(name="Test Person")

    def _get(self):
        return self.client.get(self.url, format="json")

    def test_endpoint_accessible_and_structure(self):
        resp = self._get()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("projectFilters", data)
        # Initially empty
        self.assertIsInstance(data["projectFilters"], dict)
        self.assertEqual(len(data["projectFilters"]), 0)

    def test_no_assignments_no_deliverables(self):
        p = Project.objects.create(name="P0", status="active")

        resp = self._get()
        self.assertEqual(resp.status_code, 200)
        pf = resp.json()["projectFilters"][str(p.id)]
        self.assertEqual(pf["assignmentCount"], 0)
        self.assertFalse(pf["hasFutureDeliverables"])  # none present
        self.assertEqual(pf["status"], p.status)

    def test_assignments_no_future_deliverables(self):
        p = Project.objects.create(name="P1", status="active")
        Assignment.objects.create(
            person=self.person,
            project=p,
            weekly_hours={timezone.now().date().strftime("%Y-%m-%d"): 10},
            is_active=True,
        )

        # Past deliverable only
        Deliverable.objects.create(
            project=p,
            description="past",
            date=timezone.now().date() - timedelta(days=7),
            is_completed=False,
        )

        resp = self._get()
        pf = resp.json()["projectFilters"][str(p.id)]
        self.assertEqual(pf["assignmentCount"], 1)
        self.assertFalse(pf["hasFutureDeliverables"])  # only past

    def test_future_deliverables_flag(self):
        p = Project.objects.create(name="P2", status="active")
        # No assignments needed to test future flag
        Deliverable.objects.create(
            project=p,
            description="future",
            date=timezone.now().date() + timedelta(days=7),
            is_completed=False,
        )

        resp = self._get()
        pf = resp.json()["projectFilters"][str(p.id)]
        self.assertTrue(pf["hasFutureDeliverables"])  # future, not completed
        self.assertEqual(pf["assignmentCount"], 0)

    def test_only_past_deliverables(self):
        p = Project.objects.create(name="P3", status="active")
        Deliverable.objects.create(
            project=p,
            description="past",
            date=timezone.now().date() - timedelta(days=1),
            is_completed=False,
        )

        resp = self._get()
        pf = resp.json()["projectFilters"][str(p.id)]
        self.assertFalse(pf["hasFutureDeliverables"])  # only past

    def test_inactive_assignments_excluded(self):
        p = Project.objects.create(name="P4", status="active")
        Assignment.objects.create(
            person=self.person,
            project=p,
            weekly_hours={},
            is_active=False,
        )

        resp = self._get()
        pf = resp.json()["projectFilters"][str(p.id)]
        self.assertEqual(pf["assignmentCount"], 0)  # excluded

    def test_null_deliverable_dates_ignored(self):
        p = Project.objects.create(name="P5", status="active")
        Deliverable.objects.create(
            project=p,
            description="no date",
            date=None,
            is_completed=False,
        )

        resp = self._get()
        pf = resp.json()["projectFilters"][str(p.id)]
        self.assertFalse(pf["hasFutureDeliverables"])  # null date ignored

    def test_assignments_with_null_project_ignored(self):
        p = Project.objects.create(name="P6", status="active")
        Assignment.objects.create(
            person=self.person,
            project=None,
            project_name="Legacy Only",
            weekly_hours={},
            is_active=True,
        )

        resp = self._get()
        pf = resp.json()["projectFilters"][str(p.id)]
        self.assertEqual(pf["assignmentCount"], 0)

    def test_completed_future_deliverables_do_not_count(self):
        p = Project.objects.create(name="P7", status="active")
        Deliverable.objects.create(
            project=p,
            description="future completed",
            date=timezone.now().date() + timedelta(days=3),
            is_completed=True,
        )

        resp = self._get()
        pf = resp.json()["projectFilters"][str(p.id)]
        self.assertFalse(pf["hasFutureDeliverables"])  # completed should not count

    def test_query_count_is_small_for_many_projects(self):
        # Create 120 projects with mixed data
        today = timezone.now().date()
        for i in range(120):
            p = Project.objects.create(name=f"P{i}", status="active")
            # Every third project gets an active assignment
            if i % 3 == 0:
                Assignment.objects.create(
                    person=self.person,
                    project=p,
                    weekly_hours={today.strftime("%Y-%m-%d"): 4},
                    is_active=True,
                )
            # Every fifth project gets a future deliverable
            if i % 5 == 0:
                Deliverable.objects.create(
                    project=p,
                    description="future",
                    date=today + timedelta(days=14),
                    is_completed=False,
                )

        # Expect a very small number of queries regardless of row count
        with self.assertNumQueries(5):
            resp = self._get()
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(len(data.get("projectFilters", {})), 120)

    def test_conditional_requests_etag_and_last_modified(self):
        # Seed data to ensure last_modified exists
        p = Project.objects.create(name="P-ETag", status="active")
        today = timezone.now().date()
        Deliverable.objects.create(
            project=p,
            description="past",
            date=today - timedelta(days=1),
            is_completed=False,
        )

        # Initial request to capture headers
        resp1 = self._get()
        self.assertEqual(resp1.status_code, 200)
        etag = resp1.headers.get('ETag')
        last_mod = resp1.headers.get('Last-Modified')
        self.assertIsNotNone(etag)
        # Last-Modified is present when we have timestamps
        self.assertIsNotNone(last_mod)

        # If-None-Match should yield 304
        resp2 = self.client.get(self.url, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(resp2.status_code, 304)

        # If-Modified-Since should yield 304
        resp3 = self.client.get(self.url, HTTP_IF_MODIFIED_SINCE=last_mod)
        self.assertEqual(resp3.status_code, 304)

        # Mutate data to bump validators
        Deliverable.objects.create(
            project=p,
            description="future",
            date=today + timedelta(days=7),
            is_completed=False,
        )

        # Old ETag should no longer match; expect 200 and new ETag
        resp4 = self.client.get(self.url, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(resp4.status_code, 200)
        new_etag = resp4.headers.get('ETag')
        self.assertIsNotNone(new_etag)
        self.assertNotEqual(new_etag, etag)
        # Cache-Control should be set
        self.assertEqual(resp4.headers.get('Cache-Control'), 'public, max-age=30')
