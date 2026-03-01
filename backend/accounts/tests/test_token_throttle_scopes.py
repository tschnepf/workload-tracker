from django.test import SimpleTestCase

from accounts.token_views import ThrottledTokenObtainPairView, ThrottledTokenRefreshView


class TokenThrottleScopeTests(SimpleTestCase):
    def test_obtain_scope_is_dedicated(self):
        self.assertEqual(ThrottledTokenObtainPairView.throttle_scope, "token_obtain")

    def test_refresh_scope_is_dedicated(self):
        self.assertEqual(ThrottledTokenRefreshView.throttle_scope, "token_refresh")
