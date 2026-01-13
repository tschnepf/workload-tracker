from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from .models import IntegrationConnection, IntegrationProvider, IntegrationRule, IntegrationJob
from .registry import get_registry
from .rules import validate_rule_config
from .scheduler import schedule_next_run
from .oauth import connection_has_token


class ProviderSerializer(serializers.Serializer):
    key = serializers.CharField()
    displayName = serializers.CharField(source='display_name')
    schemaVersion = serializers.CharField(source='schema_version')
    metadata = serializers.JSONField(source='raw')


class IntegrationConnectionSerializer(serializers.ModelSerializer):
    providerKey = serializers.CharField(write_only=True)
    provider = serializers.CharField(source='provider.key', read_only=True)
    providerDisplayName = serializers.CharField(source='provider.display_name', read_only=True)
    hasToken = serializers.SerializerMethodField()
    utc_offset_minutes = serializers.IntegerField(required=False, min_value=-720, max_value=840)

    class Meta:
        model = IntegrationConnection
        fields = [
            'id',
            'provider',
            'providerDisplayName',
            'providerKey',
            'environment',
            'is_active',
            'needs_reauth',
            'is_disabled',
            'extra_headers',
            'utc_offset_minutes',
            'hasToken',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'provider', 'providerDisplayName', 'hasToken', 'created_at', 'updated_at']
        extra_kwargs = {
            'environment': {'required': True},
            'extra_headers': {'write_only': True, 'required': False},
            'utc_offset_minutes': {'required': False},
        }

    def validate_providerKey(self, value: str) -> str:
        registry = get_registry()
        if not registry.get_provider(value):
            raise serializers.ValidationError('Unknown provider')
        return value

    def get_hasToken(self, obj: IntegrationConnection) -> bool:
        return connection_has_token(obj)

    @staticmethod
    def _environment_label(value: str) -> str:
        for key, label in IntegrationConnection.ENVIRONMENT_CHOICES:
            if key == value:
                return label
        return value.title()

    def validate(self, attrs):  # type: ignore[override]
        attrs = super().validate(attrs)
        provider_key = attrs.get('providerKey') or (self.instance.provider.key if self.instance else None)
        environment = attrs.get('environment') or (self.instance.environment if self.instance else None)
        if provider_key and environment:
            conflict_qs = IntegrationConnection.objects.select_related('provider').filter(
                provider__key=provider_key,
                environment=environment,
            )
            if self.instance:
                conflict_qs = conflict_qs.exclude(pk=self.instance.pk)
            conflict = conflict_qs.first()
            if conflict:
                provider_label = conflict.provider.display_name or conflict.provider.key.upper()
                env_label = self._environment_label(environment)
                message = (
                    f"{provider_label} already has a {env_label} connection. "
                    'Select the existing connection to re-authorize tokens instead of creating a duplicate.'
                )
                raise serializers.ValidationError({'environment': message})
        return attrs

    def validate_utc_offset_minutes(self, value: int | None) -> int:
        if value is None:
            return 0
        if not isinstance(value, int):
            raise serializers.ValidationError('Offset must be an integer value in minutes.')
        if value < -720 or value > 840:
            raise serializers.ValidationError('UTC offset must be between -720 and 840 minutes.')
        return value

    def create(self, validated_data):
        provider_key = validated_data.pop('providerKey')
        provider, _ = IntegrationProvider.objects.get_or_create(
            key=provider_key,
            defaults={
                'display_name': provider_key.title(),
                'metadata': get_registry().get_provider(provider_key).raw if get_registry().get_provider(provider_key) else {},
                'schema_version': get_registry().get_provider(provider_key).schema_version if get_registry().get_provider(provider_key) else '1.0.0',
            },
        )
        validated_data['provider'] = provider
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('providerKey', None)
        return super().update(instance, validated_data)


class IntegrationJobSerializer(serializers.ModelSerializer):
    provider = serializers.CharField(source='provider.key', read_only=True)
    providerDisplayName = serializers.CharField(source='provider.display_name', read_only=True)
    connectionCompany = serializers.SerializerMethodField()
    connectionEnvironment = serializers.CharField(source='connection.environment', read_only=True)

    class Meta:
        model = IntegrationJob
        fields = [
            'id',
            'connection',
            'provider',
            'providerDisplayName',
            'connectionCompany',
            'connectionEnvironment',
            'object_key',
            'status',
            'payload',
            'logs',
            'metrics',
            'celery_id',
            'started_at',
            'finished_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField())
    def get_connectionCompany(self, obj) -> str:
        if obj.connection_id:
            return f"{obj.connection.provider.display_name} ({obj.connection.environment})"
        return ''


class IntegrationRuleSerializer(serializers.ModelSerializer):
    connection_id = serializers.PrimaryKeyRelatedField(
        queryset=IntegrationConnection.objects.select_related('provider'),
        source='connection',
        write_only=True,
    )

    class Meta:
        model = IntegrationRule
        fields = [
            'id',
            'connection',
            'connection_id',
            'object_key',
            'config',
            'is_enabled',
            'revision',
            'next_run_at',
            'last_run_at',
            'last_success_at',
            'last_error',
            'resync_required',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'connection', 'revision', 'next_run_at', 'last_run_at', 'last_success_at', 'last_error', 'resync_required', 'created_at', 'updated_at']

    @staticmethod
    def _config_with_defaults(config: dict) -> dict:
        normalized = dict(config or {})
        normalized.setdefault('includeSubprojects', False)
        normalized.setdefault('clientSyncPolicy', 'preserve_local')
        normalized.setdefault('deletionPolicy', 'mark_inactive_keep_link')
        normalized.setdefault('initialSyncMode', 'full_once')
        normalized.setdefault('conflictPolicy', 'upsert')
        normalized.setdefault('syncBehavior', 'delta')
        normalized.setdefault('dryRun', False)
        if 'intervalMinutes' not in normalized and 'cronExpression' not in normalized:
            normalized['intervalMinutes'] = 60
        return normalized

    def validate(self, attrs):
        connection = attrs.get('connection') or getattr(self.instance, 'connection', None)
        config = attrs.get('config') or getattr(self.instance, 'config', {})
        if connection is None:
            raise serializers.ValidationError('connection is required')
        normalized_config = self._config_with_defaults(config)
        validate_rule_config(connection.provider.key, normalized_config)
        attrs['config'] = normalized_config
        return attrs

    def create(self, validated_data):
        rule = super().create(validated_data)
        if rule.is_enabled:
            schedule_next_run(rule, base_time=timezone.now())
        return rule

    def update(self, instance, validated_data):
        if 'config' in validated_data:
            instance.revision += 1
        was_enabled = instance.is_enabled
        rule = super().update(instance, validated_data)
        updates: list[str] = []
        if 'config' in validated_data and rule.resync_required:
            rule.resync_required = False
            updates.append('resync_required')
        if rule.is_enabled:
            schedule_next_run(rule, base_time=timezone.now())
        if was_enabled and not rule.is_enabled:
            rule.next_run_at = None
            updates.append('next_run_at')
        if updates:
            rule.save(update_fields=updates)
        return rule
