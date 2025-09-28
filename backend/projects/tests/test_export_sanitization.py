from io import BytesIO
from django.test import TestCase
from projects.models import Project
from projects.utils.excel_handler import export_projects_to_excel
import openpyxl


class ProjectsExportSanitizationTests(TestCase):
    def test_project_name_starting_with_equals_is_text(self):
        p = Project.objects.create(name='=SUM(1,2)')
        resp = export_projects_to_excel(Project.objects.filter(id=p.id))
        self.assertEqual(resp.status_code, 200)
        wb = openpyxl.load_workbook(BytesIO(resp.content), data_only=False)
        try:
            ws = wb['Projects']
            # Row 2, col 1 is name
            cell = ws.cell(row=2, column=1)
            self.assertEqual(cell.data_type, 's')
            val = str(cell.value)
            if val.startswith("'"):
                val = val[1:]
            self.assertTrue(val.startswith('='))
        finally:
            wb.close()

