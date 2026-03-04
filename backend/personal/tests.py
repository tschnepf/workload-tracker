from datetime import date

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from accounts.models import UserProfile
from assignments.models import Assignment
from core.week_utils import sunday_of_week
from departments.models import Department
from people.models import Person
from projects.models import Project, ProjectRole


class PersonalWorkEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.User = get_user_model()

    def test_unauthenticated_returns_401(self):
        resp = self.client.get('/api/personal/work/')
        self.assertIn(resp.status_code, (401, 403))  # default IsAuthenticated should be enforced

    def test_no_linked_person_returns_404(self):
        user = self.User.objects.create_user(username='u1', password='pw')
        # Ensure profile exists but person remains None.
        UserProfile.objects.get_or_create(user=user, defaults={'person': None})
        self.client.force_authenticate(user=user)
        resp = self.client.get('/api/personal/work/')
        self.assertEqual(resp.status_code, 404)

    def test_happy_path_and_etag_cycle(self):
        user = self.User.objects.create_user(username='u2', password='pw')
        person = Person.objects.create(name='P1', weekly_capacity=36)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.person = person
        profile.save(update_fields=['person', 'updated_at'])
        self.client.force_authenticate(user=user)

        # First request returns 200 and an ETag
        resp = self.client.get('/api/personal/work/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.data, dict)
        for key in ('summary', 'alerts', 'projects', 'deliverables', 'preItems', 'schedule'):
            self.assertIn(key, resp.data)
        etag = resp.headers.get('ETag') or resp.headers.get('etag')
        self.assertTrue(etag)

        # Second request with If-None-Match should produce 304
        resp2 = self.client.get('/api/personal/work/', HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(resp2.status_code, 304)


class PersonalLeadProjectGridEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.User = get_user_model()

        self.user = self.User.objects.create_user(username='lead_u', password='pw')
        self.person = Person.objects.create(name='Lead User', weekly_capacity=40)
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.person = self.person
        profile.save(update_fields=['person', 'updated_at'])
        self.client.force_authenticate(user=self.user)

        self.dept_elec = Department.objects.create(name='Electrical')
        self.dept_mech = Department.objects.create(name='Mechanical')
        self.person.department = self.dept_elec
        self.person.save(update_fields=['department', 'updated_at'])

        self.project_a = Project.objects.create(name='Project A', client='Acme', status='active')
        self.project_b = Project.objects.create(name='Project B', client='Beta', status='active')

        self.role_elec_lead = ProjectRole.objects.create(name='ELECTRICAL LEAD', department=self.dept_elec)
        self.role_elec_eng = ProjectRole.objects.create(name='Electrical Engineer', department=self.dept_elec)
        self.role_mech_lead = ProjectRole.objects.create(name='Mechanical Lead', department=self.dept_mech)

        self.current_week = sunday_of_week(date.today()).isoformat()

    def test_no_linked_person_returns_404(self):
        user = self.User.objects.create_user(username='lead_u2', password='pw')
        UserProfile.objects.get_or_create(user=user, defaults={'person': None})
        self.client.force_authenticate(user=user)
        resp = self.client.get('/api/personal/lead_project_grid/')
        self.assertEqual(resp.status_code, 404)

    def test_lead_projects_scoped_to_lead_department_and_include_placeholders(self):
        # Current user is lead on project A in electrical.
        Assignment.objects.create(
            person=self.person,
            project=self.project_a,
            role_on_project_ref=self.role_elec_lead,
            department=self.dept_elec,
            is_active=True,
            weekly_hours={self.current_week: 8},
        )
        # Current user on project B but not a lead role (must not include project B).
        Assignment.objects.create(
            person=self.person,
            project=self.project_b,
            role_on_project_ref=self.role_elec_eng,
            department=self.dept_elec,
            is_active=True,
            weekly_hours={self.current_week: 4},
        )

        elec_teammate = Person.objects.create(name='Elec Teammate', department=self.dept_elec)
        mech_teammate = Person.objects.create(name='Mech Teammate', department=self.dept_mech)

        include_person_assignment = Assignment.objects.create(
            person=elec_teammate,
            project=self.project_a,
            role_on_project_ref=self.role_elec_eng,
            department=self.dept_elec,
            is_active=True,
            weekly_hours={self.current_week: 6},
        )
        exclude_person_assignment = Assignment.objects.create(
            person=mech_teammate,
            project=self.project_a,
            role_on_project_ref=self.role_mech_lead,
            department=self.dept_mech,
            is_active=True,
            weekly_hours={self.current_week: 6},
        )
        include_placeholder = Assignment.objects.create(
            person=None,
            project=self.project_a,
            role_on_project_ref=self.role_elec_eng,
            department=self.dept_elec,
            is_active=True,
            weekly_hours={self.current_week: 3},
        )
        exclude_placeholder = Assignment.objects.create(
            person=None,
            project=self.project_a,
            role_on_project_ref=self.role_mech_lead,
            department=self.dept_mech,
            is_active=True,
            weekly_hours={self.current_week: 2},
        )

        resp = self.client.get('/api/personal/lead_project_grid/')
        self.assertEqual(resp.status_code, 200)
        payload = resp.data
        self.assertIn('weekKeys', payload)
        self.assertEqual(len(payload.get('weekKeys') or []), 12)

        projects = payload.get('projects') or []
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]['id'], self.project_a.id)
        self.assertEqual(projects[0]['scopedDepartmentIds'], [self.dept_elec.id])
        self.assertIn('ELECTRICAL LEAD', projects[0]['leadRoleNames'])

        rows = (payload.get('assignmentsByProject') or {}).get(str(self.project_a.id), [])
        row_ids = {int(row['id']) for row in rows}
        self.assertIn(include_person_assignment.id, row_ids)
        self.assertIn(include_placeholder.id, row_ids)
        self.assertNotIn(exclude_person_assignment.id, row_ids)
        self.assertNotIn(exclude_placeholder.id, row_ids)

    def test_weeks_clamp(self):
        Assignment.objects.create(
            person=self.person,
            project=self.project_a,
            role_on_project_ref=self.role_elec_lead,
            department=self.dept_elec,
            is_active=True,
            weekly_hours={self.current_week: 8},
        )
        low = self.client.get('/api/personal/lead_project_grid/?weeks=0')
        self.assertEqual(low.status_code, 200)
        self.assertEqual(len(low.data.get('weekKeys') or []), 1)

        high = self.client.get('/api/personal/lead_project_grid/?weeks=100')
        self.assertEqual(high.status_code, 200)
        self.assertEqual(len(high.data.get('weekKeys') or []), 52)
