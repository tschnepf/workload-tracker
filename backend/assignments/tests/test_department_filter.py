from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from datetime import date, timedelta

from departments.models import Department
from roles.models import Role
from people.models import Person
from assignments.models import Assignment


def sunday_of_week(d):
    weekday = d.weekday()
    days_since_sunday = (weekday + 1) % 7
    return d - timedelta(days=days_since_sunday)


class AssignmentDepartmentFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Departments: A -> B -> C, and sibling D
        self.dept_a = Department.objects.create(name='A')
        self.dept_b = Department.objects.create(
            name='B', parent_department=self.dept_a
        )
        self.dept_c = Department.objects.create(
            name='C', parent_department=self.dept_b
        )
        self.dept_d = Department.objects.create(name='D')

        role, _ = Role.objects.get_or_create(name='Engineer')

        self.p1 = Person.objects.create(
            name='P1', weekly_capacity=36, department=self.dept_a, role=role
        )
        self.p2 = Person.objects.create(
            name='P2', weekly_capacity=36, department=self.dept_b, role=role
        )
        self.p3 = Person.objects.create(
            name='P3', weekly_capacity=36, department=self.dept_c, role=role
        )
        self.p4 = Person.objects.create(
            name='P4', weekly_capacity=36, department=self.dept_d, role=role
        )

        wk = sunday_of_week(date.today()).strftime('%Y-%m-%d')
        Assignment.objects.create(person=self.p1, weekly_hours={wk: 5})
        Assignment.objects.create(person=self.p2, weekly_hours={wk: 6})
        Assignment.objects.create(person=self.p3, weekly_hours={wk: 7})
        Assignment.objects.create(person=self.p4, weekly_hours={wk: 8})

    def test_include_children_true_filters_descendants(self):
        url = (
            f'/api/assignments/?department={self.dept_a.id}'
            f'&include_children=1&all=true'
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        # all=true returns a list
        self.assertIsInstance(data, list)
        # Should include A, B, C people assignments, exclude D
        self.assertEqual(len(data), 3)

    def test_include_children_false_only_root(self):
        url = (
            f'/api/assignments/?department={self.dept_a.id}'
            f'&include_children=0&all=true'
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(len(data), 1)

    def test_child_with_descendants(self):
        url = (
            f'/api/assignments/?department={self.dept_b.id}'
            f'&include_children=1&all=true'
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        # B and C
        self.assertEqual(len(data), 2)

    def test_invalid_department_ignored(self):
        url = '/api/assignments/?department=abc&include_children=1&all=true'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        # All assignments returned
        self.assertEqual(len(data), 4)

    def test_default_shape_without_all_param(self):
        url = (
            f'/api/assignments/?department={self.dept_a.id}'
            f'&include_children=1'
        )
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn('results', data)
        self.assertIn('count', data)
        self.assertEqual(len(data['results']), data['count'])
