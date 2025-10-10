import logging
from typing import Dict, Tuple

from django.conf import settings as django_settings
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from .models import UserProfile, AdminAuditLog
from core.models import NotificationPreference

logger = logging.getLogger(__name__)


ALLOWED_THEME_VALUES = ("light", "dark", "system")
ALLOWED_SETTING_KEYS = {
    "defaultDepartmentId",
    "includeChildren",
    "theme",
    "colorScheme",
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

    # colorScheme: string (pass-through)
    if "colorScheme" in payload:
        try:
            value = str(payload.get("colorScheme") or "").strip()
            if value:
                cleaned["colorScheme"] = value
        except Exception:
            pass

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

    @extend_schema_field(serializers.DictField())
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

    @extend_schema_field(serializers.DictField(allow_null=True))
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


class AdminAuditLogSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()
    targetUser = serializers.SerializerMethodField()

    class Meta:
        model = AdminAuditLog
        fields = ("id", "action", "detail", "created_at", "actor", "targetUser")
        read_only_fields = fields

    def _user_summary(self, u):
        if not u:
            return None
        return {
            "id": getattr(u, 'id', None),
            "username": getattr(u, 'username', None),
            "email": getattr(u, 'email', None),
        }

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_actor(self, obj: AdminAuditLog):
        return self._user_summary(getattr(obj, 'actor', None))

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_targetUser(self, obj: AdminAuditLog):
        return self._user_summary(getattr(obj, 'target_user', None))


# --- Request/Response serializers for Accounts API (for OpenAPI) ---

class UserSettingsPatchSerializer(serializers.Serializer):
    settings = serializers.DictField()


class LinkPersonRequestSerializer(serializers.Serializer):
    person_id = serializers.IntegerField(allow_null=True, required=False)


class ChangePasswordRequestSerializer(serializers.Serializer):
    currentPassword = serializers.CharField()
    newPassword = serializers.CharField()


class CreateUserRequestSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.CharField(allow_blank=True, required=False)
    password = serializers.CharField()
    personId = serializers.IntegerField(allow_null=True, required=False)
    role = serializers.ChoiceField(choices=[('admin','admin'), ('manager','manager'), ('user','user')], required=False)


class SetPasswordRequestSerializer(serializers.Serializer):
    userId = serializers.IntegerField()
    newPassword = serializers.CharField()


class UserListPersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class UserListItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.CharField(allow_blank=True, required=False)
    is_staff = serializers.BooleanField()
    is_superuser = serializers.BooleanField()
    groups = serializers.ListField(child=serializers.CharField())
    role = serializers.CharField()
    person = UserListPersonSerializer(allow_null=True, required=False)


class SetUserRoleRequestSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[('admin','admin'), ('manager','manager'), ('user','user')])


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    newPassword = serializers.CharField()


class InviteUserRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    username = serializers.CharField(required=False, allow_blank=True)
    personId = serializers.IntegerField(allow_null=True, required=False)
    role = serializers.ChoiceField(choices=[('admin','admin'), ('manager','manager'), ('user','user')], required=False)


class AdminLinkUserPersonRequestSerializer(serializers.Serializer):
    personId = serializers.IntegerField(allow_null=True, required=False)


class NotificationPreferencesSerializer(serializers.Serializer):
    emailPreDeliverableReminders = serializers.BooleanField()
    reminderDaysBefore = serializers.IntegerField(min_value=0)
    dailyDigest = serializers.BooleanField()

    @staticmethod
    def from_model(p: NotificationPreference):
        return {
            'emailPreDeliverableReminders': p.email_pre_deliverable_reminders,
            'reminderDaysBefore': p.reminder_days_before,
            'dailyDigest': p.daily_digest,
        }
