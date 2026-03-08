from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from departments.models import Department
from people.models import Person
from skills.models import PersonSkill, SkillTag


class SkillsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        self.admin = user_model.objects.create_superuser(
            username='skills_admin',
            email='skills_admin@example.com',
            password='pw123456',
        )
        self.regular = user_model.objects.create_user(
            username='skills_user',
            email='skills_user@example.com',
            password='pw123456',
        )

        self.dept_parent = Department.objects.create(name='Electrical')
        self.dept_child = Department.objects.create(name='Low Voltage', parent_department=self.dept_parent)
        self.dept_other = Department.objects.create(name='Mechanical')

        self.person_parent = Person.objects.create(name='Parent Person', department=self.dept_parent)
        self.person_child = Person.objects.create(name='Child Person', department=self.dept_child)
        self.person_other = Person.objects.create(name='Other Person', department=self.dept_other)

        self.skill_global = SkillTag.objects.create(name='Global Skill')
        self.skill_parent = SkillTag.objects.create(name='Parent Skill', department=self.dept_parent)
        self.skill_child = SkillTag.objects.create(name='Child Skill', department=self.dept_child)
        self.skill_other = SkillTag.objects.create(name='Other Skill', department=self.dept_other)

    def test_skill_tag_filter_department_with_children_and_global(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get(
            f'/api/skills/skill-tags/?department={self.dept_parent.id}&include_children=1&include_global=1'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        names = {row['name'] for row in (res.json().get('results') or [])}
        self.assertIn('Global Skill', names)
        self.assertIn('Parent Skill', names)
        self.assertIn('Child Skill', names)
        self.assertNotIn('Other Skill', names)

    def test_person_skills_filters_by_ids_and_department_scope(self):
        PersonSkill.objects.create(
            person=self.person_parent,
            skill_tag=self.skill_global,
            skill_type='strength',
            proficiency_level='beginner',
        )
        PersonSkill.objects.create(
            person=self.person_child,
            skill_tag=self.skill_parent,
            skill_type='strength',
            proficiency_level='advanced',
        )
        PersonSkill.objects.create(
            person=self.person_other,
            skill_tag=self.skill_other,
            skill_type='strength',
            proficiency_level='expert',
        )

        self.client.force_authenticate(self.admin)
        res = self.client.get(
            '/api/skills/person-skills/'
            f'?department={self.dept_parent.id}'
            '&include_children=1'
            f'&person_ids={self.person_parent.id},{self.person_child.id},{self.person_other.id}'
            f'&skill_tag_ids={self.skill_global.id},{self.skill_parent.id}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.json().get('results') or []
        self.assertEqual(len(rows), 2)
        person_ids = {row['person'] for row in rows}
        self.assertEqual(person_ids, {self.person_parent.id, self.person_child.id})
        skill_ids = {row['skillTagId'] for row in rows}
        self.assertEqual(skill_ids, {self.skill_global.id, self.skill_parent.id})

    def test_bulk_assign_defaults_and_idempotency(self):
        self.client.force_authenticate(self.admin)
        payload = {
            'operation': 'assign',
            'personIds': [self.person_parent.id, self.person_child.id],
            'skillTagIds': [self.skill_global.id, self.skill_parent.id],
        }
        first = self.client.post('/api/skills/person-skills/bulk_assign/', payload, format='json')
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.json().get('processedPairs'), 4)
        self.assertEqual(first.json().get('created'), 4)
        self.assertEqual(first.json().get('skippedExisting'), 0)

        second = self.client.post('/api/skills/person-skills/bulk_assign/', payload, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.json().get('processedPairs'), 4)
        self.assertEqual(second.json().get('created'), 0)
        self.assertEqual(second.json().get('skippedExisting'), 4)

        rows = PersonSkill.objects.filter(
            person_id__in=[self.person_parent.id, self.person_child.id],
            skill_tag_id__in=[self.skill_global.id, self.skill_parent.id],
        )
        self.assertEqual(rows.count(), 4)
        self.assertTrue(all(row.skill_type == 'strength' for row in rows))
        self.assertTrue(all(row.proficiency_level == 'beginner' for row in rows))

    def test_bulk_unassign_only_removes_selected_skill_type(self):
        PersonSkill.objects.create(
            person=self.person_parent,
            skill_tag=self.skill_global,
            skill_type='strength',
            proficiency_level='beginner',
        )
        PersonSkill.objects.create(
            person=self.person_parent,
            skill_tag=self.skill_global,
            skill_type='in_progress',
            proficiency_level='advanced',
        )
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            '/api/skills/person-skills/bulk_assign/',
            {
                'operation': 'unassign',
                'personIds': [self.person_parent.id],
                'skillTagIds': [self.skill_global.id],
                'skillType': 'strength',
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json().get('deleted'), 1)
        self.assertFalse(
            PersonSkill.objects.filter(
                person=self.person_parent,
                skill_tag=self.skill_global,
                skill_type='strength',
            ).exists()
        )
        self.assertTrue(
            PersonSkill.objects.filter(
                person=self.person_parent,
                skill_tag=self.skill_global,
                skill_type='in_progress',
            ).exists()
        )

    def test_bulk_assign_requires_manager_or_admin(self):
        self.client.force_authenticate(self.regular)
        res = self.client.post(
            '/api/skills/person-skills/bulk_assign/',
            {
                'operation': 'assign',
                'personIds': [self.person_parent.id],
                'skillTagIds': [self.skill_global.id],
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
