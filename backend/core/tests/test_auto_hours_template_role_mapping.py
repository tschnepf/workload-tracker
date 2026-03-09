from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from uuid import uuid4

from core.models import AutoHoursRoleSetting, AutoHoursTemplate, AutoHoursTemplateRoleSetting, DeliverablePhaseDefinition
from departments.models import Department
from projects.models import ProjectRole
from roles.models import Role


class AutoHoursTemplateRoleMappingApiTests(TestCase):
    def setUp(self):
        suffix = uuid4().hex[:8]
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(username=f'template_admin_{suffix}', password='pw', is_staff=True)
        self.client.force_authenticate(self.admin)

        self.department = Department.objects.create(name=f'Template Dept {suffix}')
        self.project_role = ProjectRole.objects.create(
            name=f'Project Designer {suffix}',
            normalized_name=f'project designer {suffix}',
            department=self.department,
            is_active=True,
            sort_order=1,
        )
        self.people_role_a = Role.objects.create(name=f'Architect {suffix}', is_active=True)
        self.people_role_b = Role.objects.create(name=f'Designer {suffix}', is_active=True)

        DeliverablePhaseDefinition.objects.get_or_create(
            key='sd',
            defaults={
                'label': 'SD',
                'description_tokens': ['sd'],
                'range_min': 1,
                'range_max': 100,
                'sort_order': 1,
            },
        )
        self.template = AutoHoursTemplate.objects.create(
            name=f'Template Mapping Source {suffix}',
            phase_keys=['sd'],
            weeks_by_phase={'sd': 6},
            is_active=True,
        )

    def test_template_settings_put_persists_people_role_ids(self):
        payload = {
            'settings': [
                {
                    'roleId': self.project_role.id,
                    'percentByWeek': {'0': 60},
                    'roleCount': 1,
                    'peopleRoleIds': [self.people_role_b.id, self.people_role_a.id, self.people_role_b.id],
                }
            ]
        }
        resp = self.client.put(
            f'/api/core/project-template-settings/{self.template.id}/?phase=sd',
            payload,
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        rows = resp.json()
        row = next(item for item in rows if int(item['roleId']) == self.project_role.id)
        self.assertEqual(row.get('peopleRoleIds'), [self.people_role_a.id, self.people_role_b.id])

        setting = AutoHoursTemplateRoleSetting.objects.get(template=self.template, role=self.project_role)
        mapped_ids = sorted(setting.people_roles.values_list('id', flat=True))
        self.assertEqual(mapped_ids, [self.people_role_a.id, self.people_role_b.id])

    def test_template_settings_put_rejects_unknown_people_role_ids(self):
        payload = {
            'settings': [
                {
                    'roleId': self.project_role.id,
                    'percentByWeek': {'0': 10},
                    'peopleRoleIds': [999999],
                }
            ]
        }
        resp = self.client.put(
            f'/api/core/project-template-settings/{self.template.id}/?phase=sd',
            payload,
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertIn('unknown peopleRoleIds', str(resp.json().get('error', '')))

    def test_template_settings_put_supports_template_local_milestone_key(self):
        template = AutoHoursTemplate.objects.create(
            name=f'Template Local Milestone {uuid4().hex[:8]}',
            milestones=[
                {
                    'key': 'permit-set',
                    'label': 'Permit Set',
                    'weeksCount': 3,
                    'sortOrder': 0,
                    'sourceType': 'template_local',
                }
            ],
            phase_keys=['permit-set'],
            weeks_by_phase={'permit-set': 3},
            is_active=True,
        )
        payload = {
            'settings': [
                {
                    'roleId': self.project_role.id,
                    'percentByWeek': {'0': 55},
                    'roleCount': 2,
                    'peopleRoleIds': [self.people_role_a.id],
                }
            ]
        }
        resp = self.client.put(
            f'/api/core/project-template-settings/{template.id}/?phase=permit-set',
            payload,
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        rows = resp.json()
        row = next(item for item in rows if int(item['roleId']) == self.project_role.id)
        self.assertEqual(int(row['roleCount']), 2)
        self.assertEqual(row.get('peopleRoleIds'), [self.people_role_a.id])

    def test_create_template_with_milestones_returns_compatibility_fields(self):
        payload = {
            'name': f'Template Milestones API {uuid4().hex[:8]}',
            'milestones': [
                {
                    'key': 'sd',
                    'label': 'Schematic Design',
                    'weeksCount': 4,
                    'sortOrder': 0,
                    'sourceType': 'global',
                    'globalPhaseKey': 'sd',
                },
                {
                    'key': 'permit-set',
                    'label': 'Permit Set',
                    'weeksCount': 2,
                    'sortOrder': 1,
                    'sourceType': 'template_local',
                },
            ],
        }
        resp = self.client.post('/api/core/project-templates/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        body = resp.json()
        self.assertEqual(body.get('phaseKeys'), ['sd', 'permit-set'])
        self.assertEqual(body.get('weeksByPhase', {}).get('sd'), 4)
        self.assertEqual(body.get('weeksByPhase', {}).get('permit-set'), 2)
        milestones = body.get('milestones') or []
        self.assertEqual(len(milestones), 2)
        self.assertEqual(milestones[1].get('key'), 'permit-set')

    def test_template_duplicate_copies_people_role_mappings(self):
        setting = AutoHoursTemplateRoleSetting.objects.create(
            template=self.template,
            role=self.project_role,
            ramp_percent_by_phase={'sd': {'0': 75}},
            role_count_by_phase={'sd': 2},
        )
        setting.people_roles.set([self.people_role_a, self.people_role_b])

        resp = self.client.post(
            f'/api/core/project-templates/{self.template.id}/duplicate/',
            {'name': f'Template Mapping Copy {uuid4().hex[:8]}'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        copied_template_id = int(resp.json()['id'])
        copied = AutoHoursTemplateRoleSetting.objects.get(template_id=copied_template_id, role=self.project_role)
        copied_people_role_ids = set(copied.people_roles.values_list('id', flat=True))
        self.assertEqual(copied_people_role_ids, {self.people_role_a.id, self.people_role_b.id})

    def test_people_role_delete_is_blocked_when_used_by_template_mapping(self):
        setting = AutoHoursTemplateRoleSetting.objects.create(
            template=self.template,
            role=self.project_role,
            ramp_percent_by_phase={'sd': {'0': 25}},
            role_count_by_phase={'sd': 1},
        )
        setting.people_roles.set([self.people_role_a])

        resp = self.client.delete(f'/api/roles/{self.people_role_a.id}/')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertTrue(Role.objects.filter(id=self.people_role_a.id).exists())
        self.assertIn('project template role mapping', str(resp.json().get('error', '')))

    def test_global_settings_put_persists_people_role_ids(self):
        payload = {
            'settings': [
                {
                    'roleId': self.project_role.id,
                    'percentByWeek': {'0': 40},
                    'roleCount': 1,
                    'peopleRoleIds': [self.people_role_b.id, self.people_role_a.id],
                }
            ]
        }
        resp = self.client.put('/api/core/project-template-settings/?phase=sd', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        rows = (resp.json() or {}).get('settings', [])
        row = next(item for item in rows if int(item['roleId']) == self.project_role.id)
        self.assertEqual(row.get('peopleRoleIds'), [self.people_role_a.id, self.people_role_b.id])

        setting = AutoHoursRoleSetting.objects.get(role=self.project_role)
        mapped_ids = sorted(setting.people_roles.values_list('id', flat=True))
        self.assertEqual(mapped_ids, [self.people_role_a.id, self.people_role_b.id])

    def test_people_role_delete_is_blocked_when_used_by_global_mapping(self):
        setting = AutoHoursRoleSetting.objects.create(
            role=self.project_role,
            standard_percent_of_capacity=0,
            ramp_percent_by_week={},
            ramp_percent_by_phase={'sd': {'0': 10}},
            role_count_by_phase={'sd': 1},
        )
        setting.people_roles.set([self.people_role_a])

        resp = self.client.delete(f'/api/roles/{self.people_role_a.id}/')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertTrue(Role.objects.filter(id=self.people_role_a.id).exists())
        self.assertIn('global project-role mapping', str(resp.json().get('error', '')))


class AutoHoursTemplatePermissionsTests(TestCase):
    def setUp(self):
        suffix = uuid4().hex[:8]
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username=f'template_user_{suffix}', password='pw')
        self.template = AutoHoursTemplate.objects.create(
            name=f'Template Visible To Users {suffix}',
            phase_keys=['sd'],
            weeks_by_phase={'sd': 6},
            is_active=True,
        )

    def test_regular_user_can_list_templates(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get('/api/core/project-templates/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        names = {item.get('name') for item in (resp.json() or [])}
        self.assertIn(self.template.name, names)

    def test_regular_user_cannot_create_template(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post('/api/core/project-templates/', {'name': f'New Template {uuid4().hex[:8]}'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, resp.content)
