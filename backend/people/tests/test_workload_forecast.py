from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from datetime import datetime, timedelta

from people.models import Person
from assignments.models import Assignment


def monday_of_week(date):
    return date - timedelta(days=date.weekday())


def sunday_of_week(date):
    weekday = date.weekday()
    days_since_sunday = (weekday + 1) % 7
    return date - timedelta(days=days_since_sunday)


class WorkloadForecastApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.p1 = Person.objects.create(name='Alice', weekly_capacity=40)
        self.p2 = Person.objects.create(name='Bob', weekly_capacity=30)

        today = datetime.now().date()
        # Use Sunday keys in data; endpoint searches +/- 3 days so it will pick these up
        sun0 = sunday_of_week(today)
        sun1 = sun0 + timedelta(days=7)
        w0 = sun0.strftime('%Y-%m-%d')
        w1 = sun1.strftime('%Y-%m-%d')

        # Week 0 allocations: 10 + 5 = 15; Week 1 allocations: 20 + 0 = 20
        Assignment.objects.create(person=self.p1, weekly_hours={w0: 10, w1: 20})
        Assignment.objects.create(person=self.p2, weekly_hours={w0: 5, w1: 0})

    def test_forecast_default_weeks_and_shape(self):
        resp = self.client.get('/api/people/workload_forecast/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(len(data), 8)
        item = data[0]
        for k in ['weekStart', 'totalCapacity', 'totalAllocated', 'teamUtilization', 'peopleOverallocated']:
            self.assertIn(k, item)
        # Total capacity constant across team
        self.assertEqual(item['totalCapacity'], self.p1.weekly_capacity + self.p2.weekly_capacity)

    def test_forecast_values_week0_week1(self):
        resp = self.client.get('/api/people/workload_forecast/?weeks=2')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        # Week 0: 10 + 5 = 15 allocated of 70 capacity => 21.4%
        self.assertEqual(data[0]['totalAllocated'], 15)
        self.assertAlmostEqual(data[0]['teamUtilization'], round(15/70*100,1))
        # Week 1: 20 + 0 = 20 allocated of 70 capacity => 28.6%
        self.assertEqual(data[1]['totalAllocated'], 20)
        self.assertAlmostEqual(data[1]['teamUtilization'], round(20/70*100,1))

