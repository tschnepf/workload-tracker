from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from datetime import datetime, timedelta

from people.models import Person
from departments.models import Department
from assignments.models import Assignment


def sunday_of_week(date):
    # Monday=0..Sunday=6; find the Sunday for the week containing 'date'
    weekday = date.weekday()  # 0..6
    # Sunday is 6; distance from date to previous Sunday
    days_since_sunday = (weekday + 1) % 7
    return (date - timedelta(days=days_since_sunday))


class CapacityHeatmapApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dept_eng, _ = Department.objects.get_or_create(name='Engineering')
        self.dept_ops, _ = Department.objects.get_or_create(name='Operations')
        self.p1 = Person.objects.create(name='Alice', weekly_capacity=40, department=self.dept_eng)
        self.p2 = Person.objects.create(name='Bob', weekly_capacity=30, department=self.dept_ops)

        # Create assignments with Sunday week keys for the next two weeks
        today = datetime.now().date()
        this_sunday = sunday_of_week(today)
        next_sunday = this_sunday + timedelta(days=7)
        week_key_0 = this_sunday.strftime('%Y-%m-%d')
        week_key_1 = next_sunday.strftime('%Y-%m-%d')

        Assignment.objects.create(person=self.p1, weekly_hours={week_key_0: 10, week_key_1: 20})
        Assignment.objects.create(person=self.p2, weekly_hours={week_key_0: 5})

    def test_capacity_heatmap_default(self):
        resp = self.client.get('/api/people/capacity_heatmap/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        # Two people returned
        self.assertEqual(len(data), 2)
        # Validate shape for first item
        item = data[0]
        self.assertIn('id', item)
        self.assertIn('name', item)
        self.assertIn('weeklyCapacity', item)
        self.assertIn('weekKeys', item)
        self.assertIn('weekTotals', item)
        self.assertIn('peak', item)
        self.assertIn('averagePercentage', item)
        # Default weeks should be 12
        self.assertEqual(len(item['weekKeys']), 12)

    def test_capacity_heatmap_weeks_param(self):
        resp = self.client.get('/api/people/capacity_heatmap/?weeks=2')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        # Ensure weekKeys length is 2
        self.assertTrue(all(len(p['weekKeys']) == 2 for p in data))

    def test_capacity_heatmap_department_filter(self):
        # Filter by Engineering department should only return Alice
        resp = self.client.get(f'/api/people/capacity_heatmap/?department={self.dept_eng.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertTrue(all(item['name'] == 'Alice' for item in data))
