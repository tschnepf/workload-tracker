from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from people.models import Person


class DepartmentSecondaryManagersApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username='dept-admin',
            email='dept-admin@example.com',
            password='password-123',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

        self.primary = Person.objects.create(name='Primary Manager')
        self.secondary_one = Person.objects.create(name='Secondary One')
        self.secondary_two = Person.objects.create(name='Secondary Two')

    def test_create_department_with_secondary_managers(self):
        payload = {
            'name': 'Controls',
            'manager': self.primary.id,
            'secondaryManagers': [self.secondary_one.id, self.secondary_two.id],
            'isActive': True,
        }
        create_resp = self.client.post('/api/departments/', payload, format='json')
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        dept_id = create_resp.data['id']

        self.assertEqual(create_resp.data['manager'], self.primary.id)
        self.assertEqual(create_resp.data['managerName'], 'Primary Manager')
        self.assertCountEqual(
            create_resp.data.get('secondaryManagers') or [],
            [self.secondary_one.id, self.secondary_two.id],
        )
        self.assertCountEqual(
            create_resp.data.get('secondaryManagerNames') or [],
            ['Secondary One', 'Secondary Two'],
        )

        detail_resp = self.client.get(f'/api/departments/{dept_id}/')
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)
        self.assertCountEqual(
            detail_resp.data.get('secondaryManagerNames') or [],
            ['Secondary One', 'Secondary Two'],
        )

    def test_primary_manager_cannot_also_be_secondary_manager(self):
        create_resp = self.client.post(
            '/api/departments/',
            {
                'name': 'Mechanical',
                'manager': self.primary.id,
                'secondaryManagers': [self.secondary_one.id],
                'isActive': True,
            },
            format='json',
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)

        dept_id = create_resp.data['id']
        patch_resp = self.client.patch(
            f'/api/departments/{dept_id}/',
            {'manager': self.secondary_one.id},
            format='json',
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('secondaryManagers', patch_resp.data)
