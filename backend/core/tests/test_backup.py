import io
import os
import json
import gzip
import shutil
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, Client, override_settings
from django.conf import settings
from django.contrib.auth.models import User
from django.core.management import call_command


def _make_admin_and_user():
    admin = User.objects.create_user(username='admin', password='x', is_staff=True, is_superuser=True)
    user = User.objects.create_user(username='user', password='x', is_staff=False, is_superuser=False)
    return admin, user


class BackupCommandTests(TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix='backups_')
        # Minimal DSN so backup commands can parse
        os.environ['DATABASE_URL'] = 'postgresql://postgres:postgres@localhost:5432/testdb'

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _mock_run(self, *args, **kwargs):  # noqa: C901
        """Simulate psql/pg_dump/pg_restore calls returning success."""
        argv = args[0]
        class Result:
            def __init__(self, stdout=''):
                self.stdout = stdout
                self.stderr = ''
                self.returncode = 0
        # psql queries
        if argv and argv[0] == 'psql':
            if '-At' in argv and '-c' in argv:
                sql = argv[argv.index('-c') + 1]
                if 'pg_database_size' in sql:
                    return Result('4096')
                if 'SHOW server_version' in sql:
                    return Result('15.4')
            # VACUUM or schema changes
            return Result('OK')
        # pg_dump
        if argv and argv[0] == 'pg_dump':
            # Find output file after '-f'
            if '-f' in argv:
                out = argv[argv.index('-f') + 1]
                os.makedirs(os.path.dirname(out), exist_ok=True)
                with open(out, 'wb') as f:
                    f.write(b'PGDMP')
            return Result('')
        # pg_restore -l or restore
        if argv and argv[0] == 'pg_restore':
            return Result('LIST')
        return Result('')

    @override_settings(BACKUPS_DIR='/nonexistent')
    def test_backup_dir_overridden_in_settings(self):
        # Ensure setting exists; detailed behavior tested below
        from django.conf import settings
        self.assertTrue(hasattr(settings, 'BACKUPS_DIR'))

    @override_settings()
    def test_backup_creation_writes_archive_and_metadata(self):
        with override_settings(BACKUPS_DIR=self.tmpdir):
            buf = io.StringIO()
            with patch('subprocess.run', side_effect=self._mock_run):
                call_command('backup_database', stdout=buf)
            buf.seek(0)
            data = json.loads(buf.read())
            self.assertIn('filename', data)
            path = os.path.join(self.tmpdir, data['filename'])
            self.assertTrue(os.path.exists(path))
            # Sidecar metadata file
            base = path[:-len('.pgcustom')] if path.endswith('.pgcustom') else os.path.splitext(path)[0]
            meta = f"{base}.meta.json"
            self.assertTrue(os.path.exists(meta))

    def test_backup_lock_prevents_concurrent(self):
        with override_settings(BACKUPS_DIR=self.tmpdir):
            lock = os.path.join(self.tmpdir, '.backup.lock')
            open(lock, 'w').close()
            with self.assertRaises(Exception):
                with patch('subprocess.run', side_effect=self._mock_run):
                    call_command('backup_database')

    def test_restore_from_custom_archive_succeeds(self):
        with override_settings(BACKUPS_DIR=self.tmpdir):
            # Create dummy custom archive
            arch = os.path.join(self.tmpdir, 'app_env_db_20240101T000000Z.pgcustom')
            with open(arch, 'wb') as f:
                f.write(b'PGDMP')
            buf = io.StringIO()
            with patch('subprocess.run', side_effect=self._mock_run):
                call_command('restore_database', path=arch, jobs=2, confirm='I understand this will irreversibly overwrite data', stdout=buf)
            buf.seek(0)
            res = json.loads(buf.read())
            self.assertTrue(res.get('success'))
            # Lock should be cleaned up
            self.assertFalse(os.path.exists(os.path.join(self.tmpdir, '.restore.lock')))

    def test_restore_lock_prevents_concurrent(self):
        with override_settings(BACKUPS_DIR=self.tmpdir):
            lock = os.path.join(self.tmpdir, '.restore.lock')
            open(lock, 'w').close()
            with self.assertRaises(Exception):
                with patch('subprocess.run', side_effect=self._mock_run):
                    call_command('restore_database', path=os.path.join(self.tmpdir, 'x.pgcustom'), jobs=1, confirm='I understand this will irreversibly overwrite data')


