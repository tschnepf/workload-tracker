from django.test import TestCase
from datetime import datetime, timedelta

from people.models import Person
from departments.models import Department
from roles.models import Role
from assignments.models import Assignment
from assignments.services import WorkloadRebalancingService


def sunday_of_week(date):
    weekday = date.weekday()
    days_since_sunday = (weekday + 1) % 7
    return date - timedelta(days=days_since_sunday)


class TestWorkloadRebalancingService(TestCase):
    def setUp(self):
        dept, _ = Department.objects.get_or_create(name='Engineering')
        role, _ = Role.objects.get_or_create(name='Engineer')
        self.p_over = Person.objects.create(name='Over', weekly_capacity=36, department=dept, role=role)
        self.p_under = Person.objects.create(name='Under', weekly_capacity=36, department=dept, role=role)
        today = datetime.now().date()
        week_key = sunday_of_week(today).strftime('%Y-%m-%d')
        Assignment.objects.create(person=self.p_over, weekly_hours={week_key: 40})
        Assignment.objects.create(person=self.p_under, weekly_hours={week_key: 10})

    def test_generate_rebalance_suggestions(self):
        suggestions = WorkloadRebalancingService.generate_rebalance_suggestions(weeks=12)
        self.assertTrue(len(suggestions) >= 1)
        first = suggestions[0]
        for k in ['id', 'title', 'description', 'fromPersonId', 'toPersonId']:
            self.assertIn(k, first)
