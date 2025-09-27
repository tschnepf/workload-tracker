from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile


class ProjectImportValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_superuser(username='tester', email='t@example.com', password='pw')
        self.client.force_authenticate(user=self.user)

    def test_bad_extension_returns_400(self):
        bad = SimpleUploadedFile('bad.txt', b'hello world', content_type='text/plain')
        resp = self.client.post('/api/projects/import_excel/', {'file': bad}, format='multipart')
        self.assertEqual(resp.status_code, 400)

    @override_settings(PROJECTS_UPLOAD_MAX_BYTES=10)
    def test_oversize_returns_413(self):
        # 11 bytes > 10 byte limit
        big = SimpleUploadedFile('x.csv', b'12345678901', content_type='text/csv')
        resp = self.client.post('/api/projects/import_excel/', {'file': big}, format='multipart')
        self.assertEqual(resp.status_code, 413)
