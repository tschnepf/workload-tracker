from io import BytesIO
from django.test import TestCase
from django.contrib.auth import get_user_model
from people.models import Person
from people.utils.excel_handler import export_people_to_excel
import openpyxl


class PeopleExportSanitizationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        User.objects.create_user(username='u', password='pw')

    def test_name_starting_with_equals_is_text_not_formula(self):
        p = Person.objects.create(name='=CMD()', weekly_capacity=36)
        resp = export_people_to_excel(Person.objects.filter(id=p.id))
        self.assertEqual(resp.status_code, 200)
        content = resp.content
        wb = openpyxl.load_workbook(BytesIO(content), data_only=False)
        try:
            ws = wb['People']
            # Headers row 1; our record at row 2. 'name' is column 2 based on headers order.
            cell = ws.cell(row=2, column=2)
            # Ensure it is stored as text and not a formula
            self.assertEqual(cell.data_type, 's')
            val = str(cell.value)
            # Some writers prefix with an apostrophe; normalize for the assertion
            if val.startswith("'"):
                val = val[1:]
            self.assertTrue(val.startswith("="))
        finally:
            wb.close()
