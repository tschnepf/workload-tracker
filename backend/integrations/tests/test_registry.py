from django.test import SimpleTestCase

from integrations.registry import get_registry


class ProviderRegistryTests(SimpleTestCase):
    def test_registry_loads_bqe(self):
        registry = get_registry()
        provider = registry.get_provider('bqe')
        self.assertIsNotNone(provider)
        self.assertEqual(provider.key, 'bqe')
        self.assertGreaterEqual(len(provider.objects()), 1)

    def test_object_catalog_lookup(self):
        registry = get_registry()
        catalog = registry.get_object_catalog('bqe', 'projects')
        self.assertIsInstance(catalog, dict)
        self.assertEqual(catalog['key'], 'projects')
