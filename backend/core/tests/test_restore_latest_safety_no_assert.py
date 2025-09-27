import os
import io
import gzip
import tempfile
from unittest.mock import patch

from django.test import TestCase
from django.core.management import call_command


class RestoreLatestSafetyNoAssertTests(TestCase):
    def setUp(self):
        os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/test')
        os.environ['RESTORE_TEST_ENABLED'] = 'true'

    @patch('core.management.commands.restore_latest_safety.subprocess.run')
    @patch('core.management.commands.restore_latest_safety.subprocess.Popen')
    @patch('core.management.commands.restore_latest_safety.BackupService')
    def test_sql_gz_with_missing_stdin_does_not_assert(self, MockSvc, MockPopen, MockRun):
        # Arrange: create temp backups dir and a small .sql.gz
        tmpdir = tempfile.mkdtemp(prefix='rt_')
        path = os.path.join(tmpdir, 'demo.sql.gz')
        with gzip.open(path, 'wb') as f:
            f.write(b'SELECT 1;')

        # Mock BackupService to point to our temp file
        svc = MockSvc.return_value
        svc.backups_dir = tmpdir
        svc.lock_file.return_value = os.path.join(tmpdir, '.restore.lock.missing')
        svc.list_backups.return_value = [{
            'filename': 'demo.sql.gz',
            'createdAt': '2099-01-01T00:00:00Z',
        }]

        # Popen returns proc with stdin=None to simulate failure path
        class DummyProc:
            stdin = None
            returncode = 0
            def communicate(self):
                return (b'', b'')
            def terminate(self):
                pass
        MockPopen.return_value = DummyProc()

        # subprocess.run should generally succeed for create/drop/check
        def ok_run(*args, **kwargs):
            class R:
                stdout = ''
                stderr = ''
                returncode = 0
            return R()
        MockRun.side_effect = ok_run

        buf = io.StringIO()
        call_command('restore_latest_safety', stdout=buf)
        out = buf.getvalue().strip()
        # Emits JSON containing success=false with detail message
        self.assertIn('"success":false', out.replace(' ', '').lower())
        self.assertIn('no stdin pipe'.replace(' ', ''), out.replace(' ', '').lower())
