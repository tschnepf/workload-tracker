from django.test import TestCase
from django.core.management import call_command
from departments.models import Department
from projects.models import ProjectRole
import tempfile
import os


class ImportProjectRolesCommandTests(TestCase):
    def setUp(self):
        self.dept1 = Department.objects.create(name='Engineering')
        self.dept2 = Department.objects.create(name='Design')

    def _write_csv(self, rows: list[tuple[int, str, int]]):
        fd, path = tempfile.mkstemp(prefix='roles-import-', suffix='.csv')
        os.close(fd)
        with open(path, 'w', encoding='utf-8') as f:
            f.write('department_id,role_name,sort_order\n')
            for dept_id, role_name, sort_order in rows:
                f.write(f"{dept_id},{role_name},{sort_order}\n")
        return path

    def test_importer_dry_run_and_idempotent(self):
        csv_path = self._write_csv([
            (self.dept1.id, 'Senior Engineer', 0),
            (self.dept2.id, 'Lead Designer', 1),
        ])
        try:
            # Dry run creates nothing
            call_command('import_project_roles', csv_path, '--dry-run')
            self.assertEqual(ProjectRole.objects.count(), 0)

            # Real run creates two roles
            call_command('import_project_roles', csv_path)
            self.assertEqual(ProjectRole.objects.count(), 2)

            # Running again is idempotent (no duplicates)
            call_command('import_project_roles', csv_path)
            self.assertEqual(ProjectRole.objects.count(), 2)
        finally:
            os.remove(csv_path)

