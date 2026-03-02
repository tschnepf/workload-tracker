from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from datetime import date
from departments.models import Department
from projects.models import ProjectRole
from projects.models import Project
from people.models import Person
from assignments.models import Assignment
from assignments.models import AssignmentWeekHour
from roles.models import Role


class ProjectRolesApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username='admin', password='admin', is_staff=True)
        self.user = User.objects.create_user(username='user', password='user', is_staff=False)
        self.dept = Department.objects.create(name='Engineering')

    def test_create_and_list_roles(self):
        # Admin can create
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/projects/project-roles/', {'department': self.dept.id, 'name': 'Engineer'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        rid = res.data['id']
        # List (any auth)
        self.client.force_authenticate(self.user)
        res2 = self.client.get('/api/projects/project-roles/', {'department': self.dept.id})
        self.assertEqual(res2.status_code, 200, res2.content)
        self.assertTrue(any(r['id'] == rid and r['name'] == 'Engineer' for r in res2.json()))

    def test_uniqueness_conflict_normalized(self):
        self.client.force_authenticate(self.admin)
        # Create base
        res1 = self.client.post('/api/projects/project-roles/', {'department': self.dept.id, 'name': 'Senior  Engineer'}, format='json')
        self.assertEqual(res1.status_code, 201, res1.content)
        # Attempt duplicate with different casing/spacing
        res2 = self.client.post('/api/projects/project-roles/', {'department': self.dept.id, 'name': 'senior engineer'}, format='json')
        # 409 from our serializer conflict mapping
        self.assertEqual(res2.status_code, 409, res2.content)

    def test_bulk_post_returns_roles_by_department_with_empty_arrays(self):
        dept2 = Department.objects.create(name='Planning')
        ProjectRole.objects.create(
            name='Engineer',
            normalized_name='engineer',
            department=self.dept,
            is_active=True,
            sort_order=20,
        )
        ProjectRole.objects.create(
            name='Architect',
            normalized_name='architect',
            department=self.dept,
            is_active=True,
            sort_order=10,
        )
        ProjectRole.objects.create(
            name='Inactive Role',
            normalized_name='inactive role',
            department=self.dept,
            is_active=False,
            sort_order=0,
        )

        self.client.force_authenticate(self.user)
        res = self.client.post(
            '/api/projects/project-roles/bulk/',
            {'department_ids': [dept2.id, self.dept.id]},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.json().get('rolesByDepartment', {})
        self.assertIn(str(dept2.id), payload)
        self.assertEqual(payload[str(dept2.id)], [])
        self.assertEqual([r['name'] for r in payload[str(self.dept.id)]], ['Architect', 'Engineer'])

    def test_bulk_get_csv_compatibility_and_include_inactive(self):
        dept2 = Department.objects.create(name='Operations')
        ProjectRole.objects.create(
            name='Planner',
            normalized_name='planner',
            department=self.dept,
            is_active=True,
            sort_order=1,
        )
        ProjectRole.objects.create(
            name='Dormant',
            normalized_name='dormant',
            department=self.dept,
            is_active=False,
            sort_order=2,
        )
        ProjectRole.objects.create(
            name='Reviewer',
            normalized_name='reviewer',
            department=dept2,
            is_active=True,
            sort_order=1,
        )

        self.client.force_authenticate(self.user)
        res = self.client.get(
            '/api/projects/project-roles/bulk/',
            {'department_ids': f'{self.dept.id},{dept2.id}', 'include_inactive': 'true'},
        )
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.json().get('rolesByDepartment', {})
        dept1_names = [r['name'] for r in payload[str(self.dept.id)]]
        self.assertIn('Planner', dept1_names)
        self.assertIn('Dormant', dept1_names)
        self.assertEqual([r['name'] for r in payload[str(dept2.id)]], ['Reviewer'])

    def test_bulk_post_department_id_limit_enforced(self):
        self.client.force_authenticate(self.user)
        ids = list(range(1, 203))
        res = self.client.post('/api/projects/project-roles/bulk/', {'department_ids': ids}, format='json')
        self.assertEqual(res.status_code, 400, res.content)

    def test_bulk_get_department_id_limit_enforced(self):
        self.client.force_authenticate(self.user)
        ids = ','.join(str(i) for i in range(1, 28))
        res = self.client.get('/api/projects/project-roles/bulk/', {'department_ids': ids})
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('max length', (res.json() or {}).get('detail', ''))

    def test_bulk_get_query_length_guard_enforced(self):
        self.client.force_authenticate(self.user)
        long_csv = ','.join(str(i) for i in range(1, 300))
        self.assertGreater(len(long_csv), 512)
        res = self.client.get('/api/projects/project-roles/bulk/', {'department_ids': long_csv})
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('too long', (res.json() or {}).get('detail', ''))

    def test_search_include_role_map_returns_roles_by_department(self):
        dept2 = Department.objects.create(name='Planning')
        project = Project.objects.create(name='Role Map Project')
        person1 = Person.objects.create(name='Alice', weekly_capacity=36, department=self.dept)
        person2 = Person.objects.create(name='Bob', weekly_capacity=36, department=dept2)
        Assignment.objects.create(person=person1, project=project, weekly_hours={}, is_active=True)
        Assignment.objects.create(person=person2, project=project, weekly_hours={}, is_active=True)
        ProjectRole.objects.create(
            name='Engineer',
            normalized_name='engineer',
            department=self.dept,
            is_active=True,
            sort_order=1,
        )

        self.client.force_authenticate(self.admin)
        res = self.client.post(
            '/api/projects/search/',
            {'include': 'role_map', 'page_size': 25},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        payload = res.json()
        roles_by_department = payload.get('rolesByDepartment', {})
        self.assertIn(str(self.dept.id), roles_by_department)
        self.assertIn(str(dept2.id), roles_by_department)
        self.assertEqual([r['name'] for r in roles_by_department[str(self.dept.id)]], ['Engineer'])
        self.assertEqual(roles_by_department[str(dept2.id)], [])

    def test_search_include_role_map_can_include_inactive_roles(self):
        project = Project.objects.create(name='Role Map Inactive')
        person1 = Person.objects.create(name='Casey', weekly_capacity=36, department=self.dept)
        Assignment.objects.create(person=person1, project=project, weekly_hours={}, is_active=True)
        ProjectRole.objects.create(
            name='Active Role',
            normalized_name='active role',
            department=self.dept,
            is_active=True,
            sort_order=1,
        )
        ProjectRole.objects.create(
            name='Inactive Role',
            normalized_name='inactive role',
            department=self.dept,
            is_active=False,
            sort_order=2,
        )

        self.client.force_authenticate(self.admin)
        res = self.client.post(
            '/api/projects/search/',
            {'include': 'role_map', 'include_inactive_roles': True, 'page_size': 25},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        roles = res.json().get('rolesByDepartment', {}).get(str(self.dept.id), [])
        self.assertIn('Active Role', [role['name'] for role in roles])
        self.assertIn('Inactive Role', [role['name'] for role in roles])

    def test_search_tokens_match_assigned_people_role_names(self):
        director_role = Role.objects.create(name='Director')
        engineer_role = Role.objects.create(name='Engineer')

        project_director = Project.objects.create(name='Director Project', status='active')
        project_engineer = Project.objects.create(name='Engineer Project', status='active')

        director = Person.objects.create(name='Dana', weekly_capacity=36, department=self.dept, role=director_role)
        engineer = Person.objects.create(name='Eli', weekly_capacity=36, department=self.dept, role=engineer_role)
        director_two = Person.objects.create(name='Drew', weekly_capacity=36, department=self.dept, role=director_role)
        Assignment.objects.create(person=director, project=project_director, weekly_hours={}, is_active=True)
        Assignment.objects.create(person=director_two, project=project_director, weekly_hours={}, is_active=True)
        Assignment.objects.create(person=engineer, project=project_engineer, weekly_hours={}, is_active=True)

        self.client.force_authenticate(self.admin)
        res = self.client.post(
            '/api/projects/search/',
            {
                'search_tokens': [{'term': 'director', 'op': 'and'}],
                'page_size': 25,
            },
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        names = [item['name'] for item in res.json().get('results', [])]
        self.assertIn(project_director.name, names)
        self.assertNotIn(project_engineer.name, names)
        self.assertEqual(names.count(project_director.name), 1)

    def test_search_tokens_match_assigned_people_workload(self):
        role = Role.objects.create(name='Engineer')
        project_available = Project.objects.create(name='Available Project', status='active')
        project_over = Project.objects.create(name='Overallocated Project', status='active')
        available_person = Person.objects.create(name='Ava', weekly_capacity=36, department=self.dept, role=role)
        over_person = Person.objects.create(name='Oz', weekly_capacity=36, department=self.dept, role=role)
        asn_available = Assignment.objects.create(person=available_person, project=project_available, weekly_hours={}, is_active=True)
        asn_over = Assignment.objects.create(person=over_person, project=project_over, weekly_hours={}, is_active=True)

        start = date(2026, 3, 1)
        AssignmentWeekHour.objects.create(
            assignment=asn_available,
            person=available_person,
            project=project_available,
            department=available_person.department,
            week_start=start,
            hours=18,
        )
        AssignmentWeekHour.objects.create(
            assignment=asn_over,
            person=over_person,
            project=project_over,
            department=over_person.department,
            week_start=start,
            hours=44,
        )

        self.client.force_authenticate(self.admin)
        resp_available = self.client.post(
            '/api/projects/search/',
            {
                'search_tokens': [{'term': 'available', 'op': 'and'}],
                'workload_week_start': start.isoformat(),
                'workload_weeks': 1,
                'page_size': 25,
            },
            format='json',
        )
        self.assertEqual(resp_available.status_code, 200, resp_available.content)
        names_available = [item['name'] for item in resp_available.json().get('results', [])]
        self.assertIn(project_available.name, names_available)
        self.assertNotIn(project_over.name, names_available)

        resp_range = self.client.post(
            '/api/projects/search/',
            {
                'search_tokens': [{'term': '>14, <30', 'op': 'and'}],
                'workload_week_start': start.isoformat(),
                'workload_weeks': 1,
                'page_size': 25,
            },
            format='json',
        )
        self.assertEqual(resp_range.status_code, 200, resp_range.content)
        names_range = [item['name'] for item in resp_range.json().get('results', [])]
        self.assertIn(project_available.name, names_range)
        self.assertNotIn(project_over.name, names_range)

        resp_overloaded = self.client.post(
            '/api/projects/search/',
            {
                'search_tokens': [{'term': 'overloaded', 'op': 'and'}],
                'workload_week_start': start.isoformat(),
                'workload_weeks': 1,
                'page_size': 25,
            },
            format='json',
        )
        self.assertEqual(resp_overloaded.status_code, 200, resp_overloaded.content)
        names_overloaded = [item['name'] for item in resp_overloaded.json().get('results', [])]
        self.assertIn(project_over.name, names_overloaded)
        self.assertNotIn(project_available.name, names_overloaded)
