from django.test import TestCase
from django.core.management import call_command
from core.models import UtilizationScheme
import json
import tempfile


class UtilizationSchemeCommandTests(TestCase):
    def test_dump_and_load_round_trip(self):
        s = UtilizationScheme.get_active()
        orig_version = s.version

        with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as tmp:
            # Dump
            call_command('dump_utilization_scheme', file=tmp.name)
            tmp.flush()
            data = json.load(open(tmp.name, 'r'))
            self.assertIn('mode', data)
            self.assertEqual(data['blue_min'], s.blue_min)

            # Modify and load
            data['green_max'] = data['green_min']  # shrink green range
            json.dump(data, open(tmp.name, 'w'))
            call_command('load_utilization_scheme', file=tmp.name)

        s2 = UtilizationScheme.get_active()
        self.assertGreater(s2.version, orig_version)
        self.assertEqual(s2.green_max, s2.green_min)

