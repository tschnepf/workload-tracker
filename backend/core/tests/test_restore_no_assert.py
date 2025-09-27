import gzip
import os
import tempfile
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.core.management import call_command
from django.core.management.base import CommandError


class RestoreDatabaseNoAssertTests(TestCase):
    @override_settings(BACKUPS_DIR=tempfile.gettempdir())
    @patch('core.management.commands.restore_database._psql_ok', return_value=True)
    @patch('core.management.commands.restore_database.subprocess.run')
    @patch('core.management.commands.restore_database.subprocess.Popen')
    def test_plain_sql_gz_without_stdin_raises_commanderror(self, mock_popen, mock_run, _ok):
        # Arrange: create a tiny .sql.gz file in BACKUPS_DIR
        tmpdir = tempfile.gettempdir()
        path = os.path.join(tmpdir, 'test_restore.sql.gz')
        with gzip.open(path, 'wb') as f:
            f.write(b'SELECT 1;')

        class DummyProc:
            stdin = None
            returncode = 0
            def communicate(self):
                return (b'', b'')
            def terminate(self):
                pass

        mock_popen.return_value = DummyProc()

        # subprocess.run used throughout should pretend success
        def ok_run(*args, **kwargs):
            class R:
                stdout = ''
                stderr = ''
                returncode = 0
            return R()
        mock_run.side_effect = ok_run

        # Ensure DATABASE_URL exists to satisfy command precheck
        os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/test')

        # Act + Assert
        with self.assertRaises(CommandError):
            call_command('restore_database', path=path, confirm='I understand this will irreversibly overwrite data')
