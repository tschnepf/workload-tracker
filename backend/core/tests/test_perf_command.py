import io
import json
from django.test import TestCase, override_settings
from django.core.management import call_command


class PerfCommandTests(TestCase):
    def run_cmd(self, args):
        buf = io.StringIO()
        call_command('test_aggregation_performance', *args, stdout=buf)
        buf.seek(0)
        data = json.loads(buf.read())
        return data

    @override_settings(DEBUG=True)
    def test_perf_command_reports_queries_in_debug(self):
        data = self.run_cmd(['--endpoint', 'grid_snapshot', '--weeks', '1'])
        self.assertIn('grid_snapshot', data)
        snap = data['grid_snapshot']
        self.assertIn('status', snap)
        self.assertIn('duration_ms', snap)
        # queries should be an int when DEBUG=True
        self.assertIn('queries', snap)
        self.assertTrue(isinstance(snap['queries'], int))

    @override_settings(DEBUG=False)
    def test_perf_command_hides_queries_when_not_debug(self):
        data = self.run_cmd(['--endpoint', 'grid_snapshot', '--weeks', '1'])
        snap = data['grid_snapshot']
        # queries should be None (or absent); treat missing as pass
        if 'queries' in snap:
            self.assertIsNone(snap['queries'])

    @override_settings(DEBUG=True)
    def test_perf_command_explain_when_debug_and_flag(self):
        data = self.run_cmd(['--endpoint', 'grid_snapshot', '--weeks', '1', '--explain'])
        # Should include _explain with some keys or an _explain_error on empty DBs
        self.assertTrue(('_explain' in data) or ('_explain_error' in data))

