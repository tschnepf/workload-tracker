from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from departments.models import Department
from people.models import Person
from projects.models import Project, ProjectRole
from assignments.models import Assignment


class AssignmentRoleDepartmentMismatchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='user', password='user')
        self.client.force_authenticate(self.user)

    def test_cross_department_role_update_rejected(self):
        d1 = Department.objects.create(name='Dept A')
        d2 = Department.objects.create(name='Dept B')
        person = Person.objects.create(name='Pat', department=d1)
        project = Project.objects.create(name='Bridge')
        role_other = ProjectRole.objects.create(name='Engineer', normalized_name='engineer', department=d2)
        a = Assignment.objects.create(person=person, project=project, weekly_hours={})
        # Ensure assignment has department denorm
        a.department = d1
        a.save(update_fields=['department'])
        # Attempt to assign role from other department
        res = self.client.patch(f'/api/assignments/{a.id}/', {'roleOnProjectId': role_other.id}, format='json')
        self.assertIn(res.status_code, (400, 422))
        self.assertIn('roleOnProjectId', (res.json() or {}))

