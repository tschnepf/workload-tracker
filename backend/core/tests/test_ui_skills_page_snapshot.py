from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from departments.models import Department
from people.models import Person
from skills.models import PersonSkill, SkillTag


class UiSkillsPageSnapshotTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_superuser(
            username='ui_skills_admin',
            email='ui_skills_admin@example.com',
            password='pw123456',
        )
        self.user = user_model.objects.create_user(
            username='ui_skills_user',
            email='ui_skills_user@example.com',
            password='pw123456',
        )

        self.dept_parent = Department.objects.create(name='Architecture')
        self.dept_child = Department.objects.create(name='Interiors', parent_department=self.dept_parent)
        self.dept_other = Department.objects.create(name='Mechanical')

        self.person_parent = Person.objects.create(name='A', department=self.dept_parent)
        self.person_child = Person.objects.create(name='B', department=self.dept_child)
        self.person_other = Person.objects.create(name='C', department=self.dept_other)
        self.person_unassigned = Person.objects.create(name='D', department=None)

        self.skill_global = SkillTag.objects.create(name='Global Skill')
        self.skill_parent = SkillTag.objects.create(name='Parent Skill', department=self.dept_parent)
        self.skill_child = SkillTag.objects.create(name='Child Skill', department=self.dept_child)
        self.skill_other = SkillTag.objects.create(name='Other Skill', department=self.dept_other)

        PersonSkill.objects.create(
            person=self.person_parent,
            skill_tag=self.skill_global,
            skill_type='strength',
            proficiency_level='advanced',
        )
        PersonSkill.objects.create(
            person=self.person_child,
            skill_tag=self.skill_child,
            skill_type='strength',
            proficiency_level='beginner',
        )
        PersonSkill.objects.create(
            person=self.person_other,
            skill_tag=self.skill_other,
            skill_type='strength',
            proficiency_level='expert',
        )

    def test_snapshot_requires_manager_or_admin(self):
        self.client.force_authenticate(self.user)
        res = self.client.get('/api/ui/skills-page/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_snapshot_department_scope_includes_global_and_children(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(
            '/api/ui/skills-page/'
            '?include=departments,people,skill_tags,person_skills'
            f'&department={self.dept_parent.id}'
            '&include_children=1'
            '&include_global=1'
            '&people_page_size=200'
            '&skill_tags_page_size=200'
            '&person_skills_page_size=200'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = res.json()

        skill_names = {row['name'] for row in (payload.get('skillTags') or {}).get('results', [])}
        self.assertIn('Global Skill', skill_names)
        self.assertIn('Parent Skill', skill_names)
        self.assertIn('Child Skill', skill_names)
        self.assertNotIn('Other Skill', skill_names)

        people_ids = {row['id'] for row in (payload.get('people') or {}).get('results', [])}
        self.assertIn(self.person_parent.id, people_ids)
        self.assertIn(self.person_child.id, people_ids)
        self.assertNotIn(self.person_other.id, people_ids)
        self.assertNotIn(self.person_unassigned.id, people_ids)

        person_skill_people = {
            row['person'] for row in (payload.get('personSkills') or {}).get('results', [])
        }
        self.assertIn(self.person_parent.id, person_skill_people)
        self.assertIn(self.person_child.id, person_skill_people)
        self.assertNotIn(self.person_other.id, person_skill_people)
