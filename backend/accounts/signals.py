from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from .models import UserProfile


def create_user_profile(sender, instance, created, **kwargs):
    if created:
        # Create the associated profile if it doesn't exist
        UserProfile.objects.get_or_create(user=instance)


def connect_user_profile_signal():
    """Connect the post_save signal for the User model at app ready."""
    User = get_user_model()
    post_save.connect(create_user_profile, sender=User, dispatch_uid='accounts_create_user_profile')

