from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from assignments.models import Assignment
from core.models import AutoHoursRoleSetting, AutoHoursTemplate, AutoHoursTemplateRoleSetting
from departments.models import Department
from people.models import Person
from projects.models import Project, ProjectRole
from roles.models import Role


class RoleCapacityTemplateMappingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username='role_capacity_user', password='pw')
        self.client.force_authenticate(self.user)

        self.department = Department.objects.create(name='Forecast Dept')
        self.people_role_a = Role.objects.create(name='Forecast Role A', is_active=True, sort_order=1)
        self.people_role_b = Role.objects.create(name='Forecast Role B', is_active=True, sort_order=2)
        self.template = AutoHoursTemplate.objects.create(
            name='Forecast Template',
            phase_keys=['sd'],
            weeks_by_phase={'sd': 6},
        )
        self.project = Project.objects.create(
            name='Forecast Project',
            auto_hours_template=self.template,
            is_active=True,
        )

        self.mapped_project_role = ProjectRole.objects.create(
            name='Template PM',
            normalized_name='template pm',
            department=self.department,
            is_active=True,
        )
        self.unmapped_project_role = ProjectRole.objects.create(
            name='Template QA',
            normalized_name='template qa',
            department=self.department,
            is_active=True,
        )

        mapping_setting = AutoHoursTemplateRoleSetting.objects.create(
            template=self.template,
            role=self.mapped_project_role,
            ramp_percent_by_phase={'sd': {'0': 50}},
            role_count_by_phase={'sd': 1},
        )
        mapping_setting.people_roles.set([self.people_role_a, self.people_role_b])

        today = date.today()
        days_since_sunday = (today.weekday() + 1) % 7
        self.week0 = (today if days_since_sunday == 0 else today - timedelta(days=days_since_sunday)).isoformat()

        Assignment.objects.create(
            person=None,
            project=self.project,
            department=self.department,
            role_on_project_ref=self.mapped_project_role,
            weekly_hours={self.week0: 12},
            is_active=True,
        )
        Assignment.objects.create(
            person=None,
            project=self.project,
            department=self.department,
            role_on_project_ref=self.unmapped_project_role,
            weekly_hours={self.week0: 8},
            is_active=True,
        )

        person = Person.objects.create(
            name='Assigned Person',
            department=self.department,
            role=self.people_role_a,
            weekly_capacity=40,
            is_active=True,
        )
        Assignment.objects.create(
            person=person,
            project=self.project,
            department=self.department,
            weekly_hours={self.week0: 4},
            is_active=True,
        )

    def test_role_capacity_includes_projected_demand_split_and_unmapped_summary(self):
        resp = self.client.get(
            '/api/assignments/analytics_role_capacity/',
            {
                'department': self.department.id,
                'weeks': 4,
                'role_ids': f'{self.people_role_a.id},{self.people_role_b.id}',
                'nocache': 1,
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()
        self.assertIn('summary', payload)
        self.assertIn(self.week0, payload['weekKeys'])
        idx = payload['weekKeys'].index(self.week0)

        series_by_role = {int(item['roleId']): item for item in payload.get('series', [])}
        role_a = series_by_role[self.people_role_a.id]
        role_b = series_by_role[self.people_role_b.id]

        self.assertAlmostEqual(float(role_a['assigned'][idx]), 4.0)
        self.assertAlmostEqual(float(role_a['projected'][idx]), 6.0)
        self.assertAlmostEqual(float(role_a['demand'][idx]), 10.0)

        self.assertAlmostEqual(float(role_b['assigned'][idx]), 0.0)
        self.assertAlmostEqual(float(role_b['projected'][idx]), 6.0)
        self.assertAlmostEqual(float(role_b['demand'][idx]), 6.0)

        summary = payload.get('summary') or {}
        self.assertAlmostEqual(float(summary.get('mappedProjectedHours') or 0.0), 12.0)
        self.assertAlmostEqual(float(summary.get('unmappedProjectRoleHours') or 0.0), 8.0)
        self.assertEqual(int(summary.get('mappedTemplateRolePairsUsed') or 0), 1)

    def test_role_capacity_uses_global_mapping_for_projects_without_template(self):
        default_project = Project.objects.create(
            name='Default Mapping Project',
            auto_hours_template=None,
            is_active=True,
        )
        default_mapped_role = ProjectRole.objects.create(
            name='Default PM',
            normalized_name='default pm',
            department=self.department,
            is_active=True,
        )
        global_setting = AutoHoursRoleSetting.objects.create(
            role=default_mapped_role,
            standard_percent_of_capacity=0,
            ramp_percent_by_week={},
            ramp_percent_by_phase={'sd': {'0': 10}},
            role_count_by_phase={'sd': 1},
        )
        global_setting.people_roles.set([self.people_role_a])

        Assignment.objects.create(
            person=None,
            project=default_project,
            department=self.department,
            role_on_project_ref=default_mapped_role,
            weekly_hours={self.week0: 5},
            is_active=True,
        )

        resp = self.client.get(
            '/api/assignments/analytics_role_capacity/',
            {
                'department': self.department.id,
                'weeks': 4,
                'role_ids': f'{self.people_role_a.id},{self.people_role_b.id}',
                'nocache': 1,
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        payload = resp.json()
        idx = payload['weekKeys'].index(self.week0)
        series_by_role = {int(item['roleId']): item for item in payload.get('series', [])}
        role_a = series_by_role[self.people_role_a.id]

        self.assertAlmostEqual(float(role_a['projected'][idx]), 11.0)
        self.assertAlmostEqual(float(role_a['demand'][idx]), 15.0)

        summary = payload.get('summary') or {}
        self.assertAlmostEqual(float(summary.get('mappedProjectedHours') or 0.0), 17.0)
        self.assertAlmostEqual(float(summary.get('unmappedProjectRoleHours') or 0.0), 8.0)
        self.assertEqual(int(summary.get('mappedTemplateRolePairsUsed') or 0), 2)
