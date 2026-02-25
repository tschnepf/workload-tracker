from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import (
    AutoHoursGlobalSettings,
    AutoHoursRoleSetting,
    AutoHoursTemplate,
    AutoHoursTemplateRoleSetting,
    DeliverablePhaseDefinition,
)
from departments.models import Department
from projects.models import ProjectRole


class AssignmentsPageSnapshotAutoHoursTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username='snapshot-user', password='x')
        self.manager = user_model.objects.create_user(username='snapshot-manager', password='x')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)

        self.department = Department.objects.create(name='Architecture')
        self.role = ProjectRole.objects.create(
            name='Project Architect',
            department=self.department,
            is_active=True,
            sort_order=10,
        )

        DeliverablePhaseDefinition.objects.get_or_create(
            key='sd',
            defaults={
                'label': 'SD',
                'description_tokens': ['sd'],
                'range_min': 0,
                'range_max': 40,
                'sort_order': 0,
            },
        )
        DeliverablePhaseDefinition.objects.get_or_create(
            key='dd',
            defaults={
                'label': 'DD',
                'description_tokens': ['dd'],
                'range_min': 41,
                'range_max': 89,
                'sort_order': 1,
            },
        )

        global_settings = AutoHoursGlobalSettings.get_active()
        global_settings.weeks_by_phase = {'sd': 5, 'dd': 6}
        global_settings.save(update_fields=['weeks_by_phase', 'updated_at'])

        AutoHoursRoleSetting.objects.create(
            role=self.role,
            standard_percent_of_capacity=25,
            ramp_percent_by_phase={'sd': {'0': 25}, 'dd': {'0': 35}},
            role_count_by_phase={'sd': 2, 'dd': 1},
        )

        self.template = AutoHoursTemplate.objects.create(
            name='Snapshot Template',
            description='Template for snapshot tests',
            phase_keys=['sd', 'dd'],
            weeks_by_phase={'sd': 4, 'dd': 6},
            is_active=True,
        )
        AutoHoursTemplateRoleSetting.objects.create(
            template=self.template,
            role=self.role,
            ramp_percent_by_phase={'sd': {'0': 40}, 'dd': {'0': 45}},
            role_count_by_phase={'sd': 3, 'dd': 2},
        )

    def test_auto_hours_include_forbidden_for_non_manager(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get('/api/ui/assignments-page/?include=auto_hours')
        self.assertEqual(res.status_code, 403)
        payload = res.json()
        self.assertEqual(payload.get('code'), 'forbidden')
        self.assertEqual(payload.get('contractVersion'), 1)

    def test_auto_hours_bundle_includes_requested_template_settings(self):
        self.client.force_authenticate(user=self.manager)
        res = self.client.get(
            f'/api/ui/assignments-page/?include=auto_hours&auto_hours_phases=sd,dd&template_ids={self.template.id}'
        )
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        bundle = payload.get('autoHoursBundle')
        self.assertIsNotNone(bundle)
        self.assertTrue(bundle.get('bundleComplete'))
        self.assertEqual(bundle.get('missingTemplateIds'), [])
        self.assertIn('phaseMapping', bundle)
        self.assertIn('templates', bundle)
        self.assertIn('defaultSettingsByPhase', bundle)
        self.assertIn('templateSettingsByPhase', bundle)
        self.assertIn('sd', bundle['defaultSettingsByPhase'])
        self.assertEqual(bundle['defaultSettingsByPhase']['sd'][0]['roleId'], self.role.id)
        self.assertEqual(
            bundle['templateSettingsByPhase'][str(self.template.id)]['sd'][0]['roleId'],
            self.role.id,
        )

    def test_auto_hours_bundle_reports_missing_template_ids(self):
        self.client.force_authenticate(user=self.manager)
        res = self.client.get('/api/ui/assignments-page/?include=auto_hours&template_ids=99999')
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        bundle = payload.get('autoHoursBundle')
        self.assertIsNotNone(bundle)
        self.assertFalse(bundle.get('bundleComplete'))
        self.assertEqual(bundle.get('missingTemplateIds'), [99999])

    def test_template_ids_overflow_returns_400(self):
        self.client.force_authenticate(user=self.manager)
        ids = ','.join(str(i) for i in range(1, 202))
        res = self.client.get(f'/api/ui/assignments-page/?include=auto_hours&template_ids={ids}')
        self.assertEqual(res.status_code, 400)
        self.assertIn('template_ids supports up to 200 IDs', str(res.json().get('error')))

    def test_post_body_supports_template_ids_and_phases(self):
        self.client.force_authenticate(user=self.manager)
        res = self.client.post(
            '/api/ui/assignments-page/?include=auto_hours',
            data={
                'auto_hours_phases': ['sd', 'dd'],
                'template_ids': [self.template.id],
            },
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        bundle = payload.get('autoHoursBundle')
        self.assertIsNotNone(bundle)
        self.assertIn(str(self.template.id), bundle.get('templateSettingsByPhase', {}))
