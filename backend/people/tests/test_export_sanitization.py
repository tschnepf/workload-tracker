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

    def test_csv_name_starting_with_equals_is_escaped(self):
        # Create a record with dangerous prefix
        p = Person.objects.create(name='=SUM(A1:A2)', weekly_capacity=36)
        from people.utils.csv_handler import export_people_to_csv
        resp = export_people_to_csv(Person.objects.filter(id=p.id))
        self.assertEqual(resp.status_code, 200)
        data = resp.content.decode('utf-8')
        # Parse CSV to extract first data row
        import csv, io
        reader = csv.reader(io.StringIO(data))
        rows = list(reader)
        # rows[0] headers, rows[1] data; 'name' is first column
        self.assertGreaterEqual(len(rows), 2)
        name_cell = rows[1][0]
        # Expect a leading apostrophe to neutralize formula execution
        self.assertTrue(name_cell.startswith("'="))
