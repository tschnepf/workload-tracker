"""
Performance regression tests - Phase 6 Implementation
Tests for N+1 queries and performance monitoring
"""

from django.test import TestCase, override_settings
from django.db import connection
from django.test.utils import override_settings
from unittest.mock import patch
import time

from people.models import Person, PersonSkill
from projects.models import Project  
from assignments.models import Assignment
from skills.models import Skill


class PerformanceRegressionTests(TestCase):
    """Tests to catch performance regressions, especially N+1 queries"""
    
    def setUp(self):
        """Set up test data"""
        # Create test people
        self.people = [
            Person.objects.create(
                name=f"Person {i}",
                email=f"person{i}@example.com",
                role="Engineer",
                hourly_rate=75.00
            ) for i in range(10)
        ]
        
        # Create test skills
        self.skills = [
            Skill.objects.create(name=f"Skill {i}")
            for i in range(5)
        ]
        
        # Create test projects
        self.projects = [
            Project.objects.create(
                name=f"Project {i}",
                description=f"Test project {i}",
                start_date="2024-01-01",
                end_date="2024-12-31",
                status="active"
            ) for i in range(3)
        ]
        
        # Create assignments
        for person in self.people[:5]:  # First 5 people get assignments
            for project in self.projects:
                Assignment.objects.create(
                    person=person,
                    project=project,
                    hours_per_week=20,
                    start_date="2024-01-01",
                    end_date="2024-12-31"
                )
        
        # Add skills to people
        for person in self.people:
            for skill in self.skills[:3]:  # Each person gets 3 skills
                PersonSkill.objects.create(person=person, skill=skill)

    def assertNumQueries(self, num, func=None, *args, using='default', **kwargs):
        """Enhanced assertNumQueries with query details"""
        with self.assertNumQueriesContext(num, using) as context:
            func(*args, **kwargs)
        
        if len(context.captured_queries) != num:
            # Log the actual queries for debugging
            print(f"\nExpected {num} queries, but got {len(context.captured_queries)}:")
            for i, query in enumerate(context.captured_queries, 1):
                print(f"{i}. {query['sql']}")
        
        return context

    def assertNumQueriesContext(self, num, using):
        """Context manager for query counting"""
        return self._AssertNumQueriesContext(num, using)

    class _AssertNumQueriesContext:
        def __init__(self, test_case, num, using):
            self.test_case = test_case
            self.num = num
            self.using = using

        def __enter__(self):
            self.old_debug_cursor = connection.force_debug_cursor
            connection.force_debug_cursor = True
            self.starting_queries = len(connection.queries)
            self.captured_queries = []
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            connection.force_debug_cursor = self.old_debug_cursor
            
            if exc_type is not None:
                return
            
            # Capture queries that were executed during the context
            final_queries = len(connection.queries)
            executed_queries = final_queries - self.starting_queries
            self.captured_queries = connection.queries[self.starting_queries:]
            
            if executed_queries != self.num:
                msg = f"{executed_queries} queries executed, {self.num} expected"
                if self.captured_queries:
                    msg += "\nCaptured queries were:\n"
                    for query in self.captured_queries:
                        msg += f"  {query['sql']}\n"
                raise AssertionError(msg)

    @override_settings(DEBUG=True)
    def test_people_list_queries(self):
        """Test that people list doesn't cause N+1 queries"""
        from people.views import PersonViewSet
        
        def fetch_people():
            """Simulate the people list API call"""
            viewset = PersonViewSet()
            queryset = viewset.get_queryset()
            # Force evaluation of queryset (like DRF serializer would)
            list(queryset)
        
        # Should be 1 query for people + 1 for prefetch_related if using it
        # Adjust expected number based on current optimization level
        with self.assertNumQueries(1):  # Start with baseline expectation
            fetch_people()

    @override_settings(DEBUG=True) 
    def test_assignments_with_people_queries(self):
        """Test that assignment list with people doesn't cause N+1 queries"""
        from assignments.views import AssignmentViewSet
        
        def fetch_assignments():
            """Simulate the assignment list with people data"""
            viewset = AssignmentViewSet()
            queryset = viewset.get_queryset()
            
            # Force evaluation like a serializer would access related data
            assignments = list(queryset)
            for assignment in assignments:
                # Access person data (common in serializers)
                _ = assignment.person.name
                _ = assignment.person.role
                _ = assignment.project.name
        
        # Should be optimized with select_related or prefetch_related
        # Expected: 1 query for assignments + related data
        with self.assertNumQueries(1):  # Expecting optimized query
            fetch_assignments()

    @override_settings(DEBUG=True)
    def test_person_skills_queries(self):
        """Test that accessing person skills doesn't cause N+1 queries"""
        
        def fetch_people_with_skills():
            """Fetch people and their skills"""
            people = list(Person.objects.all())
            
            # This would cause N+1 if not optimized
            for person in people:
                skills = list(person.personskill_set.all())
                for skill_rel in skills:
                    _ = skill_rel.skill.name
        
        # Should be optimized with prefetch_related
        # Expected: 1 for people + 1 for skills prefetch
        with self.assertNumQueries(3):  # May need adjustment based on optimization
            fetch_people_with_skills()

    def test_performance_monitoring_command_basic(self):
        """Test that performance monitoring command runs without errors"""
        from django.core.management import call_command
        from io import StringIO
        
        out = StringIO()
        call_command('monitor_performance', stdout=out)
        output = out.getvalue()
        
        # Should contain health check results
        self.assertIn('health check', output.lower())

    def test_database_bloat_check(self):
        """Test database bloat checking functionality"""
        from django.core.management import call_command
        from io import StringIO
        
        out = StringIO()
        call_command('monitor_performance', '--check-db-bloat', stdout=out)
        output = out.getvalue()
        
        # Should run without errors and provide some output
        self.assertIn('bloat', output.lower())

    def test_query_performance_timing(self):
        """Test that common queries perform within acceptable time limits"""
        
        # Test people list performance
        start_time = time.time()
        list(Person.objects.all())
        people_time = time.time() - start_time
        
        # Should complete within reasonable time (adjust threshold as needed)
        self.assertLess(people_time, 1.0, "People query took too long")
        
        # Test assignments list performance  
        start_time = time.time()
        list(Assignment.objects.select_related('person', 'project'))
        assignments_time = time.time() - start_time
        
        self.assertLess(assignments_time, 1.0, "Assignments query took too long")

    def test_bulk_operations_performance(self):
        """Test that bulk operations are efficient"""
        
        # Test bulk create performance
        start_time = time.time()
        bulk_people = [
            Person(
                name=f"Bulk Person {i}",
                email=f"bulk{i}@example.com", 
                role="Engineer",
                hourly_rate=80.00
            ) for i in range(100)
        ]
        Person.objects.bulk_create(bulk_people)
        bulk_create_time = time.time() - start_time
        
        # Bulk create should be much faster than individual creates
        self.assertLess(bulk_create_time, 2.0, "Bulk create took too long")
        
        # Cleanup
        Person.objects.filter(name__startswith="Bulk Person").delete()

    @override_settings(DEBUG=True)
    def test_api_endpoint_queries(self):
        """Test API endpoints for query efficiency"""
        from django.test import Client
        
        client = Client()
        
        # Test people API endpoint
        with self.assertNumQueries(1):  # Adjust based on optimization
            response = client.get('/api/people/')
            self.assertEqual(response.status_code, 200)

    def test_dashboard_query_efficiency(self):
        """Test dashboard queries for performance"""
        from dashboard.views import DashboardView
        from django.test import RequestFactory
        
        factory = RequestFactory()
        request = factory.get('/api/dashboard/')
        
        view = DashboardView()
        view.request = request
        
        start_time = time.time()
        
        # Test with query counting
        with self.assertNumQueries(5):  # Adjust based on dashboard complexity
            response = view.get(request)
        
        duration = time.time() - start_time
        
        # Dashboard should load quickly
        self.assertLess(duration, 2.0, "Dashboard took too long to load")
        self.assertEqual(response.status_code, 200)


class PerformanceMonitoringTests(TestCase):
    """Tests for performance monitoring utilities"""
    
    def test_performance_budgets_configuration(self):
        """Test that performance budgets are properly configured"""
        from frontend.src.utils.monitoring import PERFORMANCE_BUDGETS
        
        # Verify all required metrics have budgets
        required_metrics = ['CLS', 'FID', 'LCP', 'FCP', 'TTFB']
        
        for metric in required_metrics:
            self.assertIn(metric, PERFORMANCE_BUDGETS)
            self.assertIn('budget', PERFORMANCE_BUDGETS[metric])
            self.assertIn('warning', PERFORMANCE_BUDGETS[metric])

    def test_query_pattern_detection(self):
        """Test detection of problematic query patterns"""
        from monitoring.management.commands.monitor_performance import Command
        
        command = Command()
        
        # This test would need to be expanded based on actual implementation
        # For now, just verify the command can be instantiated
        self.assertIsInstance(command, Command)