from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from people.models import Person
from accounts.models import UserProfile


class PeopleObjectPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        U = get_user_model()
        # Two users and their linked persons
        self.u1 = U.objects.create_user(username='u1', password='pw')
        self.u2 = U.objects.create_user(username='u2', password='pw')
        self.p1 = Person.objects.create(name='P1')
        self.p2 = Person.objects.create(name='P2')
        UserProfile.objects.get_or_create(user=self.u1, defaults={'person': self.p1})
        # Ensure the link is set (get_or_create may create with null person depending on signals)
        up1 = UserProfile.objects.get(user=self.u1)
        if up1.person_id != self.p1.id:
            up1.person = self.p1
            up1.save(update_fields=['person'])

        UserProfile.objects.get_or_create(user=self.u2, defaults={'person': self.p2})
        up2 = UserProfile.objects.get(user=self.u2)
        if up2.person_id != self.p2.id:
            up2.person = self.p2
            up2.save(update_fields=['person'])

    def test_user_cannot_edit_other_person(self):
        self.client.force_authenticate(user=self.u1)
        resp = self.client.patch(f'/api/people/{self.p2.id}/', {'name': 'Hacked'}, format='json')
        self.assertIn(resp.status_code, (403, 404))  # forbid or hide

    # Policy decision: regular users do not have write permission even on their own Person;
    # edits must be performed by Managers/Admins. This test asserts deny-by-default.
    def test_user_cannot_edit_own_person(self):
        self.client.force_authenticate(user=self.u1)
        resp = self.client.patch(f'/api/people/{self.p1.id}/', {'name': 'Self Edit'}, format='json')
        self.assertIn(resp.status_code, (403, 404))
