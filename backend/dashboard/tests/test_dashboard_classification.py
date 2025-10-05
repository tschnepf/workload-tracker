from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from unittest.mock import patch
from people.models import Person


class DashboardClassificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='tester', password='pass', is_staff=True)
        self.client.force_authenticate(user=self.user)

    def test_distribution_uses_hours_in_absolute_mode(self):
        # Persons with different allocated_hours to hit each bucket under default scheme
        # Default scheme: blue 1-29, green 30-36, orange 37-40, red 41+
        p0 = Person.objects.create(name='Zero', weekly_capacity=40)
        p1 = Person.objects.create(name='Blue', weekly_capacity=40)
        p2 = Person.objects.create(name='Green', weekly_capacity=40)
        p3 = Person.objects.create(name='Orange', weekly_capacity=40)
        p4 = Person.objects.create(name='Red', weekly_capacity=40)

        hours_by_id = {
            p0.id: 0,   # zero -> underutilized
            p1.id: 15,  # blue
            p2.id: 35,  # green
            p3.id: 39,  # orange
            p4.id: 45,  # red
        }

        def fake_get_utilization_over_weeks(self, weeks=1):
            h = hours_by_id.get(self.id, 0)
            cap = self.weekly_capacity or 0
            pct = (h / cap * 100) if cap else 0
            return {
                'total_percentage': pct,
                'allocated_hours': h,
                'available_hours': max(0, cap - h),
                'is_overallocated': h > cap,
                'peak_percentage': pct,
                'peak_week_key': None,
                'is_peak_overallocated': h > cap,
            }

        with patch('people.models.Person.get_utilization_over_weeks', new=fake_get_utilization_over_weeks):
            res = self.client.get('/api/dashboard/?weeks=1')
            self.assertEqual(res.status_code, 200)
            data = res.json()
            dist = data['utilization_distribution']
            self.assertEqual(dist['underutilized'], 2)
            self.assertEqual(dist['optimal'], 1)
            self.assertEqual(dist['high'], 1)
            self.assertEqual(dist['overallocated'], 1)

    def test_boundary_hours_classification(self):
        # Boundaries: 0,1,29,30,36,37,40,41
        ids = []
        for i in range(8):
            ids.append(Person.objects.create(name=f'P{i}', weekly_capacity=40).id)
        hours_seq = [0, 1, 29, 30, 36, 37, 40, 41]
        hours_by_id = {pid: h for pid, h in zip(ids, hours_seq)}

        def fake_get_utilization_over_weeks(self, weeks=1):
            h = hours_by_id.get(self.id, 0)
            cap = self.weekly_capacity or 0
            pct = (h / cap * 100) if cap else 0
            return {
                'total_percentage': pct,
                'allocated_hours': h,
                'available_hours': max(0, cap - h),
                'is_overallocated': h > cap,
                'peak_percentage': pct,
                'peak_week_key': None,
                'is_peak_overallocated': h > cap,
            }

        with patch('people.models.Person.get_utilization_over_weeks', new=fake_get_utilization_over_weeks):
            res = self.client.get('/api/dashboard/?weeks=1')
            self.assertEqual(res.status_code, 200)
            data = res.json()
            dist = data['utilization_distribution']
            # Expected: 0,1,29 → underutilized (3); 30,36 → optimal (2); 37,40 → high (2); 41 → overallocated (1)
            self.assertEqual(dist['underutilized'], 3)
            self.assertEqual(dist['optimal'], 2)
            self.assertEqual(dist['high'], 2)
            self.assertEqual(dist['overallocated'], 1)
