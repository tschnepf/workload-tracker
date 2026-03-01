from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from assignments.models import Assignment
from people.models import Person
from projects.models import Project
from roles.models import Role


class AssignmentSearchPeopleRolesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username='search-role-user', password='pass')
        self.client.force_authenticate(self.user)

    def test_search_tokens_match_people_role_names(self):
        director_role = Role.objects.create(name='Director')
        engineer_role = Role.objects.create(name='Engineer')

        director = Person.objects.create(name='Director Person', weekly_capacity=36, role=director_role)
        engineer = Person.objects.create(name='Engineer Person', weekly_capacity=36, role=engineer_role)
        project = Project.objects.create(name='Role Search Project', status='active')

        Assignment.objects.create(person=director, project=project, weekly_hours={}, is_active=True)
        Assignment.objects.create(person=engineer, project=project, weekly_hours={}, is_active=True)

        response = self.client.post(
            '/api/assignments/search/',
            {
                'search_tokens': [{'term': 'director', 'op': 'and'}],
                'page': 1,
                'page_size': 25,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()

        people_ids = {row['id'] for row in payload.get('people', [])}
        self.assertIn(director.id, people_ids)
        self.assertNotIn(engineer.id, people_ids)

        result_person_ids = {row.get('person') for row in payload.get('results', [])}
        self.assertEqual(result_person_ids, {director.id})

        counts = payload.get('assignmentCountsByPerson', {})
        self.assertEqual(counts.get(str(director.id)), 1)
        self.assertNotIn(str(engineer.id), counts)

    def test_list_search_tokens_match_people_role_names(self):
        director_role = Role.objects.create(name='Director')
        engineer_role = Role.objects.create(name='Engineer')

        director = Person.objects.create(name='Director Person', weekly_capacity=36, role=director_role)
        engineer = Person.objects.create(name='Engineer Person', weekly_capacity=36, role=engineer_role)
        project = Project.objects.create(name='Role List Project', status='active')

        Assignment.objects.create(person=director, project=project, weekly_hours={}, is_active=True)
        Assignment.objects.create(person=engineer, project=project, weekly_hours={}, is_active=True)

        response = self.client.get(
            '/api/assignments/',
            {'search_tokens': '[{\"term\":\"director\",\"op\":\"and\"}]'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        result_person_ids = {row.get('person') for row in payload.get('results', [])}
        self.assertEqual(result_person_ids, {director.id})
