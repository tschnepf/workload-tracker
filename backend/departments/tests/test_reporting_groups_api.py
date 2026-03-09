from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from core.models import FeatureToggleSettings
from departments.models import (
    Department,
    DepartmentOrgChartLayout,
    DepartmentReportingGroup,
    DepartmentReportingGroupMember,
)
from people.models import Person


@override_settings(REPORTING_GROUPS_SYSTEM_ENABLED=True)
class DepartmentReportingGroupsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username='rg_admin', password='pw', is_staff=True)
        self.manager = User.objects.create_user(username='rg_manager', password='pw')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)
        self.user = User.objects.create_user(username='rg_user', password='pw')

        self.department = Department.objects.create(name='Electrical')
        self.p1 = Person.objects.create(name='Alex Manager', department=self.department)
        self.p2 = Person.objects.create(name='Casey Member', department=self.department)
        self.p3 = Person.objects.create(name='Jordan Member', department=self.department)

        toggle = FeatureToggleSettings.get_active()
        toggle.reporting_groups_enabled = True
        toggle.save(update_fields=['reporting_groups_enabled', 'updated_at'])

    def _workspace(self, user):
        self.client.force_authenticate(user=user)
        return self.client.get(f'/api/departments/{self.department.id}/org-chart-workspace/')

    def test_workspace_read_and_permissions(self):
        user_resp = self._workspace(self.user)
        self.assertEqual(user_resp.status_code, status.HTTP_200_OK, user_resp.content)
        self.assertFalse(user_resp.json()['canEdit'])
        self.assertEqual(user_resp.json()['workspaceVersion'], 1)

        mgr_resp = self._workspace(self.manager)
        self.assertEqual(mgr_resp.status_code, status.HTTP_200_OK, mgr_resp.content)
        self.assertTrue(mgr_resp.json()['canEdit'])

    def test_manager_can_create_group_regular_user_forbidden(self):
        self.client.force_authenticate(self.manager)
        create_resp = self.client.post(
            f'/api/departments/{self.department.id}/reporting-groups/',
            data={'name': 'Power Delivery', 'managerId': self.p1.id},
            format='json',
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.content)
        self.assertEqual(create_resp.json()['group']['name'], 'Power Delivery')
        self.assertEqual(create_resp.json()['group']['managerId'], self.p1.id)

        self.client.force_authenticate(self.user)
        deny_resp = self.client.post(
            f'/api/departments/{self.department.id}/reporting-groups/',
            data={'name': 'Forbidden'},
            format='json',
        )
        self.assertEqual(deny_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_layout_save_updates_members_and_detects_version_conflict(self):
        self.client.force_authenticate(self.manager)
        group = DepartmentReportingGroup.objects.create(
            department=self.department,
            name='Group A',
            manager=self.p1,
            card_x=80,
            card_y=210,
            sort_order=10,
            is_active=True,
        )
        layout = DepartmentOrgChartLayout.get_or_create_for_department(self.department)
        layout.bump_workspace_version()

        save_resp = self.client.put(
            f'/api/departments/{self.department.id}/reporting-groups/layout/',
            data={
                'workspaceVersion': layout.workspace_version,
                'departmentCard': {'x': 140, 'y': 64},
                'groups': [
                    {
                        'id': group.id,
                        'x': 220,
                        'y': 260,
                        'managerId': self.p1.id,
                        'memberIds': [self.p2.id, self.p3.id],
                        'sortOrder': 30,
                    }
                ],
            },
            format='json',
        )
        self.assertEqual(save_resp.status_code, status.HTTP_200_OK, save_resp.content)
        payload = save_resp.json()
        self.assertEqual(payload['departmentCard']['x'], 140)
        self.assertEqual(payload['groups'][0]['memberIds'], [self.p2.id, self.p3.id])

        conflict_resp = self.client.put(
            f'/api/departments/{self.department.id}/reporting-groups/layout/',
            data={
                'workspaceVersion': 1,
                'departmentCard': {'x': 1, 'y': 1},
                'groups': [
                    {
                        'id': group.id,
                        'x': 1,
                        'y': 1,
                        'managerId': self.p1.id,
                        'memberIds': [],
                        'sortOrder': 10,
                    }
                ],
            },
            format='json',
        )
        self.assertEqual(conflict_resp.status_code, status.HTTP_409_CONFLICT, conflict_resp.content)
        self.assertIn('workspace', conflict_resp.json())

        member_ids = list(
            DepartmentReportingGroupMember.objects.filter(reporting_group=group).order_by('sort_order').values_list('person_id', flat=True)
        )
        self.assertEqual(member_ids, [self.p2.id, self.p3.id])

    def test_layout_validates_single_group_membership_and_manager_conflicts(self):
        self.client.force_authenticate(self.manager)
        group_a = DepartmentReportingGroup.objects.create(
            department=self.department,
            name='Group A',
            manager=self.p1,
            card_x=80,
            card_y=210,
            sort_order=10,
            is_active=True,
        )
        group_b = DepartmentReportingGroup.objects.create(
            department=self.department,
            name='Group B',
            manager=None,
            card_x=380,
            card_y=210,
            sort_order=20,
            is_active=True,
        )
        layout = DepartmentOrgChartLayout.get_or_create_for_department(self.department)
        layout.bump_workspace_version()

        dup_member_resp = self.client.put(
            f'/api/departments/{self.department.id}/reporting-groups/layout/',
            data={
                'workspaceVersion': layout.workspace_version,
                'departmentCard': {'x': 120, 'y': 64},
                'groups': [
                    {'id': group_a.id, 'x': 120, 'y': 220, 'managerId': self.p1.id, 'memberIds': [self.p2.id], 'sortOrder': 10},
                    {'id': group_b.id, 'x': 420, 'y': 220, 'managerId': None, 'memberIds': [self.p2.id], 'sortOrder': 20},
                ],
            },
            format='json',
        )
        self.assertEqual(dup_member_resp.status_code, status.HTTP_400_BAD_REQUEST, dup_member_resp.content)

        manager_member_conflict = self.client.put(
            f'/api/departments/{self.department.id}/reporting-groups/layout/',
            data={
                'workspaceVersion': layout.workspace_version,
                'departmentCard': {'x': 120, 'y': 64},
                'groups': [
                    {'id': group_a.id, 'x': 120, 'y': 220, 'managerId': self.p1.id, 'memberIds': [self.p3.id], 'sortOrder': 10},
                    {'id': group_b.id, 'x': 420, 'y': 220, 'managerId': self.p3.id, 'memberIds': [], 'sortOrder': 20},
                ],
            },
            format='json',
        )
        self.assertEqual(manager_member_conflict.status_code, status.HTTP_400_BAD_REQUEST, manager_member_conflict.content)

    def test_feature_toggle_off_blocks_workspace_and_writes(self):
        toggle = FeatureToggleSettings.get_active()
        toggle.reporting_groups_enabled = False
        toggle.save(update_fields=['reporting_groups_enabled', 'updated_at'])

        self.client.force_authenticate(self.manager)
        workspace = self.client.get(f'/api/departments/{self.department.id}/org-chart-workspace/')
        self.assertEqual(workspace.status_code, status.HTTP_404_NOT_FOUND)

        create_resp = self.client.post(
            f'/api/departments/{self.department.id}/reporting-groups/',
            data={'name': 'Blocked'},
            format='json',
        )
        self.assertEqual(create_resp.status_code, status.HTTP_403_FORBIDDEN)
