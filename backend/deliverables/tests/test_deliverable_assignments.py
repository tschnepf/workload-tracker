from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from projects.models import Project
from people.models import Person
from deliverables.models import Deliverable, DeliverableAssignment


class DeliverableAssignmentApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.project = Project.objects.create(name="Project A")
        self.person = Person.objects.create(name="Sarah", weekly_capacity=36)
        self.deliverable = Deliverable.objects.create(project=self.project, description="Milestone 1")

    def test_create_assignment(self):
        payload = {
            "deliverable": self.deliverable.id,
            "person": self.person.id,
            "weeklyHours": {
                "2025-09-07": 8,
                "2025-09-14": 6
            },
            "roleOnMilestone": "Designer"
        }
        resp = self.client.post('/api/deliverables/assignments/', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        data = resp.json()
        # Check camelCase fields
        self.assertIn('id', data)
        self.assertEqual(data['deliverable'], self.deliverable.id)
        self.assertEqual(data['person'], self.person.id)
        self.assertEqual(data['weeklyHours']["2025-09-07"], 8)
        self.assertEqual(data['roleOnMilestone'], "Designer")
        self.assertEqual(data['personName'], self.person.name)
        self.assertEqual(data['projectId'], self.project.id)
        self.assertIn('createdAt', data)
        self.assertIn('updatedAt', data)

    def test_list_assignments(self):
        DeliverableAssignment.objects.create(
            deliverable=self.deliverable, person=self.person, weekly_hours={"2025-09-07": 4}
        )
        resp = self.client.get('/api/deliverables/assignments/?all=true')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 1)
        self.assertIn('weeklyHours', data[0])

    def test_by_deliverable(self):
        p2 = Person.objects.create(name="Alex", weekly_capacity=36)
        d2 = Deliverable.objects.create(project=self.project, description="Milestone 2")
        DeliverableAssignment.objects.create(deliverable=self.deliverable, person=self.person, weekly_hours={"2025-09-07": 4})
        DeliverableAssignment.objects.create(deliverable=d2, person=p2, weekly_hours={"2025-09-07": 2})

        resp = self.client.get(f'/api/deliverables/assignments/by_deliverable/?deliverable={self.deliverable.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertTrue(all(item['deliverable'] == self.deliverable.id for item in data))

    def test_by_person(self):
        p2 = Person.objects.create(name="Alex", weekly_capacity=36)
        DeliverableAssignment.objects.create(deliverable=self.deliverable, person=self.person, weekly_hours={"2025-09-07": 4})
        DeliverableAssignment.objects.create(deliverable=self.deliverable, person=p2, weekly_hours={"2025-09-07": 2})

        resp = self.client.get(f'/api/deliverables/assignments/by_person/?person={self.person.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertTrue(all(item['person'] == self.person.id for item in data))
