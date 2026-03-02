from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from datetime import date

from assignments.models import Assignment, AssignmentWeekHour
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

    def test_search_workload_tokens_match_by_visible_week_window(self):
        role = Role.objects.create(name='Engineer')
        p_available = Person.objects.create(name='Available Person', weekly_capacity=36, role=role)
        p_over = Person.objects.create(name='Over Person', weekly_capacity=36, role=role)
        project = Project.objects.create(name='Workload Search Project', status='active')
        a_available = Assignment.objects.create(person=p_available, project=project, weekly_hours={}, is_active=True)
        a_over = Assignment.objects.create(person=p_over, project=project, weekly_hours={}, is_active=True)

        start = date(2026, 3, 1)
        AssignmentWeekHour.objects.create(
            assignment=a_available,
            person=p_available,
            project=project,
            department=p_available.department,
            week_start=start,
            hours=20,
        )
        AssignmentWeekHour.objects.create(
            assignment=a_over,
            person=p_over,
            project=project,
            department=p_over.department,
            week_start=start,
            hours=45,
        )

        available_resp = self.client.post(
            '/api/assignments/search/',
            {
                'search_tokens': [{'term': 'available', 'op': 'and'}],
                'workload_week_start': start.isoformat(),
                'workload_weeks': 1,
                'page': 1,
                'page_size': 25,
            },
            format='json',
        )
        self.assertEqual(available_resp.status_code, 200, available_resp.content)
        available_people = {row.get('person') for row in available_resp.json().get('results', [])}
        self.assertEqual(available_people, {p_available.id})
        available_reasons = available_resp.json().get('peopleMatchReason', {})
        self.assertEqual(available_reasons.get(str(p_available.id)), 'workload')

        range_resp = self.client.post(
            '/api/assignments/search/',
            {
                'search_tokens': [{'term': '>14, <30', 'op': 'and'}],
                'workload_week_start': start.isoformat(),
                'workload_weeks': 1,
                'page': 1,
                'page_size': 25,
            },
            format='json',
        )
        self.assertEqual(range_resp.status_code, 200, range_resp.content)
        range_people = {row.get('person') for row in range_resp.json().get('results', [])}
        self.assertEqual(range_people, {p_available.id})

        overloaded_resp = self.client.post(
            '/api/assignments/search/',
            {
                'search_tokens': [{'term': 'overloaded', 'op': 'and'}],
                'workload_week_start': start.isoformat(),
                'workload_weeks': 1,
                'page': 1,
                'page_size': 25,
            },
            format='json',
        )
        self.assertEqual(overloaded_resp.status_code, 200, overloaded_resp.content)
        overloaded_people = {row.get('person') for row in overloaded_resp.json().get('results', [])}
        self.assertEqual(overloaded_people, {p_over.id})

        list_resp = self.client.get(
            '/api/assignments/',
            {
                'search_tokens': '[{"term":"available","op":"and"}]',
                'workload_week_start': start.isoformat(),
                'workload_weeks': 1,
            },
            format='json',
        )
        self.assertEqual(list_resp.status_code, 200, list_resp.content)
        list_people = {row.get('person') for row in list_resp.json().get('results', [])}
        self.assertEqual(list_people, {p_available.id})
