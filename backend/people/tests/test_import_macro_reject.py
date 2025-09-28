from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile


class PeopleImportMacroRejectTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        U = get_user_model()
        self.user = U.objects.create_user(username='staff', password='pw', is_staff=True)
        self.client.force_authenticate(user=self.user)

    def test_rejects_xlsm(self):
        bad = SimpleUploadedFile('evil.xlsm', b'PK\x03\x04', content_type='application/vnd.ms-excel.sheet.macroEnabled.12')
        resp = self.client.post('/api/people/import_excel/', {'file': bad}, format='multipart')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Macro-enabled', (resp.data.get('error') or ''))

