import logging
from typing import Dict, Tuple

from django.conf import settings as django_settings
from rest_framework import serializers

from .models import UserProfile

logger = logging.getLogger(__name__)


ALLOWED_THEME_VALUES = ("light", "dark", "system")
ALLOWED_SETTING_KEYS = {
    "defaultDepartmentId",
    "includeChildren",
    "theme",
    "schemaVersion",
}


def sanitize_settings(payload: Dict) -> Tuple[Dict, set]:
    """Return a sanitized settings dict and a set of unknown keys.

    - Keeps only allowed keys with correct basic types/choices
    - Coerces values where reasonable; drops invalid values
    - Returns unknown keys for optional logging in DEBUG
    """
    if not isinstance(payload, dict):
        return {}, set()

    unknown = set(payload.keys()) - ALLOWED_SETTING_KEYS
    cleaned: Dict = {}

    # defaultDepartmentId: number|null
    if "defaultDepartmentId" in payload:
        value = payload.get("defaultDepartmentId")
        if value is None:
            cleaned["defaultDepartmentId"] = None
        else:
            try:
                cleaned["defaultDepartmentId"] = int(value)
            except (TypeError, ValueError):
                # ignore invalid
                pass

    # includeChildren: boolean
    if "includeChildren" in payload:
        value = payload.get("includeChildren")
        cleaned["includeChildren"] = bool(value)

    # theme: 'light'|'dark'|'system'
    if "theme" in payload:
        value = str(payload.get("theme") or "").strip().lower()
        if value in ALLOWED_THEME_VALUES:
            cleaned["theme"] = value

    # schemaVersion: number
    if "schemaVersion" in payload:
        try:
            cleaned["schemaVersion"] = int(payload.get("schemaVersion"))
        except (TypeError, ValueError):
            pass

    return cleaned, unknown


class UserProfileSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    person = serializers.SerializerMethodField()
    settings = serializers.JSONField(required=False)

    class Meta:
        model = UserProfile
        fields = ("id", "user", "person", "settings", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def get_user(self, obj: UserProfile):
        u = obj.user
        # Resolve groups and derived account role
        try:
            group_names = set(u.groups.values_list('name', flat=True))
        except Exception:
            group_names = set()
        if getattr(u, 'is_staff', False) or getattr(u, 'is_superuser', False):
            account_role = 'admin'
        elif 'Manager' in group_names:
            account_role = 'manager'
        else:
            account_role = 'user'
        return {
            "id": getattr(u, "id", None),
            "username": getattr(u, "username", None),
            "email": getattr(u, "email", None),
            "is_staff": getattr(u, "is_staff", False),
            "is_superuser": getattr(u, "is_superuser", False),
            "groups": sorted(list(group_names)),
            "accountRole": account_role,
        }

    def get_person(self, obj: UserProfile):
        p = obj.person
        if not p:
            return None
        return {
            "id": getattr(p, "id", None),
            "name": getattr(p, "name", None),
            "department": getattr(p, "department_id", None),
        }

    def validate(self, attrs):
        # Sanitize settings payload and optionally log unknown keys
        settings_payload = attrs.get("settings")
        if settings_payload is not None:
            cleaned, unknown = sanitize_settings(settings_payload)
            if django_settings.DEBUG and unknown:
                try:
                    logger.warning("Dropped unknown settings keys: %s", sorted(list(unknown)))
                except Exception:
                    pass
            attrs["settings"] = cleaned
        return super().validate(attrs)

    def update(self, instance: UserProfile, validated_data):
        # Only settings are expected to be updated via this serializer for now
        if "settings" in validated_data:
            instance.settings = validated_data.get("settings", {})
        instance.save(update_fields=["settings", "updated_at"])
        return instance
