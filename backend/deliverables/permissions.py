from __future__ import annotations

from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.permissions import is_admin_or_manager
from assignments.utils.project_membership import is_current_project_assignee


class DeliverableTaskPermission(BasePermission):
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if is_admin_or_manager(user):
            return True
        if request.method in SAFE_METHODS:
            return True
        # Non-admin: allow update operations only; object-level will enforce membership
        if request.method in ('PATCH', 'PUT'):
            return True
        # Disallow POST/DELETE for non-admins/managers
        return False

    def has_object_permission(self, request, view, obj) -> bool:
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if is_admin_or_manager(user):
            return True
        if request.method in SAFE_METHODS:
            return True
        # Must be a current project assignee to update tasks
        try:
            person_id = getattr(getattr(user, 'profile', None), 'person_id', None)
            project_id = obj.deliverable.project_id
        except Exception:
            return False
        if not person_id or not project_id:
            return False
        return is_current_project_assignee(person_id, project_id)
