from django.test import TestCase
from datetime import datetime, timedelta

from people.models import Person
from assignments.models import Assignment
from people.services import CapacityAnalysisService


def sunday_of_week(date):
    weekday = date.weekday()
    days_since_sunday = (weekday + 1) % 7
    return date - timedelta(days=days_since_sunday)


class TestCapacityAnalysisService(TestCase):
    def setUp(self):
        self.p1 = Person.objects.create(name='Alice', weekly_capacity=40)
        self.p2 = Person.objects.create(name='Bob', weekly_capacity=30)
        today = datetime.now().date()
        s0 = sunday_of_week(today)
        s1 = s0 + timedelta(days=7)
        k0 = s0.strftime('%Y-%m-%d')
        k1 = s1.strftime('%Y-%m-%d')
        Assignment.objects.create(person=self.p1, weekly_hours={k0: 10, k1: 20})
        Assignment.objects.create(person=self.p2, weekly_hours={k0: 5})

    def test_capacity_heatmap_calculation(self):
        qs = Person.objects.filter(is_active=True).select_related('department')
        data = CapacityAnalysisService.get_capacity_heatmap(qs, weeks=2)
        self.assertEqual(len(data), 2)
        first = data[0]
        for k in ['id', 'name', 'weeklyCapacity', 'department', 'weekKeys', 'weekTotals', 'peak', 'averagePercentage']:
            self.assertIn(k, first)

    def test_workload_forecast_aggregation(self):
        # Prefetch assignments for efficiency
        qs = Person.objects.filter(is_active=True).prefetch_related('assignments')
        forecast = CapacityAnalysisService.get_workload_forecast(qs, weeks=2)
        self.assertEqual(len(forecast), 2)
        self.assertIn('weekStart', forecast[0])
        self.assertIn('totalCapacity', forecast[0])
        self.assertIn('totalAllocated', forecast[0])
        # Week 0 totalAllocated should be 15 (10+5)
        self.assertIn(forecast[0]['totalAllocated'], [15, 15.0])

