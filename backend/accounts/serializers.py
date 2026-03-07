import logging
from typing import Dict, Tuple

from django.conf import settings as django_settings
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from .models import UserProfile, AdminAuditLog
from core.models import InAppNotification, NotificationPreference, WebPushSubscription
from core.notification_matrix import (
    default_notification_channel_matrix,
    default_user_notification_channel_matrix,
    legacy_user_matrix_from_preference,
    normalize_notification_channel_matrix,
)

logger = logging.getLogger(__name__)


ALLOWED_THEME_VALUES = ("light", "dark", "system")
ALLOWED_SETTING_KEYS = {
    "defaultDepartmentId",
    "includeChildren",
    "theme",
    "colorScheme",
    "schemaVersion",
    "dashboardLayouts",
}

ALLOWED_DASHBOARD_SURFACES = {"team-dashboard", "my-work-dashboard"}
MAX_DASHBOARD_WIDGETS = 80
CANONICAL_DASHBOARD_COLS = 10
DASHBOARD_BREAKPOINT_COLS = (2, 4, 6, 8, 10)
MAX_DASHBOARD_WIDGET_WIDTH_UNITS = CANONICAL_DASHBOARD_COLS
MAX_DASHBOARD_WIDGET_HEIGHT_UNITS = 60

ALLOWED_DASHBOARD_CARD_IDS = {
    "team-dashboard": {
        "upcoming-deliverables",
        "avg-utilization",
        "active-projects",
        "assigned-hours-client",
        "recent-assignments",
        "utilization-distribution",
        "overallocated-team-members",
        "role-capacity-summary",
        "availability-alerting",
    },
    "my-work-dashboard": {
        "my-projects",
        "my-deliverables",
        "upcoming-pre-deliverables",
        "lead-project-assignments",
        "my-calendar",
        "my-schedule",
    },
}


def coerce_dashboard_widget_width(raw_value) -> int:
    if isinstance(raw_value, (int, float)):
        value = int(raw_value)
        if 1 <= value <= MAX_DASHBOARD_WIDGET_WIDTH_UNITS:
            return value

    normalized = str(raw_value or "").strip().lower()
    if not normalized:
        return 2

    if normalized in {"1", "sm", "small"}:
        return 1
    if normalized in {"2", "md", "medium"}:
        return 2
    if normalized in {"3", "lg", "large"}:
        return 3
    if normalized in {"4", "xl", "xlarge", "x-large"}:
        return 4

    try:
        numeric = int(float(normalized))
    except (TypeError, ValueError):
        return 2
    if numeric < 1:
        return 2
    return min(numeric, MAX_DASHBOARD_WIDGET_WIDTH_UNITS)


def coerce_dashboard_widget_height(raw_value) -> int:
    if isinstance(raw_value, (int, float)):
        value = int(raw_value)
        if value >= 1:
            return min(value, MAX_DASHBOARD_WIDGET_HEIGHT_UNITS)

    normalized = str(raw_value or "").strip().lower()
    if not normalized:
        return 2

    if normalized in {"sm", "small"}:
        return 1
    if normalized in {"md", "medium"}:
        return 2
    if normalized in {"lg", "large"}:
        return 3
    if normalized in {"xl", "xlarge", "x-large"}:
        return 4

    try:
        numeric = int(float(normalized))
    except (TypeError, ValueError):
        return 2

    if numeric < 1:
        return 2
    return min(numeric, MAX_DASHBOARD_WIDGET_HEIGHT_UNITS)


def coerce_dashboard_coordinate(raw_value):
    if isinstance(raw_value, bool):
        return None
    if isinstance(raw_value, (int, float)):
        return max(0, int(raw_value))
    normalized = str(raw_value or "").strip()
    if not normalized:
        return None
    try:
        return max(0, int(float(normalized)))
    except (TypeError, ValueError):
        return None


