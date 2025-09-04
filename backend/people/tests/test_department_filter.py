from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from departments.models import Department
from roles.models import Role
from people.models import Person


class PeopleDepartmentFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Authenticate client
        User = get_user_model()
        self.user = User.objects.create_user(username='tester', password='pass')
        self.client.force_authenticate(user=self.user)
        # Dept tree: X -> Y, sibling Z
        self.dept_x = Department.objects.create(name='X')
        self.dept_y = Department.objects.create(
            name='Y', parent_department=self.dept_x
        )
        self.dept_z = Department.objects.create(name='Z')
        role, _ = Role.objects.get_or_create(name='Engineer')

        self.px = Person.objects.create(
            name='PX', weekly_capacity=36, department=self.dept_x, role=role
        )
        self.py = Person.objects.create(
            name='PY', weekly_capacity=36, department=self.dept_y, role=role
        )
        self.pz = Person.objects.create(
            name='PZ', weekly_capacity=36, department=self.dept_z, role=role
        )

    def test_people_include_children(self):
        url = (
            f'/api/people/?department={self.dept_x.id}'
            f'&include_children=1&all=true'
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 2)

    def test_people_no_children(self):
        url = (
            f'/api/people/?department={self.dept_x.id}'
            f'&include_children=0&all=true'
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(len(data), 1)
