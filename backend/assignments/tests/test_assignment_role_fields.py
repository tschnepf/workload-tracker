from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from departments.models import Department
from people.models import Person
from projects.models import Project, ProjectRole
from assignments.models import Assignment


class AssignmentRoleFieldsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='user', password='user')
        self.client.force_authenticate(self.user)

    def test_assignment_includes_role_fields(self):
        dept = Department.objects.create(name='Design')
        person = Person.objects.create(name='Alex', department=dept)
        project = Project.objects.create(name='Skyline')
        role = ProjectRole.objects.create(name='Lead Designer', normalized_name='lead designer', department=dept)
        a = Assignment.objects.create(person=person, project=project, weekly_hours={})
        a.department = dept
        a.role_on_project_ref = role
        a.save(update_fields=['department', 'role_on_project_ref'])
        res = self.client.get('/api/assignments/?all=true')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        items = data if isinstance(data, list) else data.get('results') or []
        self.assertTrue(any(it.get('roleOnProjectId') == role.id and it.get('roleName') == role.name for it in items))