@override_settings(SECURE_SSL_REDIRECT=False, DEBUG=True)
class BackupAPITests(TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix='backups_')
        self.admin, self.user = _make_admin_and_user()
        self.client = Client()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _admin_login(self):
        self.client.force_login(self.admin)

    def _user_login(self):
        self.client.force_login(self.user)

    @override_settings()
    def test_list_requires_admin_and_status_reports_retention(self):
        with override_settings(BACKUPS_DIR=self.tmpdir):
            # Create a dummy backup and sidecar
            name = 'app_env_db_20240101T000000Z.pgcustom'
            path = os.path.join(self.tmpdir, name)
            open(path, 'wb').write(b'PGDMP')
            open(os.path.join(self.tmpdir, 'app_env_db_20240101T000000Z.meta.json'), 'w').write(json.dumps({'description': 't'}))

            # Non-admin -> 403
            self._user_login()
            r = self.client.get('/api/backups/')
            self.assertEqual(r.status_code, 403)

            # Admin -> 200 and items present
            self._admin_login()
            r = self.client.get('/api/backups/')
            self.assertEqual(r.status_code, 200)
            self.assertTrue(r.json()['items'])

            # Status endpoint shows retentionOk
            r = self.client.get('/api/backups/status/')
            self.assertEqual(r.status_code, 200)
            self.assertTrue(r.json()['retentionOk'])

    @override_settings()
    def test_create_backup_enqueues_job_and_throttle(self):
        with override_settings(BACKUPS_DIR=self.tmpdir, REST_FRAMEWORK={
            **__import__('django.conf').conf.settings.REST_FRAMEWORK,
            'DEFAULT_THROTTLE_RATES': {
                **__import__('django.conf').conf.settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],
                'backup_create': '1/min',
            }
        }):
            self._admin_login()
            # Celery available and task stubbed
            with patch('core.backup_views._celery_has_workers', return_value=True), \
                 patch('core.backup_views.create_backup_task') as mock_task:
                mock_task.delay.return_value = SimpleNamespace(id='job123')
                r1 = self.client.post('/api/backups/', data=json.dumps({'description': 'test'}), content_type='application/json')
                self.assertEqual(r1.status_code, 202)
                # Exceed throttle
                r2 = self.client.post('/api/backups/', data=json.dumps({}), content_type='application/json')
                self.assertEqual(r2.status_code, 429)

    def test_celery_unavailable_returns_503(self):
        with override_settings(BACKUPS_DIR=self.tmpdir):
            self._admin_login()
            with patch('core.backup_views._celery_has_workers', return_value=False):
                r = self.client.post('/api/backups/', data=json.dumps({}), content_type='application/json')
                self.assertEqual(r.status_code, 503)

    def test_download_rejects_traversal(self):
        with override_settings(BACKUPS_DIR=self.tmpdir):
            self._admin_login()
            r = self.client.get('/api/backups/../../etc/passwd/download/')
            self.assertIn(r.status_code, (400, 404))

    def test_delete_removes_file_and_audit(self):
        from accounts.models import AdminAuditLog
        with override_settings(BACKUPS_DIR=self.tmpdir):
            # Create a dummy backup
            name = 'app_env_db_20240101T000000Z.pgcustom'
            path = os.path.join(self.tmpdir, name)
            open(path, 'wb').write(b'PGDMP')
            self._admin_login()
            r = self.client.delete(f'/api/backups/{name}/')
            self.assertEqual(r.status_code, 200)
            self.assertFalse(os.path.exists(path))
            self.assertTrue(AdminAuditLog.objects.filter(action='backup_delete').exists())

    def test_upload_restore_validates_type(self):
        rf = settings.REST_FRAMEWORK
        rates = rf['DEFAULT_THROTTLE_RATES'].copy()
        rates['backup_create'] = '1000/min'
        with override_settings(BACKUPS_DIR=self.tmpdir, REST_FRAMEWORK={**rf, 'DEFAULT_THROTTLE_RATES': rates}):
            # Use a fresh admin identity to avoid prior throttle history
            fresh = User.objects.create_user(username='admin2', password='x', is_staff=True, is_superuser=True)
            self.client.force_login(fresh)
            from django.core.files.uploadedfile import SimpleUploadedFile
            bad = SimpleUploadedFile('evil.txt', b'not allowed', content_type='text/plain')
            with patch('core.backup_views._celery_has_workers', return_value=True):
                r = self.client.post('/api/backups/upload-restore/', data={'file': bad, 'confirm': 'I understand this will irreversibly overwrite data'})
            self.assertEqual(r.status_code, 400)


class MaintenanceMiddlewareTests(TestCase):
    def test_read_only_mode_blocks_post_when_lock_present(self):
        tmpdir = tempfile.mkdtemp(prefix='backups_')
        try:
            with override_settings(BACKUPS_DIR=tmpdir):
                # Create lock
                open(os.path.join(tmpdir, '.restore.lock'), 'w').close()
                c = Client()
                # POST to a simple endpoint (health) should be blocked by middleware with 503
                r = c.post('/api/health/')
                self.assertEqual(r.status_code, 503)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)


class CeleryRoutingTests(TestCase):
    def test_restore_tasks_routed_to_db_queue(self):
        from django.conf import settings
        routes = getattr(settings, 'CELERY_TASK_ROUTES', {})
        self.assertEqual(routes.get('core.backup_tasks.*', {}).get('queue'), 'db_maintenance')
