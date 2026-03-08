from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from assignments.models import WeeklyAssignmentSnapshot
from departments.models import Department
from people.models import Person
from projects.models import Project, ProjectRole
from reports.models import PersonReportGoal
from skills.models import PersonSkill, SkillTag
from verticals.models import Vertical


class PersonReportApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.admin = User.objects.create_user(username='person_report_admin', password='pw', is_staff=True)
        self.manager = User.objects.create_user(username='person_report_manager', password='pw')
        self.user = User.objects.create_user(username='person_report_user', password='pw')

        manager_group, _ = Group.objects.get_or_create(name='Manager')
        self.manager.groups.add(manager_group)

        self.vertical = Vertical.objects.create(name='Test Vertical')
        self.department = Department.objects.create(name='Engineering', vertical=self.vertical)
        self.department_2 = Department.objects.create(name='Design', vertical=self.vertical)
        self.person = Person.objects.create(name='Taylor Analyst', department=self.department, weekly_capacity=40)
        self.person_2 = Person.objects.create(name='Jordan Draft', department=self.department_2, weekly_capacity=36)

        self.project_role = ProjectRole.objects.create(name='Designer', department=self.department, is_active=True)
        today = date.today()
        self.project_start = today - timedelta(days=120)
        self.project_end = today + timedelta(days=45)
        self.project = Project.objects.create(
            name='Atlas',
            client='Stack',
            vertical=self.vertical,
            start_date=self.project_start,
            end_date=self.project_end,
        )

        week_1 = today - timedelta(days=7)
        week_2 = today - timedelta(days=14)
        week_3 = today - timedelta(days=21)

        WeeklyAssignmentSnapshot.objects.create(
            week_start=week_1,
            person=self.person,
            project=self.project,
            role_on_project_id=self.project_role.id,
            department_id=self.department.id,
            deliverable_phase='DD',
            hours=18,
            person_name=self.person.name,
            project_name=self.project.name,
            client='Stack',
        )
        WeeklyAssignmentSnapshot.objects.create(
            week_start=week_2,
            person=self.person,
            project=self.project,
            role_on_project_id=self.project_role.id,
            department_id=self.department.id,
            deliverable_phase='CD',
            hours=22,
            person_name=self.person.name,
            project_name=self.project.name,
            client='Stack',
        )
        WeeklyAssignmentSnapshot.objects.create(
            week_start=week_3,
            person=self.person,
            project=self.project,
            role_on_project_id=self.project_role.id,
            department_id=self.department.id,
            deliverable_phase='CA',
            hours=14,
            person_name=self.person.name,
            project_name=self.project.name,
            client='Stack',
        )

        self.skill_tag = SkillTag.objects.create(name='Lighting Design', is_active=True)

    def test_bootstrap_people_profile_admin(self):
        self.client.force_authenticate(user=self.admin)

        bootstrap = self.client.get('/api/reports/person-report/bootstrap/')
        self.assertEqual(bootstrap.status_code, status.HTTP_200_OK)
        payload = bootstrap.json()
        self.assertEqual(payload['defaults']['monthsDefault'], 6)
        dept_ids = {row['id'] for row in payload['departments']}
        self.assertIn(self.department.id, dept_ids)

        people = self.client.get(f'/api/reports/person-report/people/?department={self.department.id}')
        self.assertEqual(people.status_code, status.HTTP_200_OK)
        names = {row['name'] for row in people.json()['people']}
        self.assertIn(self.person.name, names)
        self.assertNotIn(self.person_2.name, names)

        profile = self.client.get(f'/api/reports/person-report/profile/?person={self.person.id}&months=6')
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        p = profile.json()
        self.assertEqual(p['person']['id'], self.person.id)
        self.assertEqual(p['summary']['projectsWorked'], 1)
        self.assertGreater(p['summary']['totalHours'], 0)
        self.assertGreaterEqual(len(p['projects']), 1)
        self.assertEqual(p['projects'][0]['projectName'], 'Atlas')
        self.assertEqual(p['projects'][0]['startDate'], self.project_start.isoformat())
        self.assertEqual(p['projects'][0]['endDate'], self.project_end.isoformat())

    def test_goals_and_checkins_manager(self):
        self.client.force_authenticate(user=self.manager)

        freeform = self.client.post(
            '/api/reports/person-report/goals/',
            {
                'personId': self.person.id,
                'goalType': 'freeform',
                'title': 'Lead one client workshop',
                'description': 'Drive at least one workshop and present findings',
                'targetDate': (date.today() + timedelta(days=90)).isoformat(),
            },
            format='json',
        )
        self.assertEqual(freeform.status_code, status.HTTP_201_CREATED)
        freeform_goal_id = freeform.json()['goal']['id']

        skill = self.client.post(
            '/api/reports/person-report/goals/',
            {
                'personId': self.person.id,
                'goalType': 'skill',
                'skillTagId': self.skill_tag.id,
            },
            format='json',
        )
        self.assertEqual(skill.status_code, status.HTTP_201_CREATED)
        self.assertEqual(skill.json()['goal']['goalType'], 'skill')

        patched = self.client.patch(
            f'/api/reports/person-report/goals/{freeform_goal_id}/',
            {'status': 'achieved'},
            format='json',
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.assertEqual(patched.json()['goal']['status'], 'achieved')

        start = (date.today() - timedelta(days=180)).isoformat()
        end = date.today().isoformat()
        checkin = self.client.post(
            '/api/reports/person-report/checkins/',
            {
                'personId': self.person.id,
                'periodStart': start,
                'periodEnd': end,
                'summary': 'Solid progress this period',
            },
            format='json',
        )
        self.assertEqual(checkin.status_code, status.HTTP_201_CREATED)
        snapshots = checkin.json()['checkin']['goalSnapshots']
        # Only active goals are snapshotted (achieved goal should be excluded)
        self.assertEqual(len(snapshots), 1)
        self.assertEqual(snapshots[0]['goalTypeSnapshot'], 'skill')

        list_resp = self.client.get(f'/api/reports/person-report/checkins/?person={self.person.id}')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_resp.json()['checkins']), 1)

    def test_permissions_enforced(self):
        self.client.force_authenticate(user=self.user)
        denied = self.client.get('/api/reports/person-report/bootstrap/')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        denied_goal = self.client.post(
            '/api/reports/person-report/goals/',
            {
                'personId': self.person.id,
                'goalType': 'freeform',
                'title': 'No access',
            },
            format='json',
        )
        self.assertEqual(denied_goal.status_code, status.HTTP_403_FORBIDDEN)

    def test_skill_goal_signal_sync(self):
        # create => linked PersonReportGoal is upserted
        ps = PersonSkill.objects.create(
            person=self.person,
            skill_tag=self.skill_tag,
            skill_type='goals',
            proficiency_level='intermediate',
        )
        goal = PersonReportGoal.objects.get(linked_person_skill_id=ps.id)
        self.assertEqual(goal.goal_type, PersonReportGoal.GoalType.SKILL)
        self.assertEqual(goal.status, PersonReportGoal.GoalStatus.ACTIVE)

        # change away from goals => goal closes
        ps.skill_type = 'strength'
        ps.save(update_fields=['skill_type', 'updated_at'])
        goal.refresh_from_db()
        self.assertEqual(goal.status, PersonReportGoal.GoalStatus.CANCELLED)

        # delete goal-skill => linked row is unlinked + cancelled
        ps2 = PersonSkill.objects.create(
            person=self.person,
            skill_tag=self.skill_tag,
            skill_type='goals',
            proficiency_level='advanced',
        )
        goal2 = PersonReportGoal.objects.get(linked_person_skill_id=ps2.id)
        ps2.delete()
        goal2.refresh_from_db()
        self.assertEqual(goal2.status, PersonReportGoal.GoalStatus.CANCELLED)
        self.assertIsNone(goal2.linked_person_skill_id)
