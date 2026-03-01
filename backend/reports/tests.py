from datetime import date, timedelta
from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework import status

from projects.models import Project
from people.models import Person
from assignments.models import Assignment
from departments.models import Department
from verticals.models import Vertical
from skills.models import SkillTag, PersonSkill
from roles.models import Role
from deliverables.models import Deliverable, PreDeliverableType, PreDeliverableItem, DeliverableAssignment
from core.cache_keys import build_aggregate_cache_key


class PreDeliverableReportsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username='user', password='pw')
        self.client.force_authenticate(user=u)
        # Seed types if not present
        self.specs, _ = PreDeliverableType.objects.get_or_create(name='Specifications', defaults={'default_days_before': 1})
        self.toc, _ = PreDeliverableType.objects.get_or_create(name='Specification TOC', defaults={'default_days_before': 3})
        self.p = Project.objects.create(name='Proj A')
        self.p2 = Project.objects.create(name='Proj B')
        self.alice = Person.objects.create(name='Alice', weekly_capacity=40)
        self.bob = Person.objects.create(name='Bob', weekly_capacity=36)
        d0 = Deliverable.objects.create(project=self.p, description='IFC', date=date.today() + timedelta(days=10))
        d1 = Deliverable.objects.create(project=self.p2, description='DD', date=date.today() + timedelta(days=5))
        DeliverableAssignment.objects.create(deliverable=d0, person=self.alice)
        DeliverableAssignment.objects.create(deliverable=d0, person=self.bob)
        DeliverableAssignment.objects.create(deliverable=d1, person=self.alice)
        PreDeliverableItem.objects.create(deliverable=d0, pre_deliverable_type=self.specs, generated_date=date.today() + timedelta(days=9), days_before=1, is_completed=True, completed_date=date.today())
        PreDeliverableItem.objects.create(deliverable=d0, pre_deliverable_type=self.toc, generated_date=date.today() - timedelta(days=1), days_before=3, is_completed=False)
        PreDeliverableItem.objects.create(deliverable=d1, pre_deliverable_type=self.specs, generated_date=date.today() + timedelta(days=4), days_before=1, is_completed=False)

    def test_completion_summary(self):
        resp = self.client.get('/api/reports/pre-deliverable-completion/?date_from=' + (date.today() - timedelta(days=30)).isoformat())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data['total'], 3)
        self.assertEqual(data['completed'], 1)
        self.assertGreaterEqual(data['overdue'], 1)
        self.assertIn('byProject', data)
        self.assertIn('byType', data)

    def test_team_performance(self):
        # Requires admin; but endpoint enforces IsAdminUser; here we simulate by is_staff
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username='admin', password='pw', is_staff=True)
        self.client.force_authenticate(user=u)
        resp = self.client.get('/api/reports/pre-deliverable-team-performance/?date_from=' + (date.today() - timedelta(days=30)).isoformat())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        items = resp.json().get('people', [])
        # Alice is assigned to both deliverables; Bob to one
        names = {i['personName'] for i in items}
        self.assertIn('Alice', names)
        self.assertIn('Bob', names)


class DepartmentsOverviewReportsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_user(username='report_user', password='pw')
        self.client.force_authenticate(user=self.user)

        self.vertical = Vertical.objects.create(name='Architecture')
        self.parent_dept = Department.objects.create(name='Design', vertical=self.vertical)
        self.child_dept = Department.objects.create(
            name='Drafting',
            parent_department=self.parent_dept,
            vertical=self.vertical,
        )
        self.other_dept = Department.objects.create(name='QA', vertical=self.vertical)

        self.project = Project.objects.create(name='Project Overview', vertical=self.vertical)
        self.alice = Person.objects.create(name='Alice', department=self.parent_dept, weekly_capacity=40)
        self.bob = Person.objects.create(name='Bob', department=self.child_dept, weekly_capacity=36)
        self.cara = Person.objects.create(name='Cara', department=self.other_dept, weekly_capacity=32)

        # Use current Monday key to match utilization aggregation logic.
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        week_key = monday.isoformat()

        Assignment.objects.create(
            person=self.alice,
            project=self.project,
            weekly_hours={week_key: 20},
            is_active=True,
        )
        Assignment.objects.create(
            person=self.bob,
            project=self.project,
            weekly_hours={week_key: 30},
            is_active=True,
        )
        Assignment.objects.create(
            person=self.cara,
            project=self.project,
            weekly_hours={week_key: 10},
            is_active=True,
        )

        hvac = SkillTag.objects.create(name='HVAC')
        drafting = SkillTag.objects.create(name='Drafting')
        PersonSkill.objects.create(
            person=self.alice,
            skill_tag=hvac,
            skill_type='strength',
            proficiency_level='advanced',
        )
        PersonSkill.objects.create(
            person=self.bob,
            skill_tag=drafting,
            skill_type='strength',
            proficiency_level='intermediate',
        )

    def test_departments_overview_shape(self):
        resp = self.client.get('/api/reports/departments/overview/?weeks=4')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data.get('contractVersion'), 1)
        self.assertIn('partialFailures', data)
        self.assertIn('errorsByScope', data)
        self.assertIn('departments', data)
        self.assertIn('overviewByDepartment', data)
        self.assertIn('analyticsSeries', data)

        departments = data.get('departments', [])
        self.assertGreaterEqual(len(departments), 3)
        overview = data.get('overviewByDepartment', {})
        self.assertIn(str(self.parent_dept.id), overview)
        self.assertIn(str(self.child_dept.id), overview)

        parent_entry = overview[str(self.parent_dept.id)]
        self.assertEqual(parent_entry['peopleCount'], 1)
        self.assertIn('dashboardSummary', parent_entry)
        self.assertIn('skills', parent_entry)
        self.assertGreaterEqual(parent_entry['dashboardSummary']['totalAssignments'], 1)

    def test_departments_overview_department_scope_with_children(self):
        base = f'/api/reports/departments/overview/?department={self.parent_dept.id}'
        no_children = self.client.get(base)
        self.assertEqual(no_children.status_code, status.HTTP_200_OK)
        dept_ids_no_children = {d['id'] for d in no_children.json().get('departments', [])}
        self.assertIn(self.parent_dept.id, dept_ids_no_children)
        self.assertNotIn(self.child_dept.id, dept_ids_no_children)

        with_children = self.client.get(base + '&include_children=1')
        self.assertEqual(with_children.status_code, status.HTTP_200_OK)
        dept_ids_with_children = {d['id'] for d in with_children.json().get('departments', [])}
        self.assertIn(self.parent_dept.id, dept_ids_with_children)
        self.assertIn(self.child_dept.id, dept_ids_with_children)

    def test_departments_overview_cache_headers_and_stale_fallback(self):
        features = dict(getattr(settings, 'FEATURES', {}) or {})
        features['SHORT_TTL_AGGREGATES'] = True
        with override_settings(FEATURES=features):
            cache.clear()
            url = '/api/reports/departments/overview/?weeks=4'

            first = self.client.get(url)
            self.assertEqual(first.status_code, status.HTTP_200_OK)
            self.assertEqual(first.headers.get('X-Overview-Cache'), 'generated')

            second = self.client.get(url)
            self.assertEqual(second.status_code, status.HTTP_200_OK)
            self.assertEqual(second.headers.get('X-Overview-Cache'), 'fresh')

            factory = APIRequestFactory()
            request_for_key = factory.get('/api/reports/departments/overview/?weeks=4')
            request_for_key.user = self.user
            base_key = build_aggregate_cache_key(
                'reports.departments.overview',
                request_for_key,
                filters={
                    'weeks': 4,
                    'vertical': 'all',
                    'department': 'all',
                    'include_children': 0,
                    'include_inactive': 0,
                    'status_in': [],
                    'search': '',
                },
            )
            fresh_key = f'{base_key}:fresh'
            stale_key = f'{base_key}:stale'
            lock_key = f'{base_key}:lock'
            self.assertIsNotNone(cache.get(stale_key))
            cache.delete(fresh_key)
            cache.set(lock_key, '1', timeout=5)
            stale_resp = self.client.get(url)
            self.assertEqual(stale_resp.status_code, status.HTTP_200_OK)
            self.assertEqual(stale_resp.headers.get('X-Overview-Cache'), 'stale')

    @override_settings(REPORTS_DEPARTMENTS_OVERVIEW_DEADLINE_MS=0)
    def test_departments_overview_deadline_budget_returns_partial(self):
        resp = self.client.get('/api/reports/departments/overview/?weeks=4')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        payload = resp.json()
        self.assertIn('aggregate', payload.get('partialFailures', []))
        self.assertIn('aggregate', payload.get('errorsByScope', {}))
        self.assertEqual(payload['errorsByScope']['aggregate']['code'], 'deadline_exceeded')


class ReportsBootstrapEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.admin = User.objects.create_user(username='reports_admin', password='pw', is_staff=True)
        self.user = User.objects.create_user(username='reports_user', password='pw', is_staff=False)

        self.vertical = Vertical.objects.create(name='Interiors')
        self.department = Department.objects.create(name='Studio', vertical=self.vertical, is_active=True)
        self.project = Project.objects.create(name='Bootstrap Project', vertical=self.vertical, is_active=True)

        self.role, _ = Role.objects.get_or_create(
            name='Designer Bootstrap',
            defaults={'is_active': True, 'sort_order': 1},
        )
        self.person = Person.objects.create(
            name='Bootstrap Person',
            department=self.department,
            role=self.role,
            weekly_capacity=40,
            is_active=True,
        )

        today = date.today()
        sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        week_key = sunday.isoformat()
        Assignment.objects.create(
            person=self.person,
            project=self.project,
            weekly_hours={week_key: 18},
            is_active=True,
        )

    def test_role_capacity_bootstrap_returns_expected_shape_for_authenticated_user(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get('/api/reports/role-capacity/bootstrap/?weeks=4')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        data = resp.json()
        self.assertIn('departments', data)
        self.assertIn('roles', data)
        self.assertIn('timeline', data)
        self.assertIn('weekKeys', data['timeline'])
        self.assertIn('series', data['timeline'])
        self.assertIn('summary', data)
        self.assertGreaterEqual(len(data['roles']), 1)
        self.assertGreaterEqual(len(data['timeline']['weekKeys']), 1)

    def test_forecast_bootstrap_is_admin_only(self):
        self.client.force_authenticate(self.user)
        forbidden = self.client.get('/api/reports/forecast/bootstrap/?weeks=8')
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN, forbidden.content)

        self.client.force_authenticate(self.admin)
        allowed = self.client.get('/api/reports/forecast/bootstrap/?weeks=8')
        self.assertEqual(allowed.status_code, status.HTTP_200_OK, allowed.content)
        payload = allowed.json()
        self.assertIn('departments', payload)
        self.assertIn('projects', payload)
        self.assertIn('workloadForecast', payload)
