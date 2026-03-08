from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from assignments.models import WeeklyAssignmentSnapshot
from core.models import NetworkGraphSettings
from departments.models import Department
from people.models import Person
from projects.models import Project
from verticals.models import Vertical


def _sunday(dt: date) -> date:
    return dt - timedelta(days=(dt.weekday() + 1) % 7)


class NetworkGraphApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(username='network_admin', password='pw', is_staff=True)
        self.manager = user_model.objects.create_user(username='network_manager', password='pw')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)
        self.user = user_model.objects.create_user(username='network_user', password='pw')

        self.vertical_a = Vertical.objects.create(name='Architecture')
        self.vertical_b = Vertical.objects.create(name='Engineering')
        self.dept_parent = Department.objects.create(name='Design', vertical=self.vertical_a, is_active=True)
        self.dept_child = Department.objects.create(name='Drafting', parent_department=self.dept_parent, vertical=self.vertical_a, is_active=True)
        self.dept_other = Department.objects.create(name='QA', vertical=self.vertical_b, is_active=True)

        self.person_a = Person.objects.create(name='Alice', department=self.dept_parent, weekly_capacity=40, is_active=True)
        self.person_b = Person.objects.create(name='Bob', department=self.dept_child, weekly_capacity=36, is_active=True)
        self.person_c = Person.objects.create(name='Cara', department=self.dept_other, weekly_capacity=32, is_active=True)
        self.person_inactive = Person.objects.create(name='Dormant', department=self.dept_parent, weekly_capacity=20, is_active=False)

        self.project_a = Project.objects.create(name='Project A', client='Acme', vertical=self.vertical_a, is_active=True)
        self.project_b = Project.objects.create(name='Project B', client='Acme', vertical=self.vertical_a, is_active=True)
        self.project_c = Project.objects.create(name='Project C', client='Globex', vertical=self.vertical_b, is_active=True)
        self.project_overhead = Project.objects.create(name='General Overhead', client='Acme', vertical=self.vertical_a, is_active=True)
        self.project_smc = Project.objects.create(name='Client Ops', client='SMC', vertical=self.vertical_a, is_active=True)
        self.project_inactive = Project.objects.create(name='Project Inactive', client='Acme', vertical=self.vertical_a, is_active=False)
        settings_obj = NetworkGraphSettings.get_active()
        settings_obj.omitted_project_ids = []
        settings_obj.save(update_fields=['omitted_project_ids', 'updated_at'])

        today_sunday = _sunday(date.today())
        week1 = today_sunday - timedelta(days=14)
        week2 = today_sunday - timedelta(days=7)
        week3 = today_sunday

        # Alice/Bob share Project A for 2 weeks and Project B for 1 week.
        for week in (week1, week2):
            WeeklyAssignmentSnapshot.objects.create(
                week_start=week,
                person=self.person_a,
                project=self.project_a,
                department_id=self.dept_parent.id,
                hours=10,
                person_name=self.person_a.name,
                project_name=self.project_a.name,
                client=self.project_a.client,
                person_is_active=True,
            )
            WeeklyAssignmentSnapshot.objects.create(
                week_start=week,
                person=self.person_b,
                project=self.project_a,
                department_id=self.dept_child.id,
                hours=12,
                person_name=self.person_b.name,
                project_name=self.project_a.name,
                client=self.project_a.client,
                person_is_active=True,
            )

        WeeklyAssignmentSnapshot.objects.create(
            week_start=week3,
            person=self.person_a,
            project=self.project_b,
            department_id=self.dept_parent.id,
            hours=8,
            person_name=self.person_a.name,
            project_name=self.project_b.name,
            client=self.project_b.client,
            person_is_active=True,
        )
        WeeklyAssignmentSnapshot.objects.create(
            week_start=week3,
            person=self.person_b,
            project=self.project_b,
            department_id=self.dept_child.id,
            hours=9,
            person_name=self.person_b.name,
            project_name=self.project_b.name,
            client=self.project_b.client,
            person_is_active=True,
        )

        # Another coworker pair to validate deterministic truncation behavior.
        WeeklyAssignmentSnapshot.objects.create(
            week_start=week3,
            person=self.person_b,
            project=self.project_c,
            department_id=self.dept_other.id,
            hours=4,
            person_name=self.person_b.name,
            project_name=self.project_c.name,
            client=self.project_c.client,
            person_is_active=True,
        )
        WeeklyAssignmentSnapshot.objects.create(
            week_start=week3,
            person=self.person_a,
            project=self.project_overhead,
            department_id=self.dept_parent.id,
            hours=7,
            person_name=self.person_a.name,
            project_name=self.project_overhead.name,
            client=self.project_overhead.client,
            person_is_active=True,
        )
        WeeklyAssignmentSnapshot.objects.create(
            week_start=week3,
            person=self.person_b,
            project=self.project_smc,
            department_id=self.dept_child.id,
            hours=6,
            person_name=self.person_b.name,
            project_name=self.project_smc.name,
            client=self.project_smc.client,
            person_is_active=True,
        )
        WeeklyAssignmentSnapshot.objects.create(
            week_start=week3,
            person=self.person_c,
            project=self.project_c,
            department_id=self.dept_other.id,
            hours=6,
            person_name=self.person_c.name,
            project_name=self.project_c.name,
            client=self.project_c.client,
            person_is_active=True,
        )

        # Inactive person/project rows for include_inactive checks.
        WeeklyAssignmentSnapshot.objects.create(
            week_start=week3,
            person=self.person_inactive,
            project=self.project_inactive,
            department_id=self.dept_parent.id,
            hours=5,
            person_name=self.person_inactive.name,
            project_name=self.project_inactive.name,
            client=self.project_inactive.client,
            person_is_active=False,
        )

        self.start = week1.isoformat()
        self.end = week3.isoformat()

    def _get(self, user, path: str):
        self.client.force_authenticate(user=user)
        return self.client.get(path)

    def test_permissions_admin_and_manager_allowed_regular_denied(self):
        manager_resp = self._get(self.manager, '/api/reports/network/bootstrap/')
        self.assertEqual(manager_resp.status_code, status.HTTP_200_OK, manager_resp.content)

        admin_resp = self._get(self.admin, '/api/reports/network/graph/?mode=project_people')
        self.assertEqual(admin_resp.status_code, status.HTTP_200_OK, admin_resp.content)

        user_resp = self._get(self.user, '/api/reports/network/graph/?mode=project_people')
        self.assertEqual(user_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_mode_date_and_range_return_400(self):
        self.client.force_authenticate(self.admin)
        bad_mode = self.client.get('/api/reports/network/graph/?mode=nope')
        self.assertEqual(bad_mode.status_code, status.HTTP_400_BAD_REQUEST)

        bad_date = self.client.get('/api/reports/network/graph/?mode=coworker&start=2026-99-99')
        self.assertEqual(bad_date.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('start', bad_date.json().get('error', ''))

        bad_range = self.client.get('/api/reports/network/graph/?mode=coworker&start=2026-02-15&end=2026-01-04')
        self.assertEqual(bad_range.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('start', bad_range.json().get('error', ''))

    def test_default_window_applies_when_no_dates(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get('/api/reports/network/graph/?mode=project_people')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()
        start = date.fromisoformat(payload['start'])
        end = date.fromisoformat(payload['end'])
        delta = (end - start).days
        self.assertGreaterEqual(delta, 680)
        self.assertLessEqual(delta, 760)

    def test_coworker_aggregation_and_score(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(
            f'/api/reports/network/graph/?mode=coworker&start={self.start}&end={self.end}'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        edges = resp.json()['edges']
        target = next((e for e in edges if e['id'] == f'coworker:{self.person_a.id}:{self.person_b.id}'), None)
        self.assertIsNotNone(target)
        self.assertEqual(target['metrics']['sharedProjectsCount'], 2)
        self.assertEqual(target['metrics']['sharedWeeksCount'], 3)
        self.assertEqual(float(target['score']), 9.0)

    def test_client_aggregation_and_score(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(
            f'/api/reports/network/graph/?mode=client_experience&client=Acme&start={self.start}&end={self.end}'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        edges = resp.json()['edges']
        target = next((e for e in edges if e['source'] == f'person:{self.person_a.id}'), None)
        self.assertIsNotNone(target)
        self.assertEqual(target['metrics']['distinctProjectsCount'], 2)
        self.assertEqual(target['metrics']['distinctWeeksCount'], 3)
        self.assertEqual(float(target['score']), 11.0)

    def test_filters_vertical_department_children_client_and_include_inactive(self):
        self.client.force_authenticate(self.admin)

        dept_no_children = self.client.get(
            f'/api/reports/network/graph/?mode=project_people&department={self.dept_parent.id}&include_children=0&start={self.start}&end={self.end}'
        )
        self.assertEqual(dept_no_children.status_code, status.HTTP_200_OK, dept_no_children.content)
        labels_no_children = {n['label'] for n in dept_no_children.json()['nodes']}
        self.assertIn(self.person_a.name, labels_no_children)
        self.assertNotIn(self.person_b.name, labels_no_children)

        dept_with_children = self.client.get(
            f'/api/reports/network/graph/?mode=project_people&department={self.dept_parent.id}&include_children=1&start={self.start}&end={self.end}'
        )
        self.assertEqual(dept_with_children.status_code, status.HTTP_200_OK, dept_with_children.content)
        labels_with_children = {n['label'] for n in dept_with_children.json()['nodes']}
        self.assertIn(self.person_b.name, labels_with_children)

        vertical_filtered = self.client.get(
            f'/api/reports/network/graph/?mode=project_people&vertical={self.vertical_b.id}&start={self.start}&end={self.end}'
        )
        self.assertEqual(vertical_filtered.status_code, status.HTTP_200_OK, vertical_filtered.content)
        labels_vertical = {n['label'] for n in vertical_filtered.json()['nodes']}
        self.assertIn(self.person_c.name, labels_vertical)
        self.assertNotIn(self.person_a.name, labels_vertical)

        client_filtered = self.client.get(
            f'/api/reports/network/graph/?mode=client_experience&client=Acme&start={self.start}&end={self.end}'
        )
        self.assertEqual(client_filtered.status_code, status.HTTP_200_OK, client_filtered.content)
        client_nodes = [n for n in client_filtered.json()['nodes'] if n['type'] == 'client']
        self.assertEqual(len(client_nodes), 1)
        self.assertEqual(client_nodes[0]['label'], 'Acme')

        inactive_default = self.client.get(
            f'/api/reports/network/graph/?mode=project_people&include_inactive=0&start={self.start}&end={self.end}'
        )
        self.assertEqual(inactive_default.status_code, status.HTTP_200_OK, inactive_default.content)
        inactive_default_labels = {n['label'] for n in inactive_default.json()['nodes']}
        self.assertNotIn(self.person_inactive.name, inactive_default_labels)

        include_inactive = self.client.get(
            f'/api/reports/network/graph/?mode=project_people&include_inactive=1&start={self.start}&end={self.end}'
        )
        self.assertEqual(include_inactive.status_code, status.HTTP_200_OK, include_inactive.content)
        include_inactive_labels = {n['label'] for n in include_inactive.json()['nodes']}
        self.assertIn(self.person_inactive.name, include_inactive_labels)

    def test_truncation_applies_cap_and_is_deterministic(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(
            f'/api/reports/network/graph/?mode=project_people&max_edges=1&start={self.start}&end={self.end}'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()
        self.assertTrue(payload['truncated'])
        self.assertEqual(len(payload['edges']), 1)
        edge = payload['edges'][0]
        self.assertEqual(edge['id'], f'assignment:{self.person_a.id}:{self.project_a.id}')

    def test_seeded_keyword_visibility_hides_overhead_and_smc_projects(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get(
            f'/api/reports/network/graph/?mode=project_people&start={self.start}&end={self.end}'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        labels = {n['label'] for n in resp.json()['nodes']}
        self.assertNotIn(self.project_overhead.name, labels)
        self.assertNotIn(self.project_smc.name, labels)

    def test_omitted_projects_setting_excludes_projects_from_all_modes(self):
        self.client.force_authenticate(self.admin)
        settings_obj = NetworkGraphSettings.get_active()
        settings_obj.omitted_project_ids = [self.project_a.id]
        settings_obj.save(update_fields=['omitted_project_ids', 'updated_at'])

        pp = self.client.get(
            f'/api/reports/network/graph/?mode=project_people&start={self.start}&end={self.end}'
        )
        self.assertEqual(pp.status_code, status.HTTP_200_OK, pp.content)
        pp_labels = {n['label'] for n in pp.json()['nodes']}
        self.assertNotIn(self.project_a.name, pp_labels)
        self.assertIn(self.project_b.name, pp_labels)

        cw = self.client.get(
            f'/api/reports/network/graph/?mode=coworker&start={self.start}&end={self.end}'
        )
        self.assertEqual(cw.status_code, status.HTTP_200_OK, cw.content)
        pair = next((e for e in cw.json()['edges'] if e['id'] == f'coworker:{self.person_a.id}:{self.person_b.id}'), None)
        self.assertIsNotNone(pair)
        self.assertEqual(pair['metrics']['sharedProjectsCount'], 1)
        self.assertEqual(pair['metrics']['sharedWeeksCount'], 1)

        cl = self.client.get(
            f'/api/reports/network/graph/?mode=client_experience&client=Acme&start={self.start}&end={self.end}'
        )
        self.assertEqual(cl.status_code, status.HTTP_200_OK, cl.content)
        edge = next((e for e in cl.json()['edges'] if e['source'] == f'person:{self.person_a.id}'), None)
        self.assertIsNotNone(edge)
        self.assertEqual(edge['metrics']['distinctProjectsCount'], 1)
