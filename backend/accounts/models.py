from django.db import models
from django.conf import settings


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    person = models.OneToOneField(
        'people.Person',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='user_profile',
    )
    settings = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:  # pragma: no cover
        # Avoid hitting related objects extensively in admin lists
        return getattr(self.user, 'username', str(self.user))

