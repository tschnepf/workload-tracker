from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from departments.models import Department
from projects.models import ProjectRole


class ProjectRolesListFiltersTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='user', password='user')
        self.client.force_authenticate(self.user)
        self.dept = Department.objects.create(name='Ops')

    def test_default_list_active_only_and_sorted(self):
        # Create roles with mixed active and sort orders
        ProjectRole.objects.create(name='b role', normalized_name='b role', department=self.dept, is_active=True, sort_order=2)
        ProjectRole.objects.create(name='a role', normalized_name='a role', department=self.dept, is_active=True, sort_order=1)
        ProjectRole.objects.create(name='z inactive', normalized_name='z inactive', department=self.dept, is_active=False, sort_order=0)
        res = self.client.get('/api/projects/project-roles/', {'department': self.dept.id})
        self.assertEqual(res.status_code, 200, res.content)
        names = [r['name'] for r in res.json()]
        # inactive excluded
        self.assertNotIn('z inactive', names)
        # sorted by is_active DESC (all active), then sort_order ASC, then name ASC
        self.assertEqual(names, ['a role', 'b role'])

    def test_include_inactive_true(self):
        ProjectRole.objects.create(name='active1', normalized_name='active1', department=self.dept, is_active=True, sort_order=0)
        ProjectRole.objects.create(name='inactive1', normalized_name='inactive1', department=self.dept, is_active=False, sort_order=0)
        res = self.client.get('/api/projects/project-roles/', {'department': self.dept.id, 'include_inactive': 'true'})
        self.assertEqual(res.status_code, 200)
        names = [r['name'] for r in res.json()]
        self.assertIn('active1', names)
        self.assertIn('inactive1', names)

