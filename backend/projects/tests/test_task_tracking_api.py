from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserProfile
from assignments.models import Assignment
from deliverables.models import Deliverable
from departments.models import Department
from people.models import Person
from projects.models import Project, ProjectTask, ProjectTaskScope, ProjectTaskTemplate
from verticals.models import Vertical


class ProjectTaskTrackingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        self.admin = User.objects.create_user(username='admin_tt', password='pass', is_staff=True)
        self.manager = User.objects.create_user(username='manager_tt', password='pass')
        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)
        self.user = User.objects.create_user(username='user_tt', password='pass')

        self.enabled_vertical = Vertical.objects.create(name='Enabled Vertical', task_tracking_enabled=True)
        self.disabled_vertical = Vertical.objects.create(name='Disabled Vertical', task_tracking_enabled=False)
        self.department = Department.objects.create(name='Task Dept', vertical=self.enabled_vertical)

        self.member_person = Person.objects.create(name='Member Person', department=self.department)
        self.outsider_person = Person.objects.create(name='Outsider Person', department=self.department)
        self.member_user = User.objects.create_user(username='member_tt', password='pass')
        self.outsider_user = User.objects.create_user(username='outsider_tt', password='pass')
        UserProfile.objects.update_or_create(user=self.member_user, defaults={'person': self.member_person})
        UserProfile.objects.update_or_create(user=self.outsider_user, defaults={'person': self.outsider_person})
        self.member_user = User.objects.get(pk=self.member_user.pk)
        self.outsider_user = User.objects.get(pk=self.outsider_user.pk)

    def _create_project(self, *, vertical: Vertical) -> Project:
        with self.captureOnCommitCallbacks(execute=True):
            project = Project.objects.create(name='Task Project', vertical=vertical, status='active')
        return project

    def _create_deliverable(self, project: Project) -> Deliverable:
        with self.captureOnCommitCallbacks(execute=True):
            deliverable = Deliverable.objects.create(project=project, description='DD', percentage=75)
        return deliverable

    def test_template_crud_permissions(self):
        payload = {
            'verticalId': self.enabled_vertical.id,
            'scope': ProjectTaskScope.PROJECT,
            'departmentId': self.department.id,
            'name': 'Kickoff',
            'description': 'Do kickoff',
            'sortOrder': 1,
            'isActive': True,
        }

        self.client.force_authenticate(self.user)
        denied = self.client.post('/api/projects/task-templates/', payload, format='json')
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.manager)
        allowed = self.client.post('/api/projects/task-templates/', payload, format='json')
        self.assertEqual(allowed.status_code, 201)

        self.client.force_authenticate(self.admin)
        listing = self.client.get('/api/projects/task-templates/?vertical=%s&scope=project' % self.enabled_vertical.id)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json().get('count'), 1)

    def test_tasks_endpoint_respects_vertical_gating(self):
        project = self._create_project(vertical=self.disabled_vertical)

        self.client.force_authenticate(self.admin)
        resp = self.client.get(f'/api/projects/{project.id}/tasks/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get('enabled'), False)
        self.assertEqual(resp.json().get('projectTasks'), [])
        self.assertEqual(resp.json().get('deliverableTasks'), [])

    def test_project_and_deliverable_tasks_auto_generate_when_enabled(self):
        project_template = ProjectTaskTemplate.objects.create(
            vertical=self.enabled_vertical,
            scope=ProjectTaskScope.PROJECT,
            department=self.department,
            name='Project Setup',
            sort_order=1,
            is_active=True,
        )
        deliverable_template = ProjectTaskTemplate.objects.create(
            vertical=self.enabled_vertical,
            scope=ProjectTaskScope.DELIVERABLE,
            department=self.department,
            name='Deliverable Review',
            sort_order=2,
            is_active=True,
        )
        project = self._create_project(vertical=self.enabled_vertical)
        deliverable = self._create_deliverable(project)

        self.assertTrue(
            ProjectTask.objects.filter(
                project=project,
                template=project_template,
                scope=ProjectTaskScope.PROJECT,
                deliverable__isnull=True,
            ).exists()
        )
        self.assertTrue(
            ProjectTask.objects.filter(
                project=project,
                deliverable=deliverable,
                template=deliverable_template,
                scope=ProjectTaskScope.DELIVERABLE,
            ).exists()
        )

    def test_sync_adds_missing_only(self):
        initial_template = ProjectTaskTemplate.objects.create(
            vertical=self.enabled_vertical,
            scope=ProjectTaskScope.PROJECT,
            department=self.department,
            name='Initial Task',
            is_active=True,
        )
        project = self._create_project(vertical=self.enabled_vertical)
        self.assertTrue(ProjectTask.objects.filter(project=project, template=initial_template).exists())

        new_template = ProjectTaskTemplate.objects.create(
            vertical=self.enabled_vertical,
            scope=ProjectTaskScope.PROJECT,
            department=self.department,
            name='New Task',
            is_active=True,
        )

        self.client.force_authenticate(self.admin)
        resp = self.client.post(f'/api/projects/{project.id}/tasks/sync/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get('projectCreated'), 1)
        self.assertTrue(ProjectTask.objects.filter(project=project, template=new_template).exists())

        resp_second = self.client.post(f'/api/projects/{project.id}/tasks/sync/')
        self.assertEqual(resp_second.status_code, 200)
        self.assertEqual(resp_second.json().get('projectCreated'), 0)

    def test_patch_validates_percent_step_and_assignee_membership(self):
        template = ProjectTaskTemplate.objects.create(
            vertical=self.enabled_vertical,
            scope=ProjectTaskScope.PROJECT,
            department=self.department,
            name='Patchable Task',
            is_active=True,
        )
        project = self._create_project(vertical=self.enabled_vertical)
        Assignment.objects.create(person=self.member_person, project=project, weekly_hours={})
        task = ProjectTask.objects.get(project=project, template=template)

        self.client.force_authenticate(self.admin)

        bad_percent = self.client.patch(
            f'/api/projects/tasks/{task.id}/',
            {'completionPercent': 57},
            format='json',
        )
        self.assertEqual(bad_percent.status_code, 400)
        self.assertIn('completionPercent', bad_percent.json())

        bad_assignee = self.client.patch(
            f'/api/projects/tasks/{task.id}/',
            {'assigneeIds': [self.outsider_person.id]},
            format='json',
        )
        self.assertEqual(bad_assignee.status_code, 400)
        self.assertIn('assigneeIds', bad_assignee.json())

        ok = self.client.patch(
            f'/api/projects/tasks/{task.id}/',
            {'completionPercent': 55, 'assigneeIds': [self.member_person.id]},
            format='json',
        )
        self.assertEqual(ok.status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.completion_percent, 55)
        self.assertEqual(list(task.assignees.values_list('id', flat=True)), [self.member_person.id])

    def test_project_member_can_read_tasks_non_member_denied(self):
        ProjectTaskTemplate.objects.create(
            vertical=self.enabled_vertical,
            scope=ProjectTaskScope.PROJECT,
            department=self.department,
            name='Visibility Task',
            is_active=True,
        )
        project = self._create_project(vertical=self.enabled_vertical)
        Assignment.objects.create(person=self.member_person, project=project, weekly_hours={})

        self.client.force_authenticate(self.member_user)
        allowed = self.client.get(f'/api/projects/{project.id}/tasks/')
        self.assertEqual(allowed.status_code, 200)

        self.client.force_authenticate(self.outsider_user)
        denied = self.client.get(f'/api/projects/{project.id}/tasks/')
        self.assertEqual(denied.status_code, 403)
