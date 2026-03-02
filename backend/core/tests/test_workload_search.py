from datetime import date, timedelta

from django.test import SimpleTestCase, TestCase

from assignments.models import Assignment, AssignmentWeekHour
from core.workload_search import (
    UtilizationBands,
    build_person_week_totals,
    combine_token_match_sets,
    match_people_for_expression,
    parse_workload_expression,
    resolve_workload_window,
)
from people.models import Person
from projects.models import Project
from roles.models import Role


class WorkloadSearchParseTests(SimpleTestCase):
    def setUp(self):
        self.bands = UtilizationBands(
            blue_min=1,
            blue_max=29,
            green_min=30,
            green_max=36,
            orange_min=37,
            orange_max=40,
            red_min=41,
        )

    def test_keyword_aliases_parse(self):
        expr = parse_workload_expression('underloaded', self.bands)
        self.assertIsNotNone(expr)
        self.assertEqual(expr.canonical_term, 'available')

        expr2 = parse_workload_expression('overloaded', self.bands)
        self.assertIsNotNone(expr2)
        self.assertEqual(expr2.canonical_term, 'overallocated')

    def test_numeric_comparator_and_range_parse(self):
        self.assertIsNotNone(parse_workload_expression('<30', self.bands))
        self.assertIsNotNone(parse_workload_expression('>=14', self.bands))
        self.assertIsNotNone(parse_workload_expression('10-20', self.bands))
        self.assertIsNone(parse_workload_expression('20-10', self.bands))

    def test_comma_and_parse(self):
        expr = parse_workload_expression('>14, <30', self.bands)
        self.assertIsNotNone(expr)
        self.assertEqual(len(expr.clauses), 2)

    def test_invalid_expression_returns_none(self):
        self.assertIsNone(parse_workload_expression('>x', self.bands))
        self.assertIsNone(parse_workload_expression('10--20', self.bands))

    def test_combine_token_sets_matches_search_semantics(self):
        tokens = [
            {'term': 'a', 'op': 'or'},
            {'term': 'b', 'op': 'and'},
            {'term': 'c', 'op': 'not'},
        ]
        sets = [
            {1, 2, 3},
            {2, 3, 4},
            {3},
        ]
        out = combine_token_match_sets(tokens=tokens, token_sets=sets, universe={1, 2, 3, 4, 5})
        self.assertEqual(out, {2})

    def test_resolve_workload_window_clamps(self):
        start, weeks = resolve_workload_window(week_start_raw='2026-03-04', weeks_raw='99', today=date(2026, 3, 5))
        self.assertEqual(start.weekday(), 6)  # Sunday
        self.assertEqual(weeks, 52)


class WorkloadSearchTotalsTests(TestCase):
    def setUp(self):
        role = Role.objects.create(name=f'Engineer {self._testMethodName}')
        self.person = Person.objects.create(name='Worker', weekly_capacity=36, role=role)
        self.project = Project.objects.create(name='Workload Project', status='active')
        self.assignment = Assignment.objects.create(
            person=self.person,
            project=self.project,
            weekly_hours={},
            is_active=True,
        )
        self.start = date(2026, 3, 1)
        AssignmentWeekHour.objects.create(
            assignment=self.assignment,
            person=self.person,
            project=self.project,
            department=self.person.department,
            week_start=self.start,
            hours=12,
        )
        AssignmentWeekHour.objects.create(
            assignment=self.assignment,
            person=self.person,
            project=self.project,
            department=self.person.department,
            week_start=self.start + timedelta(days=7),
            hours=24,
        )

    def test_build_totals_and_match_expression(self):
        totals = build_person_week_totals(
            assignments_qs=Assignment.objects.filter(id=self.assignment.id),
            week_start=self.start,
            weeks=2,
        )
        self.assertIn(self.person.id, totals)
        self.assertEqual(totals[self.person.id][self.start.isoformat()], 12.0)
        self.assertEqual(totals[self.person.id][(self.start + timedelta(days=7)).isoformat()], 24.0)

        bands = UtilizationBands(
            blue_min=1,
            blue_max=29,
            green_min=30,
            green_max=36,
            orange_min=37,
            orange_max=40,
            red_min=41,
        )
        expr = parse_workload_expression('>14, <30', bands)
        self.assertIsNotNone(expr)
        matched = match_people_for_expression(totals, expr)
        self.assertEqual(matched, {self.person.id})
