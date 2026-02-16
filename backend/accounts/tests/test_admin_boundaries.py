from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from people.models import Person


class AdminBoundaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='admin-pass-123',
            is_staff=True,
        )
        self.superuser = User.objects.create_superuser(
            username='root',
            email='root@example.com',
            password='root-pass-123',
        )
        self.manager = User.objects.create_user(
            username='manager',
            email='manager@example.com',
            password='manager-pass-123',
            is_staff=False,
        )
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)
        self.target = User.objects.create_user(
            username='target',
            email='target@example.com',
            password='target-pass-123',
        )
        self.super_target = User.objects.create_superuser(
            username='super-target',
            email='super-target@example.com',
            password='super-target-pass-123',
        )
        self.person = Person.objects.create(name='Target Person', email='target@example.com')

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_manager_forbidden_on_admin_sensitive_endpoints(self):
        self._auth(self.manager)
        r1 = self.client.post(
            '/api/auth/set_password/',
            {'userId': self.target.id, 'newPassword': 'SecurePass!1234'},
            format='json',
        )
        self.assertEqual(r1.status_code, status.HTTP_403_FORBIDDEN)

        r2 = self.client.delete(f'/api/auth/users/{self.target.id}/')
        self.assertEqual(r2.status_code, status.HTTP_403_FORBIDDEN)

        r3 = self.client.post(
            f'/api/auth/users/{self.target.id}/role/',
            {'role': 'manager'},
            format='json',
        )
        self.assertEqual(r3.status_code, status.HTTP_403_FORBIDDEN)

        r4 = self.client.post(
            f'/api/auth/users/{self.target.id}/link_person/',
            {'personId': self.person.id},
            format='json',
        )
        self.assertEqual(r4.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_allowed_for_regular_targets(self):
        self._auth(self.admin)
        r1 = self.client.post(
            '/api/auth/set_password/',
            {'userId': self.target.id, 'newPassword': 'SecurePass!1234'},
            format='json',
        )
        self.assertEqual(r1.status_code, status.HTTP_204_NO_CONTENT)

        r2 = self.client.post(
            f'/api/auth/users/{self.target.id}/role/',
            {'role': 'manager'},
            format='json',
        )
        self.assertEqual(r2.status_code, status.HTTP_200_OK)

        r3 = self.client.post(
            f'/api/auth/users/{self.target.id}/link_person/',
            {'personId': self.person.id},
            format='json',
        )
        self.assertEqual(r3.status_code, status.HTTP_200_OK)

        delete_target = get_user_model().objects.create_user(
            username='delete-me',
            email='delete-me@example.com',
            password='delete-pass-123',
        )
        r4 = self.client.delete(f'/api/auth/users/{delete_target.id}/')
        self.assertEqual(r4.status_code, status.HTTP_204_NO_CONTENT)

    def test_non_superuser_cannot_modify_superuser_target(self):
        self._auth(self.admin)
        r1 = self.client.post(
            '/api/auth/set_password/',
            {'userId': self.super_target.id, 'newPassword': 'SecurePass!1234'},
            format='json',
        )
        self.assertEqual(r1.status_code, status.HTTP_403_FORBIDDEN)

        r2 = self.client.post(
            f'/api/auth/users/{self.super_target.id}/role/',
            {'role': 'manager'},
            format='json',
        )
        self.assertEqual(r2.status_code, status.HTTP_403_FORBIDDEN)

        r3 = self.client.post(
            f'/api/auth/users/{self.super_target.id}/link_person/',
            {'personId': self.person.id},
            format='json',
        )
        self.assertEqual(r3.status_code, status.HTTP_403_FORBIDDEN)

        r4 = self.client.delete(f'/api/auth/users/{self.super_target.id}/')
        self.assertEqual(r4.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_modify_superuser_target(self):
        self._auth(self.superuser)
        r1 = self.client.post(
            '/api/auth/set_password/',
            {'userId': self.super_target.id, 'newPassword': 'SecurePass!1234'},
            format='json',
        )
        self.assertEqual(r1.status_code, status.HTTP_204_NO_CONTENT)
