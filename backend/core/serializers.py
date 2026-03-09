"""
Auto-mapped serializers that prevent naming mismatches.
NEVER write manual field mappings - always use these base classes.
"""

from rest_framework import serializers
from .fields import PERSON_FIELDS, PROJECT_FIELDS, ASSIGNMENT_FIELDS, DEPARTMENT_FIELDS
from .notification_matrix import (
    catalog_payload,
    global_legacy_push_fields_from_matrix,
    legacy_global_matrix_from_settings,
    normalize_notification_channel_matrix,
)
from .models import (
    UtilizationScheme,
    ProjectRole,
    CalendarFeedSettings,
    QATaskSettings,
    NetworkGraphSettings,
    FeatureToggleSettings,
    TaskProgressColorSettings,
    WebPushGlobalSettings,
    NotificationTemplate,
    _normalize_task_progress_ranges,
)
from .project_visibility import (
    VISIBILITY_SCOPE_CATALOG,
    VISIBILITY_SCOPE_KEYS,
    normalize_visibility_config,
)
from projects.models import Project


class PreDeliverableGlobalSettingsItemSerializer(serializers.Serializer):
    typeId = serializers.IntegerField()
    typeName = serializers.CharField()
    defaultDaysBefore = serializers.IntegerField()
    isEnabledByDefault = serializers.BooleanField()
    sortOrder = serializers.IntegerField(required=False)
    isActive = serializers.BooleanField(required=False)


class PreDeliverableGlobalSettingsUpdateSerializer(serializers.Serializer):
    typeId = serializers.IntegerField()
    defaultDaysBefore = serializers.IntegerField(min_value=0)
    isEnabledByDefault = serializers.BooleanField()

