from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from core.cache_keys import build_aggregate_cache_key, build_authz_scope_hash


class AggregateCacheKeyTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user_a = User.objects.create_user(username='cache-user-a', password='x')
        self.user_b = User.objects.create_user(username='cache-user-b', password='x')
        self.staff = User.objects.create_user(username='cache-staff', password='x', is_staff=True)

    def _request_for(self, user: User):
        request = self.factory.get('/api/test/')
        request.user = user
        return request

    def test_key_normalizes_sorts_and_dedupes_filters(self):
        request = self._request_for(self.user_a)
        key_a = build_aggregate_cache_key(
            'ui.bootstrap',
            request,
            filters={
                'include': ['roles', 'departments', 'roles'],
                'department_ids': [20, 10, 20],
                'nested': {'b': 2, 'a': 1},
            },
        )
        key_b = build_aggregate_cache_key(
            'ui.bootstrap',
            request,
            filters={
                'department_ids': [10, 20],
                'include': ['departments', 'roles'],
                'nested': {'a': 1, 'b': 2},
            },
        )
        self.assertEqual(key_a, key_b)

    def test_authz_scope_hash_differs_by_role_scope(self):
        user_hash = build_authz_scope_hash(self._request_for(self.user_a))
        staff_hash = build_authz_scope_hash(self._request_for(self.staff))
        self.assertNotEqual(user_hash, staff_hash)

    def test_user_scoped_key_changes_by_user_identity(self):
        key_a = build_aggregate_cache_key(
            'personal.dashboard',
            self._request_for(self.user_a),
            filters={'weeks': 8},
            user_scoped=True,
        )
        key_b = build_aggregate_cache_key(
            'personal.dashboard',
            self._request_for(self.user_b),
            filters={'weeks': 8},
            user_scoped=True,
        )
        self.assertNotEqual(key_a, key_b)
