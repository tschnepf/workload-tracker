import json
from pathlib import Path

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient


EXPECTED_JOB_ENDPOINTS = [
    ('get', '/api/people/export_excel/'),
    ('post', '/api/people/import_excel/'),
    ('get', '/api/people/skill_match_async/'),
    ('get', '/api/projects/export_excel/'),
    ('get', '/api/assignments/grid_snapshot_async/'),
    ('post', '/api/deliverables/pre_deliverable_items/backfill/'),
    ('post', '/api/backups/'),
    ('post', '/api/backups/{id}/restore/'),
    ('post', '/api/backups/upload-restore/'),
    ('patch', '/api/people/{id}/'),
]

EXPECTED_PURPOSE_TAGS = [
    'people_export_excel',
    'people_import_excel',
    'people_skill_match_async',
    'people_deactivate_cleanup',
    'projects_export_excel',
    'assignments_grid_snapshot_async',
    'deliverables_preitems_backfill',
    'backup_create',
    'backup_restore',
    'backup_upload_restore',
]


class JobEndpointInventoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='schema-admin',
            email='schema-admin@example.com',
            password='x',
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(self.admin)

    def test_schema_contains_expected_job_producing_endpoints(self):
        resp = self.client.get('/api/schema/?format=json')
        self.assertEqual(resp.status_code, 200)
        payload = json.loads(resp.content.decode('utf-8'))
        paths = payload.get('paths', {})
        for method, path in EXPECTED_JOB_ENDPOINTS:
            self.assertIn(path, paths, f'Missing job endpoint in schema: {path}')
            self.assertIn(method, paths[path], f'Missing {method.upper()} operation for {path}')

    def test_source_contains_all_job_ownership_purpose_tags(self):
        root = Path(__file__).resolve().parents[2]
        source_files = [
            root / 'people' / 'views.py',
            root / 'projects' / 'views.py',
            root / 'assignments' / 'views.py',
            root / 'deliverables' / 'views.py',
            root / 'core' / 'backup_views.py',
        ]
        combined = '\n'.join(p.read_text(encoding='utf-8') for p in source_files)
        for purpose in EXPECTED_PURPOSE_TAGS:
            self.assertIn(f"purpose='{purpose}'", combined, f'Missing ownership purpose tag: {purpose}')