def sanitize_dashboard_layouts(payload: Dict) -> Dict | None:
    if not isinstance(payload, dict):
        return None

    version_raw = payload.get("version", 0)
    try:
        version = int(version_raw)
    except (TypeError, ValueError):
        version = 0
    if version != 4:
        return {"version": 4, "surfaces": {}}

    surfaces_raw = payload.get("surfaces")
    if not isinstance(surfaces_raw, dict):
        return {"version": 3, "surfaces": {}}

    surfaces: Dict = {}
    for surface_id in ALLOWED_DASHBOARD_SURFACES:
        surface_raw = surfaces_raw.get(surface_id)
        if not isinstance(surface_raw, dict):
            continue

        allowed_card_ids = ALLOWED_DASHBOARD_CARD_IDS.get(surface_id, set())

        def sanitize_widget_list(raw_widgets, max_cols: int):
            widgets_local = []
            seen_widget_ids_local = set()
            seen_card_ids_local = set()
            if not isinstance(raw_widgets, list):
                return widgets_local
            for raw_widget in raw_widgets[:MAX_DASHBOARD_WIDGETS]:
                if not isinstance(raw_widget, dict):
                    continue

                card_id = str(raw_widget.get("cardId") or "").strip()
                if not card_id or card_id not in allowed_card_ids or card_id in seen_card_ids_local:
                    continue

                widget_id = str(raw_widget.get("i") or card_id).strip()[:120]
                if not widget_id or widget_id in seen_widget_ids_local:
                    continue

                x_raw = coerce_dashboard_coordinate(raw_widget.get("x"))
                y_raw = coerce_dashboard_coordinate(raw_widget.get("y"))
                if x_raw is None or y_raw is None:
                    continue

                w = min(max_cols, coerce_dashboard_widget_width(raw_widget.get("w")))
                h = coerce_dashboard_widget_height(raw_widget.get("h"))
                x = max(0, min(max_cols - w, x_raw))

                widgets_local.append({
                    "i": widget_id,
                    "cardId": card_id[:120],
                    "x": x,
                    "y": y_raw,
                    "w": w,
                    "h": h,
                })
                seen_widget_ids_local.add(widget_id)
                seen_card_ids_local.add(card_id)
            return widgets_local

        widgets = sanitize_widget_list(surface_raw.get("widgets"), CANONICAL_DASHBOARD_COLS)
        widgets_by_cols = {}
        widgets_by_cols_raw = surface_raw.get("widgetsByCols")
        if isinstance(widgets_by_cols_raw, dict):
            for cols in DASHBOARD_BREAKPOINT_COLS:
                raw_for_cols = widgets_by_cols_raw.get(str(cols))
                sanitized_for_cols = sanitize_widget_list(raw_for_cols, cols)
                if sanitized_for_cols:
                    widgets_by_cols[str(cols)] = sanitized_for_cols

        updated_at = str(surface_raw.get("updatedAt") or "").strip()
        if not updated_at:
            updated_at = None

        surface_payload = {"widgets": widgets}
        if widgets_by_cols:
            surface_payload["widgetsByCols"] = widgets_by_cols
        if updated_at:
            surface_payload["updatedAt"] = updated_at[:128]
        surfaces[surface_id] = surface_payload

    return {"version": 4, "surfaces": surfaces}


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
            except (TypeError, ValueError):  # nosec B110
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
        except Exception:  # nosec B110
            pass

    # schemaVersion: number
    if "schemaVersion" in payload:
        try:
            cleaned["schemaVersion"] = int(payload.get("schemaVersion"))
        except (TypeError, ValueError):  # nosec B110
            pass

    # dashboardLayouts: validated object for per-surface card layout preferences
    if "dashboardLayouts" in payload:
        dashboard_layouts = sanitize_dashboard_layouts(payload.get("dashboardLayouts"))
        if dashboard_layouts is not None:
            cleaned["dashboardLayouts"] = dashboard_layouts

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
                except Exception:  # nosec B110
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
    accountSetup = serializers.BooleanField()


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
    webPushEnabled = serializers.BooleanField(required=False, default=False)
    pushPreDeliverableReminders = serializers.BooleanField(required=False, default=False)
    pushDailyDigest = serializers.BooleanField(required=False, default=False)
    pushAssignmentChanges = serializers.BooleanField(required=False, default=False)
    pushDeliverableDateChanges = serializers.BooleanField(required=False, default=False)
    pushRateLimitEnabled = serializers.BooleanField(required=False, default=True)
    pushWeekendMute = serializers.BooleanField(required=False, default=True)
    pushQuietHoursEnabled = serializers.BooleanField(required=False, default=True)
    pushQuietHoursStart = serializers.IntegerField(min_value=0, max_value=23, required=False, default=17)
    pushQuietHoursEnd = serializers.IntegerField(min_value=0, max_value=23, required=False, default=5)
    pushDigestWindowEnabled = serializers.BooleanField(required=False, default=True)
    pushDigestWindow = serializers.ChoiceField(
        choices=['instant', 'morning', 'evening'],
        required=False,
        default='instant',
    )
    pushTimezone = serializers.CharField(required=False, allow_blank=True, max_length=64, default='')
    pushSnoozeEnabled = serializers.BooleanField(required=False, default=True)
    pushSnoozeUntil = serializers.DateTimeField(required=False, allow_null=True)
    pushActionsEnabled = serializers.BooleanField(required=False, default=True)
    pushDeepLinksEnabled = serializers.BooleanField(required=False, default=True)
    pushSubscriptionCleanupEnabled = serializers.BooleanField(required=False, default=True)
    notificationChannelMatrix = serializers.JSONField(required=False)
    effectiveChannelAvailability = serializers.JSONField(required=False)

    @staticmethod
    def from_model(
        p: NotificationPreference,
        *,
        effective_channel_availability: dict | None = None,
    ):
        matrix = normalize_notification_channel_matrix(
            getattr(p, 'notification_channel_matrix', None),
            fallback=legacy_user_matrix_from_preference(p),
        )
        effective = (
            normalize_notification_channel_matrix(
                effective_channel_availability,
                fallback=default_notification_channel_matrix(),
            )
            if isinstance(effective_channel_availability, dict)
            else default_notification_channel_matrix()
        )
        return {
            'emailPreDeliverableReminders': p.email_pre_deliverable_reminders,
            'reminderDaysBefore': p.reminder_days_before,
            'dailyDigest': p.daily_digest,
            'webPushEnabled': p.web_push_enabled,
            'pushPreDeliverableReminders': p.push_pre_deliverable_reminders,
            'pushDailyDigest': p.push_daily_digest,
            'pushAssignmentChanges': p.push_assignment_changes,
            'pushDeliverableDateChanges': p.push_deliverable_date_changes,
            'pushRateLimitEnabled': p.push_rate_limit_enabled,
            'pushWeekendMute': p.push_weekend_mute,
            'pushQuietHoursEnabled': p.push_quiet_hours_enabled,
            'pushQuietHoursStart': p.push_quiet_hours_start,
            'pushQuietHoursEnd': p.push_quiet_hours_end,
            'pushDigestWindowEnabled': p.push_digest_window_enabled,
            'pushDigestWindow': p.push_digest_window,
            'pushTimezone': p.push_timezone,
            'pushSnoozeEnabled': p.push_snooze_enabled,
            'pushSnoozeUntil': p.push_snooze_until,
            'pushActionsEnabled': p.push_actions_enabled,
            'pushDeepLinksEnabled': p.push_deep_links_enabled,
            'pushSubscriptionCleanupEnabled': p.push_subscription_cleanup_enabled,
            'notificationChannelMatrix': matrix,
            'effectiveChannelAvailability': effective,
        }

    def validate_notificationChannelMatrix(self, value):
        return normalize_notification_channel_matrix(
            value,
            fallback=default_user_notification_channel_matrix(),
        )


class PushActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['acknowledge', 'mute_project_24h'])
    projectId = serializers.IntegerField(required=False, allow_null=True)


class PushSubscriptionUpsertSerializer(serializers.Serializer):
    endpoint = serializers.CharField()
    expirationTime = serializers.IntegerField(required=False, allow_null=True)
    keys = serializers.DictField(child=serializers.CharField(), required=True)

    def validate(self, attrs):
        keys = attrs.get('keys') or {}
        if not keys.get('p256dh') or not keys.get('auth'):
            raise serializers.ValidationError({'keys': 'keys.p256dh and keys.auth are required'})
        return attrs


class PushSubscriptionItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    endpoint = serializers.CharField()
    isActive = serializers.BooleanField()
    createdAt = serializers.DateTimeField()
    updatedAt = serializers.DateTimeField()
    lastSeenAt = serializers.DateTimeField()
    lastSuccessAt = serializers.DateTimeField(allow_null=True)
    lastError = serializers.CharField()

    @staticmethod
    def from_model(subscription: WebPushSubscription) -> dict:
        return {
            'id': subscription.id,
            'endpoint': subscription.endpoint,
            'isActive': subscription.is_active,
            'createdAt': subscription.created_at,
            'updatedAt': subscription.updated_at,
            'lastSeenAt': subscription.last_seen_at,
            'lastSuccessAt': subscription.last_success_at,
            'lastError': subscription.last_error,
        }


class InAppNotificationItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    eventKey = serializers.CharField()
    title = serializers.CharField()
    body = serializers.CharField()
    url = serializers.CharField()
    payload = serializers.JSONField(required=False)
    projectId = serializers.IntegerField(allow_null=True, required=False)
    deliveryReason = serializers.CharField(required=False, allow_blank=True)
    isSaved = serializers.BooleanField()
    snoozedUntil = serializers.DateTimeField(allow_null=True)
    readAt = serializers.DateTimeField(allow_null=True)
    clearedAt = serializers.DateTimeField(allow_null=True)
    expiresAt = serializers.DateTimeField()
    createdAt = serializers.DateTimeField()

    @staticmethod
    def from_model(row: InAppNotification) -> dict:
        return {
            'id': row.id,
            'eventKey': row.event_key,
            'title': row.title,
            'body': row.body,
            'url': row.url,
            'payload': row.payload or {},
            'projectId': row.project_id,
            'deliveryReason': row.delivery_reason or '',
            'isSaved': bool(getattr(row, 'is_saved', False)),
            'snoozedUntil': row.snoozed_until,
            'readAt': row.read_at,
            'clearedAt': row.cleared_at,
            'expiresAt': row.expires_at,
            'createdAt': row.created_at,
        }


class InAppNotificationsListSerializer(serializers.Serializer):
    items = InAppNotificationItemSerializer(many=True)
    unreadCount = serializers.IntegerField()
    nextCursor = serializers.IntegerField(allow_null=True)


class InAppMarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        required=True,
    )
    opened = serializers.BooleanField(required=False, default=False)


class InAppClearSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        required=True,
    )


class InAppSaveSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        required=True,
    )
    saved = serializers.BooleanField(required=True)


class InAppSnoozeSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        required=True,
    )
    until = serializers.DateTimeField(required=True)


class InAppClearAllSerializer(serializers.Serializer):
    eventKey = serializers.CharField(required=False, allow_blank=True)
    projectId = serializers.IntegerField(required=False, allow_null=True)
    includeRead = serializers.BooleanField(required=False, default=True)


class NotificationProjectMuteItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    projectId = serializers.IntegerField()
    projectName = serializers.CharField(allow_blank=True)
    mobilePushMutedUntil = serializers.DateTimeField(allow_null=True)
    emailMutedUntil = serializers.DateTimeField(allow_null=True)
    inBrowserMutedUntil = serializers.DateTimeField(allow_null=True)
    updatedAt = serializers.DateTimeField()
