from typing import Any
from django.contrib.auth.models import Group
from rest_framework.permissions import BasePermission, SAFE_METHODS


class RoleBasedAccessPermission(BasePermission):
    """Global role-based guard.

    - Admin (is_staff or is_superuser): allow all.
    - Manager (in "Manager" group): allow all (admin-only endpoints still require IsAdminUser explicitly).
    - User (in "User" group or no group): allow read-only (SAFE_METHODS) for non-accounts views.
    This class is meant to be used as a DEFAULT permission; views that need different behavior
    (like accounts endpoints) can specify their own permission_classes.
    """

    message = "You do not have permission to perform this action."

    def has_permission(self, request, view: Any) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False

        # Admins always allowed
        if user.is_staff or user.is_superuser:
            return True

        # Determine group membership
        try:
            group_names = set(user.groups.values_list('name', flat=True))
        except Exception:
            group_names = set()

        if 'Manager' in group_names:
            return True

        # Default/User: read-only for non-accounts views
        if request.method in SAFE_METHODS:
            return True

        # For accounts views that purposefully set their own permission_classes,
        # this default will be bypassed; otherwise deny writes.
        return False

