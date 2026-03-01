from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from assignments.models import Assignment
from people.models import Person
from projects.models import Project


def _current_sunday() -> str:
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7
    return (today - timedelta(days=days_since_sunday)).isoformat()


class SnapshotCacheHeaderTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='snapshot-cache-user',
            password='x',
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(self.user)

        person = Person.objects.create(name='Snapshot Header Person')
        project = Project.objects.create(name='Snapshot Header Project')
        Assignment.objects.create(
            person=person,
            project=project,
            weekly_hours={_current_sunday(): 6},
            is_active=True,
        )

    def test_grid_snapshot_sets_cache_control_with_swr(self):
        response = self.client.get('/api/assignments/grid_snapshot/?weeks=1')
        self.assertEqual(response.status_code, 200)
        cache_control = response.headers.get('Cache-Control', '')
        self.assertIn('max-age=20', cache_control)
        self.assertIn('stale-while-revalidate=30', cache_control)

    def test_ui_assignments_page_sets_cache_control_with_swr(self):
        response = self.client.get('/api/ui/assignments-page/?weeks=1&include=assignment')
        self.assertEqual(response.status_code, 200)
        cache_control = response.headers.get('Cache-Control', '')
        self.assertIn('max-age=20', cache_control)
        self.assertIn('stale-while-revalidate=30', cache_control)
