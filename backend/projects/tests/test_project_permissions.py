from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserProfile
from assignments.models import Assignment
from people.models import Person
from projects.models import Project


class ProjectPermissionsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username='project_user', password='pw')
        self.manager = user_model.objects.create_user(username='project_manager', password='pw')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)

        self.project = Project.objects.create(
            name='Permission Project',
            client='Internal',
            status='active',
        )

    def test_regular_user_cannot_create_project(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            '/api/projects/',
            {'name': 'Should Fail', 'client': 'Internal', 'status': 'active'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)

    def test_regular_user_cannot_delete_project(self):
        self.client.force_authenticate(self.user)
        resp = self.client.delete(f'/api/projects/{self.project.id}/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
        self.assertTrue(Project.objects.filter(id=self.project.id).exists())

    def test_regular_user_cannot_import_projects(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post('/api/projects/import_excel/', {}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)

    def test_regular_user_can_update_project(self):
        self.client.force_authenticate(self.user)
        resp = self.client.patch(
            f'/api/projects/{self.project.id}/',
            {'description': 'Updated by regular user'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.project.refresh_from_db()
        self.assertEqual(self.project.description, 'Updated by regular user')

    def test_regular_user_can_search_projects(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post('/api/projects/search/', {'page': 1, 'page_size': 10}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        body = resp.json()
        self.assertIn('results', body)
        self.assertGreaterEqual(len(body['results']), 1)

    def test_regular_user_can_filter_search_to_my_projects(self):
        self.client.force_authenticate(self.user)
        person = Person.objects.create(name='Regular User Person')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.person = person
        profile.save(update_fields=['person'])

        mine_project = Project.objects.create(name='Mine', client='Internal', status='active')
        other_project = Project.objects.create(name='Other', client='Internal', status='active')
        Assignment.objects.create(person=person, project=mine_project, is_active=True, weekly_hours={})

        resp = self.client.post(
            '/api/projects/search/',
            {'page': 1, 'page_size': 50, 'mine_only': True},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        result_ids = {int(item['id']) for item in resp.json().get('results', [])}
        self.assertIn(mine_project.id, result_ids)
        self.assertNotIn(other_project.id, result_ids)

    def test_regular_user_can_filter_metadata_to_my_projects(self):
        self.client.force_authenticate(self.user)
        person = Person.objects.create(name='Regular User Person Metadata')
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.person = person
        profile.save(update_fields=['person'])

        mine_project = Project.objects.create(name='Mine Metadata', client='Internal', status='active')
        other_project = Project.objects.create(name='Other Metadata', client='Internal', status='active')
        Assignment.objects.create(person=person, project=mine_project, is_active=True, weekly_hours={})

        resp = self.client.get('/api/projects/filter-metadata/?mine_only=1')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        filters = (resp.json() or {}).get('projectFilters', {})
        self.assertIn(str(mine_project.id), filters)
        self.assertNotIn(str(other_project.id), filters)

    def test_manager_can_create_and_delete_project(self):
        self.client.force_authenticate(self.manager)
        create_resp = self.client.post(
            '/api/projects/',
            {'name': 'Manager Project', 'client': 'Internal', 'status': 'active'},
            format='json',
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.content)
        project_id = int(create_resp.json()['id'])

        delete_resp = self.client.delete(f'/api/projects/{project_id}/')
        self.assertEqual(delete_resp.status_code, status.HTTP_204_NO_CONTENT, delete_resp.content)
        self.assertFalse(Project.objects.filter(id=project_id).exists())
