from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model

from accounts.models import UserProfile
from accounts.signals import create_user_profile


class UserProfileSignalTests(TestCase):
    def setUp(self):
        self.User = get_user_model()

    @override_settings(ENABLE_PROFILE_AUTO_CREATE=True)
    def test_signal_creates_single_profile_when_called_twice(self):
        user = self.User.objects.create_user(username='u-idem', password='pw')

        # In test settings, auto-create may be disabled; assert zero to begin with
        self.assertEqual(UserProfile.objects.filter(user=user).count(), 0)

        # Simulate double invocation of the post_save handler
        create_user_profile(sender=self.User, instance=user, created=True)
        create_user_profile(sender=self.User, instance=user, created=True)

        # Exactly one profile should exist
        self.assertEqual(UserProfile.objects.filter(user=user).count(), 1)

    @override_settings(ENABLE_PROFILE_AUTO_CREATE=True)
    def test_signal_ignores_when_created_false(self):
        user = self.User.objects.create_user(username='u-ignore', password='pw')
        self.assertEqual(UserProfile.objects.filter(user=user).count(), 0)

        # Calling with created=False should not create a profile
        create_user_profile(sender=self.User, instance=user, created=False)
        self.assertEqual(UserProfile.objects.filter(user=user).count(), 0)
