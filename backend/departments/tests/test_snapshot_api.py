from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from departments.models import Department
from people.models import Person


class DepartmentsSnapshotApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username='departments-snapshot-user',
            email='departments-snapshot@example.com',
            password='password-123',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.user)

        self.parent_department = Department.objects.create(name='Operations')
        self.child_department = Department.objects.create(
            name='Operations - West',
            parent_department=self.parent_department,
        )

        self.parent_person = Person.objects.create(name='Morgan Ops', department=self.parent_department)
        self.child_person = Person.objects.create(name='Taylor West', department=self.child_department)

    def test_snapshot_returns_departments_and_people_payload(self):
        response = self.client.get(
            '/api/departments/snapshot/?include=departments,people&page_size=200&people_page_size=200'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        payload = response.json()
        self.assertEqual(payload.get('contractVersion'), 1)
        self.assertIn('departments', payload)
        self.assertIn('people', payload)
        self.assertCountEqual(payload.get('included', []), ['departments', 'people'])

        department_ids = [row.get('id') for row in payload.get('departments', {}).get('results', [])]
        people_ids = [row.get('id') for row in payload.get('people', {}).get('results', [])]

        self.assertIn(self.parent_department.id, department_ids)
        self.assertIn(self.child_department.id, department_ids)
        self.assertIn(self.parent_person.id, people_ids)
        self.assertIn(self.child_person.id, people_ids)

    def test_snapshot_department_scope_with_children(self):
        response = self.client.get(
            f'/api/departments/snapshot/?include=departments,people&department={self.parent_department.id}&include_children=1&page_size=200&people_page_size=200'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()

        department_ids = [row.get('id') for row in payload.get('departments', {}).get('results', [])]
        people_ids = [row.get('id') for row in payload.get('people', {}).get('results', [])]

        self.assertIn(self.parent_department.id, department_ids)
        self.assertIn(self.child_department.id, department_ids)
        self.assertIn(self.parent_person.id, people_ids)
        self.assertIn(self.child_person.id, people_ids)

    def test_snapshot_respects_feature_flag(self):
        original = settings.FEATURES.get('FF_MODERATE_PAGES_SNAPSHOTS', True)
        settings.FEATURES['FF_MODERATE_PAGES_SNAPSHOTS'] = False
        try:
            response = self.client.get('/api/departments/snapshot/')
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        finally:
            settings.FEATURES['FF_MODERATE_PAGES_SNAPSHOTS'] = original
