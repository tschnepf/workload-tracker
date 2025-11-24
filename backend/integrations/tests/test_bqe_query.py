from django.test import SimpleTestCase

from integrations.providers.bqe.query import WhereClauseBuilder


class WhereClauseBuilderTests(SimpleTestCase):
    def test_builder_gte_and_is_null(self):
        clause = (
            WhereClauseBuilder()
            .gte('lastUpdated', '2025-01-01T00:00:00Z')
            .is_null('parentId')
            .build()
        )
        self.assertEqual(clause, "lastUpdated>='2025-01-01T00:00:00Z' and parentId is null")

    def test_builder_quotes_and_escapes_values(self):
        clause = WhereClauseBuilder().eq('name', "O'Reilly").raw('status = active').build()
        self.assertEqual(clause, "name='O''Reilly' and status = active")
