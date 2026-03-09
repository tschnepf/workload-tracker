from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserProfile
from assignments.models import Assignment
from people.models import Person
from projects.models import Project


def _current_sunday() -> str:
    today = date.today()
    days_since_sunday = (today.weekday() + 1) % 7
    return (today - timedelta(days=days_since_sunday)).isoformat()


class AssignmentMineOnlyFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username='assign-mine-user', password='pw')
        self.unlinked_user = user_model.objects.create_user(username='assign-mine-unlinked', password='pw')
        self.client.force_authenticate(self.user)

        self.me = Person.objects.create(name='Mine Filter Me')
        self.teammate = Person.objects.create(name='Mine Filter Teammate')
        self.outsider = Person.objects.create(name='Mine Filter Outsider')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.person = self.me
        profile.save(update_fields=['person'])

        self.my_project = Project.objects.create(name='Mine Filter Project', status='active', client='Internal')
        self.other_project = Project.objects.create(name='Mine Filter Other', status='active', client='External')
        week_key = _current_sunday()

        Assignment.objects.create(person=self.me, project=self.my_project, weekly_hours={week_key: 8}, is_active=True)
        Assignment.objects.create(person=self.teammate, project=self.my_project, weekly_hours={week_key: 6}, is_active=True)
        Assignment.objects.create(person=self.outsider, project=self.other_project, weekly_hours={week_key: 5}, is_active=True)

    def test_assignments_list_mine_only_scopes_to_my_project_ids(self):
        response = self.client.get('/api/assignments/?all=true&mine_only=1')
        self.assertEqual(response.status_code, 200, response.content)
        rows = response.json()
        project_ids = {int(row.get('project')) for row in rows}
        self.assertEqual(project_ids, {self.my_project.id})
        self.assertEqual(len(rows), 2)

    def test_assignments_search_mine_only_scopes_results_and_people_metadata(self):
        response = self.client.post(
            '/api/assignments/search/',
            {'mine_only': True, 'page': 1, 'page_size': 50},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        result_project_ids = {int(row.get('project')) for row in payload.get('results', [])}
        self.assertEqual(result_project_ids, {self.my_project.id})

        people_ids = {int(row['id']) for row in payload.get('people', [])}
        self.assertIn(self.me.id, people_ids)
        self.assertIn(self.teammate.id, people_ids)
        self.assertNotIn(self.outsider.id, people_ids)

        counts = payload.get('assignmentCountsByPerson', {})
        self.assertEqual(counts.get(str(self.me.id)), 1)
        self.assertEqual(counts.get(str(self.teammate.id)), 1)
        self.assertIsNone(counts.get(str(self.outsider.id)))

    def test_ui_assignments_page_mine_only_scopes_assignment_and_project_payloads(self):
        response = self.client.get('/api/ui/assignments-page/?weeks=1&mine_only=1')
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()

        project_ids = {int(row['id']) for row in payload.get('projects', [])}
        self.assertEqual(project_ids, {self.my_project.id})

        project_snapshot_rows = payload.get('projectGridSnapshot', {}).get('projects', []) or []
        snapshot_project_ids = {int(row['id']) for row in project_snapshot_rows}
        self.assertEqual(snapshot_project_ids, {self.my_project.id})

        people_rows = payload.get('assignmentGridSnapshot', {}).get('people', []) or []
        snapshot_people_ids = {int(row['id']) for row in people_rows}
        self.assertIn(self.me.id, snapshot_people_ids)
        self.assertIn(self.teammate.id, snapshot_people_ids)
        self.assertNotIn(self.outsider.id, snapshot_people_ids)

    def test_mine_only_without_linked_person_returns_empty_sets(self):
        self.client.force_authenticate(self.unlinked_user)
        list_response = self.client.get('/api/assignments/?all=true&mine_only=1')
        self.assertEqual(list_response.status_code, 200, list_response.content)
        self.assertEqual(list_response.json(), [])

        snapshot_response = self.client.get('/api/ui/assignments-page/?weeks=1&mine_only=1')
        self.assertEqual(snapshot_response.status_code, 200, snapshot_response.content)
        payload = snapshot_response.json()
        self.assertEqual(payload.get('projects', []), [])
        self.assertEqual(payload.get('assignmentGridSnapshot', {}).get('people', []), [])
        self.assertEqual(payload.get('projectGridSnapshot', {}).get('projects', []), [])