class AutoMappedSerializer(serializers.ModelSerializer):
    """Base class that auto-maps field names from registry"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        
        # Get field registry from Meta
        field_registry = getattr(self.Meta, 'field_registry', {})
        
        # Auto-generate field mappings
        for field_name, field_def in field_registry.items():
            if hasattr(self.Meta.model, field_def.python_name):
                # Create serializer field with correct source mapping
                field_class = self._get_field_class(field_def)
                self.fields[field_def.api_name] = field_class
    
    def _get_field_class(self, field_def):
        """Get appropriate serializer field class"""
        field_kwargs = {'source': field_def.python_name}
        
        # Set required based on field definition
        if field_def.required:
            field_kwargs['required'] = True
        else:
            field_kwargs['required'] = False
            field_kwargs['allow_blank'] = True
        
        # Handle null fields
        if not field_def.required:
            field_kwargs['allow_null'] = True
        
        # Map field types to serializer fields
        field_mapping = {
            'string': serializers.CharField,
            'integer': serializers.IntegerField,
            'boolean': serializers.BooleanField,
            'date': serializers.DateField,
            'text': serializers.CharField,
        }
        
        field_class = field_mapping[field_def.field_type]
        return field_class(**field_kwargs)


class UtilizationSchemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = UtilizationScheme
        fields = [
            'mode',
            'blue_min', 'blue_max',
            'green_min', 'green_max',
            'orange_min', 'orange_max',
            'red_min',
            'full_capacity_hours',
            'zero_is_blank',
            'version', 'updated_at',
        ]
        read_only_fields = ['version', 'updated_at']

    def validate(self, attrs):
        # Build a temp instance to run model.clean() rules
        inst = (self.instance or UtilizationScheme())
        for k, v in attrs.items():
            setattr(inst, k, v)
        # Reconstruct contiguous relations if partial
        try:
            inst.clean()
        except Exception as e:
            raise serializers.ValidationError({'detail': str(e)})
        return attrs


class ProjectRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectRole
        fields = ['id', 'name', 'created_at', 'updated_at']


class CalendarFeedSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarFeedSettings
        fields = ['deliverables_token', 'updated_at']


class DeliverablePhaseDefinitionSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    descriptionTokens = serializers.ListField(child=serializers.CharField(), required=False)
    rangeMin = serializers.IntegerField(required=False, allow_null=True)
    rangeMax = serializers.IntegerField(required=False, allow_null=True)
    sortOrder = serializers.IntegerField(required=False)


class DeliverablePhaseMappingSettingsSerializer(serializers.Serializer):
    useDescriptionMatch = serializers.BooleanField()
    phases = DeliverablePhaseDefinitionSerializer(many=True)
    updatedAt = serializers.DateTimeField(read_only=True)

    def validate(self, attrs):
        phases = attrs.get('phases') or []
        if not phases:
            raise serializers.ValidationError({'phases': 'At least one phase is required'})

        seen_keys = set()
        ranges = []
        for idx, phase in enumerate(phases):
            key = str(phase.get('key') or '').strip().lower()
            label = str(phase.get('label') or '').strip()
            if not key:
                raise serializers.ValidationError({'phases': f'Phase at position {idx + 1} must include a key'})
            if not label:
                raise serializers.ValidationError({'phases': f'Phase {key} must include a label'})
            if key in seen_keys:
                raise serializers.ValidationError({'phases': f'Duplicate phase key: {key}'})
            seen_keys.add(key)

            rmin = phase.get('rangeMin', None)
            rmax = phase.get('rangeMax', None)
            if rmin is None and rmax is None:
                continue
            if rmin is None or rmax is None:
                raise serializers.ValidationError({'phases': f'Phase {key} must include both rangeMin and rangeMax'})
            if rmin < 0 or rmax > 100:
                raise serializers.ValidationError({'phases': f'Phase {key} range must be between 0 and 100'})
            if rmin > rmax:
                raise serializers.ValidationError({'phases': f'Phase {key} rangeMin must be <= rangeMax'})
            ranges.append((rmin, rmax, key))

        if not ranges:
            raise serializers.ValidationError({'phases': 'At least one phase must include a percentage range'})

        ranges.sort(key=lambda r: r[0])
        # Require full coverage 0-100 with no overlaps and no gaps
        expected_min = 0
        for rmin, rmax, key in ranges:
            if rmin != expected_min:
                raise serializers.ValidationError({'phases': f'Percentage ranges must cover 0-100 with no gaps (expected {expected_min} for {key})'})
            expected_min = rmax + 1
        if expected_min != 101:
            raise serializers.ValidationError({'phases': 'Percentage ranges must cover 0-100 with no gaps'})

        return attrs


class QATaskSettingsSerializer(serializers.ModelSerializer):
    defaultDaysBefore = serializers.IntegerField(source='default_days_before', min_value=0, max_value=365)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = QATaskSettings
        fields = ['defaultDaysBefore', 'updatedAt']


class WebPushGlobalSettingsSerializer(serializers.ModelSerializer):
    enabled = serializers.BooleanField()
    pushRateLimitEnabled = serializers.BooleanField(
        source='push_rate_limit_enabled',
        required=False,
    )
    pushRateLimitPerHour = serializers.IntegerField(
        source='push_rate_limit_per_hour',
        min_value=1,
        max_value=50,
        required=False,
    )
    pushWeekendMuteEnabled = serializers.BooleanField(
        source='push_weekend_mute_enabled',
        required=False,
    )
    pushQuietHoursEnabled = serializers.BooleanField(
        source='push_quiet_hours_enabled',
        required=False,
    )
    pushSnoozeEnabled = serializers.BooleanField(
        source='push_snooze_enabled',
        required=False,
    )
    pushDigestWindowEnabled = serializers.BooleanField(
        source='push_digest_window_enabled',
        required=False,
    )
    pushActionsEnabled = serializers.BooleanField(
        source='push_actions_enabled',
        required=False,
    )
    pushDeepLinksEnabled = serializers.BooleanField(
        source='push_deep_links_enabled',
        required=False,
    )
    pushSubscriptionHealthcheckEnabled = serializers.BooleanField(
        source='push_subscription_healthcheck_enabled',
        required=False,
    )
    pushPreDeliverableRemindersEnabled = serializers.BooleanField(
        source='push_pre_deliverable_reminders_enabled',
        required=False,
    )
    pushDailyDigestEnabled = serializers.BooleanField(
        source='push_daily_digest_enabled',
        required=False,
    )
    pushAssignmentChangesEnabled = serializers.BooleanField(
        source='push_assignment_changes_enabled',
        required=False,
    )
    pushDeliverableDateChangesEnabled = serializers.BooleanField(
        source='push_deliverable_date_changes_enabled',
        required=False,
    )
    pushDeliverableDateChangeScope = serializers.ChoiceField(
        source='push_deliverable_date_change_scope',
        choices=[choice[0] for choice in WebPushGlobalSettings.DELIVERABLE_SCOPE_CHOICES],
        required=False,
    )
    pushDeliverableDateChangeWithinTwoWeeksOnly = serializers.BooleanField(
        source='push_deliverable_date_change_within_two_weeks_only',
        required=False,
    )
    activeWebSuppressionEnabled = serializers.BooleanField(
        source='active_web_suppression_enabled',
        required=False,
    )
    activeWebWindowSeconds = serializers.IntegerField(
        source='active_web_window_seconds',
        min_value=30,
        max_value=3600,
        required=False,
    )
    inAppRetentionDays = serializers.IntegerField(
        source='in_app_retention_days',
        min_value=1,
        max_value=365,
        required=False,
    )
    savedInAppRetentionDays = serializers.IntegerField(
        source='saved_in_app_retention_days',
        min_value=7,
        max_value=3650,
        required=False,
    )
    notificationChannelMatrix = serializers.JSONField(
        source='notification_channel_matrix',
        required=False,
    )
    notificationEventCatalog = serializers.SerializerMethodField(read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    def get_notificationEventCatalog(self, obj):
        return catalog_payload()

    def validate_notificationChannelMatrix(self, value):
        return normalize_notification_channel_matrix(
            value,
            fallback=legacy_global_matrix_from_settings(self.instance),
        )

    def to_representation(self, instance):
        payload = super().to_representation(instance)
        payload['notificationChannelMatrix'] = normalize_notification_channel_matrix(
            payload.get('notificationChannelMatrix'),
            fallback=legacy_global_matrix_from_settings(instance),
        )
        return payload

    def update(self, instance, validated_data):
        matrix = validated_data.get('notification_channel_matrix')

        def _apply_legacy_push_overrides(target_matrix: dict) -> bool:
            changed = False
            if 'push_pre_deliverable_reminders_enabled' in validated_data:
                target_matrix['pred.reminder']['mobilePush'] = bool(
                    validated_data['push_pre_deliverable_reminders_enabled']
                )
                changed = True
            if 'push_daily_digest_enabled' in validated_data:
                target_matrix['pred.digest']['mobilePush'] = bool(validated_data['push_daily_digest_enabled'])
                changed = True
            if 'push_deliverable_date_changes_enabled' in validated_data:
                target_matrix['deliverable.date_changed']['mobilePush'] = bool(
                    validated_data['push_deliverable_date_changes_enabled']
                )
                changed = True
            if 'push_assignment_changes_enabled' in validated_data:
                assignment_enabled = bool(validated_data['push_assignment_changes_enabled'])
                for event_key in (
                    'assignment.created',
                    'assignment.removed',
                    'assignment.bulk_updated',
                ):
                    target_matrix[event_key]['mobilePush'] = assignment_enabled
                changed = True
            return changed

        if isinstance(matrix, dict):
            normalized_matrix = normalize_notification_channel_matrix(
                matrix,
                fallback=legacy_global_matrix_from_settings(instance),
            )
            _apply_legacy_push_overrides(normalized_matrix)
            validated_data['notification_channel_matrix'] = normalized_matrix

            legacy_fields = global_legacy_push_fields_from_matrix(normalized_matrix)
            for field, field_value in legacy_fields.items():
                validated_data.setdefault(field, field_value)
        else:
            current_matrix = normalize_notification_channel_matrix(
                getattr(instance, 'notification_channel_matrix', None),
                fallback=legacy_global_matrix_from_settings(instance),
            )
            if _apply_legacy_push_overrides(current_matrix):
                validated_data['notification_channel_matrix'] = current_matrix

        return super().update(instance, validated_data)

    class Meta:
        model = WebPushGlobalSettings
        fields = [
            'enabled',
            'pushRateLimitEnabled',
            'pushRateLimitPerHour',
            'pushWeekendMuteEnabled',
            'pushQuietHoursEnabled',
            'pushSnoozeEnabled',
            'pushDigestWindowEnabled',
            'pushActionsEnabled',
            'pushDeepLinksEnabled',
            'pushSubscriptionHealthcheckEnabled',
            'pushPreDeliverableRemindersEnabled',
            'pushDailyDigestEnabled',
            'pushAssignmentChangesEnabled',
            'pushDeliverableDateChangesEnabled',
            'pushDeliverableDateChangeScope',
            'pushDeliverableDateChangeWithinTwoWeeksOnly',
            'activeWebSuppressionEnabled',
            'activeWebWindowSeconds',
            'inAppRetentionDays',
            'savedInAppRetentionDays',
            'notificationChannelMatrix',
            'notificationEventCatalog',
            'updatedAt',
        ]


class WebPushVapidKeysStatusSerializer(serializers.Serializer):
    configured = serializers.BooleanField()
    source = serializers.ChoiceField(choices=['database', 'environment', 'none'])
    subject = serializers.CharField(allow_null=True, required=False)
    publicKeyMasked = serializers.CharField(allow_null=True, required=False)
    privateKeyMasked = serializers.CharField(allow_null=True, required=False)
    updatedAt = serializers.DateTimeField(allow_null=True, required=False)


class NotificationTemplateSerializer(serializers.ModelSerializer):
    eventKey = serializers.CharField(source='event_key')
    pushTitleTemplate = serializers.CharField(source='push_title_template', allow_blank=True, required=False)
    pushBodyTemplate = serializers.CharField(source='push_body_template', allow_blank=True, required=False)
    emailSubjectTemplate = serializers.CharField(source='email_subject_template', allow_blank=True, required=False)
    emailBodyTemplate = serializers.CharField(source='email_body_template', allow_blank=True, required=False)
    inAppTitleTemplate = serializers.CharField(source='in_app_title_template', allow_blank=True, required=False)
    inAppBodyTemplate = serializers.CharField(source='in_app_body_template', allow_blank=True, required=False)
    pushTtlSeconds = serializers.IntegerField(source='push_ttl_seconds', min_value=60, max_value=2419200, required=False)
    pushUrgency = serializers.ChoiceField(
        source='push_urgency',
        choices=[choice[0] for choice in NotificationTemplate.PUSH_URGENCY_CHOICES],
        required=False,
    )
    pushTopicMode = serializers.ChoiceField(
        source='push_topic_mode',
        choices=[choice[0] for choice in NotificationTemplate.PUSH_TOPIC_MODE_CHOICES],
        required=False,
    )
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = NotificationTemplate
        fields = [
            'eventKey',
            'pushTitleTemplate',
            'pushBodyTemplate',
            'emailSubjectTemplate',
            'emailBodyTemplate',
            'inAppTitleTemplate',
            'inAppBodyTemplate',
            'pushTtlSeconds',
            'pushUrgency',
            'pushTopicMode',
            'updatedAt',
        ]


class WebPushVapidKeysGenerateSerializer(serializers.Serializer):
    subject = serializers.CharField(required=False, allow_blank=False, max_length=255)

    def validate_subject(self, value: str):
        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError('subject cannot be blank')
        lower = val.lower()
        if lower.startswith('mailto:') or lower.startswith('https://') or lower.startswith('http://'):
            return val
        raise serializers.ValidationError("subject must start with 'mailto:', 'https://', or 'http://'")


class NetworkGraphSettingsSerializer(serializers.ModelSerializer):
    defaultWindowMonths = serializers.IntegerField(source='default_window_months', min_value=1, max_value=120)
    coworkerProjectWeight = serializers.FloatField(source='coworker_project_weight')
    coworkerWeekWeight = serializers.FloatField(source='coworker_week_weight')
    coworkerMinScore = serializers.FloatField(source='coworker_min_score')
    clientProjectWeight = serializers.FloatField(source='client_project_weight')
    clientWeekWeight = serializers.FloatField(source='client_week_weight')
    clientMinScore = serializers.FloatField(source='client_min_score')
    includeInactiveDefault = serializers.BooleanField(source='include_inactive_default')
    maxEdgesDefault = serializers.IntegerField(source='max_edges_default', min_value=100, max_value=10000)
    snapshotSchedulerEnabled = serializers.BooleanField(source='snapshot_scheduler_enabled')
    snapshotSchedulerDay = serializers.IntegerField(source='snapshot_scheduler_day', min_value=0, max_value=6)
    snapshotSchedulerHour = serializers.IntegerField(source='snapshot_scheduler_hour', min_value=0, max_value=23)
    snapshotSchedulerMinute = serializers.IntegerField(source='snapshot_scheduler_minute', min_value=0, max_value=59)
    snapshotSchedulerTimezone = serializers.CharField(source='snapshot_scheduler_timezone')
    omittedProjectIds = serializers.ListField(
        source='omitted_project_ids',
        child=serializers.IntegerField(min_value=1),
        required=False,
    )
    omittedProjects = serializers.SerializerMethodField(read_only=True)
    lastSnapshotWeekStart = serializers.DateField(source='last_snapshot_week_start', allow_null=True, required=False)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    def validate_omitted_project_ids(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('omittedProjectIds must be a list of project IDs.')
        cleaned: list[int] = []
        seen: set[int] = set()
        for raw in value:
            try:
                project_id = int(raw)
            except Exception:
                continue
            if project_id <= 0 or project_id in seen:
                continue
            seen.add(project_id)
            cleaned.append(project_id)
        if len(cleaned) > 500:
            raise serializers.ValidationError('A maximum of 500 omitted projects is allowed.')
        existing_ids = set(Project.objects.filter(id__in=cleaned).values_list('id', flat=True))
        missing = [pid for pid in cleaned if pid not in existing_ids]
        if missing:
            raise serializers.ValidationError(f'Unknown project IDs: {missing[:10]}')
        return cleaned

    def get_omittedProjects(self, obj):
        ids = [int(v) for v in (getattr(obj, 'omitted_project_ids', None) or []) if str(v).isdigit()]
        if not ids:
            return []
        rows = Project.objects.filter(id__in=ids).values('id', 'name')
        name_by_id = {int(r['id']): (r.get('name') or f"Project {r['id']}") for r in rows}
        payload: list[dict[str, object]] = []
        for pid in ids:
            if pid in name_by_id:
                payload.append({'id': pid, 'name': name_by_id[pid]})
        return payload

    class Meta:
        model = NetworkGraphSettings
        fields = [
            'defaultWindowMonths',
            'coworkerProjectWeight',
            'coworkerWeekWeight',
            'coworkerMinScore',
            'clientProjectWeight',
            'clientWeekWeight',
            'clientMinScore',
            'includeInactiveDefault',
            'maxEdgesDefault',
            'snapshotSchedulerEnabled',
            'snapshotSchedulerDay',
            'snapshotSchedulerHour',
            'snapshotSchedulerMinute',
            'snapshotSchedulerTimezone',
            'omittedProjectIds',
            'omittedProjects',
            'lastSnapshotWeekStart',
            'updatedAt',
        ]


class ProjectVisibilitySettingsSerializer(serializers.Serializer):
    scopes = serializers.SerializerMethodField()
    config = serializers.SerializerMethodField()
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    updatedBy = serializers.SerializerMethodField()

    def get_scopes(self, _obj):
        return [dict(item) for item in VISIBILITY_SCOPE_CATALOG]

    def get_config(self, obj):
        return normalize_visibility_config(getattr(obj, 'config_json', None))

    def get_updatedBy(self, obj):
        user = getattr(obj, 'updated_by', None)
        if not user:
            return None
        return {
            'id': int(user.id),
            'username': str(getattr(user, 'username', '') or ''),
        }


class ProjectVisibilitySettingsUpdateSerializer(serializers.Serializer):
    config = serializers.DictField()

    MAX_KEYWORDS_PER_SCOPE = 100
    MAX_KEYWORD_LENGTH = 80

    def _validate_keywords(self, raw, *, field_name: str):
        if raw in (None, ''):
            return []
        if not isinstance(raw, (list, tuple)):
            raise serializers.ValidationError(f'{field_name} must be a list of keywords.')
        out: list[str] = []
        seen: set[str] = set()
        for item in raw:
            token = ' '.join(str(item or '').strip().lower().split())
            if not token:
                continue
            if len(token) > self.MAX_KEYWORD_LENGTH:
                raise serializers.ValidationError(
                    f'Keywords in {field_name} must be {self.MAX_KEYWORD_LENGTH} characters or less.'
                )
            if token in seen:
                continue
            seen.add(token)
            out.append(token)
            if len(out) > self.MAX_KEYWORDS_PER_SCOPE:
                raise serializers.ValidationError(
                    f'{field_name} supports at most {self.MAX_KEYWORDS_PER_SCOPE} keywords per scope.'
                )
        return out

    def validate_config(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('config must be an object keyed by scope.')

        normalized = normalize_visibility_config({})
        unknown_scope_keys = [key for key in value.keys() if key not in VISIBILITY_SCOPE_KEYS]
        if unknown_scope_keys:
            raise serializers.ValidationError(f'Unknown scope keys: {unknown_scope_keys[:10]}')

        for scope_key in VISIBILITY_SCOPE_KEYS:
            scope_payload = value.get(scope_key)
            if scope_payload is None:
                continue
            if not isinstance(scope_payload, dict):
                raise serializers.ValidationError(f'{scope_key} must be an object.')
            project_keywords = self._validate_keywords(
                scope_payload.get('projectKeywords', scope_payload.get('project_keywords', [])),
                field_name=f'{scope_key}.projectKeywords',
            )
            client_keywords = self._validate_keywords(
                scope_payload.get('clientKeywords', scope_payload.get('client_keywords', [])),
                field_name=f'{scope_key}.clientKeywords',
            )
            normalized[scope_key] = {
                'projectKeywords': project_keywords,
                'clientKeywords': client_keywords,
            }
        return normalized


class TaskProgressColorRangeSerializer(serializers.Serializer):
    minPercent = serializers.IntegerField(min_value=0, max_value=100)
    maxPercent = serializers.IntegerField(min_value=0, max_value=100)
    colorHex = serializers.RegexField(regex=r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$')
    label = serializers.CharField(required=False, allow_blank=True)


class TaskProgressColorSettingsSerializer(serializers.ModelSerializer):
    ranges = TaskProgressColorRangeSerializer(many=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = TaskProgressColorSettings
        fields = ['ranges', 'updatedAt']

    def validate_ranges(self, value):
        # Reuse model-level normalization and full coverage checks
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            return _normalize_task_progress_ranges(value)
        except DjangoValidationError as exc:
            if hasattr(exc, 'message_dict') and exc.message_dict.get('ranges'):
                raise serializers.ValidationError(exc.message_dict['ranges'])
            raise serializers.ValidationError(str(exc))


class FeatureToggleSettingsSerializer(serializers.ModelSerializer):
    reportingGroupsEnabled = serializers.BooleanField(source='reporting_groups_enabled')
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = FeatureToggleSettings
        fields = ['reportingGroupsEnabled', 'updatedAt']
