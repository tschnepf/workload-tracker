from typing import Any
from django.contrib.auth.models import Group
from rest_framework.permissions import BasePermission, SAFE_METHODS


def _get_group_names(user) -> set[str]:
    try:
        return set(user.groups.values_list('name', flat=True))
    except Exception:
        return set()


def is_admin_user(user) -> bool:
    return bool(user and (getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False)))


def is_manager_user(user) -> bool:
    if not user:
        return False
    group_names = _get_group_names(user)
    return 'Manager' in group_names


def is_admin_or_manager(user) -> bool:
    return is_admin_user(user) or is_manager_user(user)


class IsAdminOrManager(BasePermission):
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view: Any) -> bool:
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return is_admin_or_manager(user)


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
        if is_admin_user(user):
            return True

        # Determine group membership
        if is_manager_user(user):
            return True

        # Default/User
        if request.method in SAFE_METHODS:
            return True

        # Allow object-level checks to decide for certain viewsets (People/Assignments)
        try:
            view_name = view.__class__.__name__
            view_module = getattr(view, '__module__', '')
        except Exception:
            view_name = ''
            view_module = ''
        if view_name in ('PersonViewSet', 'AssignmentViewSet') and (
            view_module.startswith('people.') or view_module.startswith('assignments.')
        ):
            # Defer to has_object_permission
            return True

        # For accounts views that purposefully set their own permission_classes,
        # this default will be bypassed; otherwise deny writes.
        return False

    def has_object_permission(self, request, view: Any, obj: Any) -> bool:
        """Object-level guard.

        Rules:
        - Admins/Managers: allowed (same as has_permission above).
        - SAFE methods: allowed.
        - People: a regular user may modify only their own linked Person (via UserProfile.person).
        - Assignments: a regular user may modify only assignments for their own Person.
        - Otherwise: deny writes for regular users.
        """
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False

        # Admins always allowed; Managers group allowed
        if is_admin_user(user):
            return True
        if is_manager_user(user):
            return True

        # Read-only for others
        if request.method in SAFE_METHODS:
            return True

        # For write operations, enforce ownership for specific models
        try:
            label = getattr(getattr(obj, '_meta', None), 'label_lower', '')
        except Exception:
            label = ''

        # Resolve linked person id (if any)
        try:
            profile = getattr(user, 'profile', None)
            user_person_id = getattr(profile, 'person_id', None)
        except Exception:
            user_person_id = None

        if label == 'people.person':
            return bool(user_person_id and getattr(obj, 'id', None) == user_person_id)

        if label == 'assignments.assignment':
            try:
                return bool(user_person_id and getattr(obj, 'person_id', None) == user_person_id)
            except Exception:
                return False

        # Default deny for other models
        return False
