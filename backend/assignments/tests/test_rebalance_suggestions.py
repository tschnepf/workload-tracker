from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from datetime import datetime, timedelta

from people.models import Person
from departments.models import Department
from roles.models import Role
from assignments.models import Assignment


def sunday_of_week(date):
    weekday = date.weekday()
    days_since_sunday = (weekday + 1) % 7
    return (date - timedelta(days=days_since_sunday))


class RebalanceSuggestionsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user(username='user_rebalance', password='pw')
        self.client.force_authenticate(user=self.user)
        # Overallocated person
        dept, _ = Department.objects.get_or_create(name='Engineering')
        role, _ = Role.objects.get_or_create(name='Engineer')

        # Overallocated person (same dept/role)
        self.p_over = Person.objects.create(name='Over', weekly_capacity=36, department=dept, role=role)
        # Underutilized person (same dept/role)
        self.p_under = Person.objects.create(name='Under', weekly_capacity=36, department=dept, role=role)

        today = datetime.now().date()
        sunday = sunday_of_week(today)
        week_key = sunday.strftime('%Y-%m-%d')

        # Overallocated: 40h > 36h
        Assignment.objects.create(person=self.p_over, weekly_hours={week_key: 40})
        # Underutilized: 20h < 36*0.7=25.2
        Assignment.objects.create(person=self.p_under, weekly_hours={week_key: 20})

    def test_rebalance_suggestions_returns_expected_structure(self):
        resp = self.client.get('/api/assignments/rebalance_suggestions/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 1)
        item = data[0]
        for key in ['id', 'title', 'description', 'fromPersonId', 'toPersonId']:
            self.assertIn(key, item)

    def test_rebalance_suggestions_limit(self):
        # Add more underutilized people to potentially create many suggestions
        today = datetime.now().date()
        week_key = sunday_of_week(today).strftime('%Y-%m-%d')
        # Create many underutilized in same dept/role (eligible)
        dept, _ = Department.objects.get_or_create(name='Engineering')
        role, _ = Role.objects.get_or_create(name='Engineer')
        for i in range(30):
            p = Person.objects.create(name=f'Under{i}', weekly_capacity=36, department=dept, role=role)
            Assignment.objects.create(person=p, weekly_hours={week_key: 0})

        resp = self.client.get('/api/assignments/rebalance_suggestions/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertLessEqual(len(data), 20)
