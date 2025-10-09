from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from departments.models import Department
from projects.models import ProjectRole


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

