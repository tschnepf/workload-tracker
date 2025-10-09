from django.test import TestCase
from django.db.models.deletion import ProtectedError
from departments.models import Department
from people.models import Person
from projects.models import Project, ProjectRole
from assignments.models import Assignment


class ProjectRoleDeleteProtectTests(TestCase):
    def test_delete_referenced_role_is_protected(self):
        dept = Department.objects.create(name='Ops')
        person = Person.objects.create(name='Jamie', department=dept)
        project = Project.objects.create(name='Runway')
        role = ProjectRole.objects.create(name='Coordinator', normalized_name='coordinator', department=dept)
        asn = Assignment.objects.create(person=person, project=project, weekly_hours={})
        asn.department = dept
        asn.role_on_project_ref = role
        asn.save(update_fields=['department', 'role_on_project_ref'])

        with self.assertRaises(ProtectedError):
            role.delete()

