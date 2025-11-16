from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from .models import IntegrationConnection, IntegrationProvider, IntegrationRule, IntegrationJob
from .registry import get_registry
from .rules import validate_rule_config
from .scheduler import schedule_next_run


class ProviderSerializer(serializers.Serializer):
    key = serializers.CharField()
    displayName = serializers.CharField(source='display_name')
    schemaVersion = serializers.CharField(source='schema_version')
    metadata = serializers.JSONField(source='raw')


class IntegrationConnectionSerializer(serializers.ModelSerializer):
    providerKey = serializers.CharField(write_only=True)
    provider = serializers.CharField(source='provider.key', read_only=True)
    providerDisplayName = serializers.CharField(source='provider.display_name', read_only=True)

    class Meta:
        model = IntegrationConnection
        fields = [
            'id',
            'provider',
            'providerDisplayName',
            'providerKey',
            'company_id',
            'environment',
            'is_active',
            'needs_reauth',
            'is_disabled',
            'extra_headers',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'provider', 'providerDisplayName', 'created_at', 'updated_at']
        extra_kwargs = {
            'company_id': {'required': True},
            'environment': {'required': True},
        }

    def validate_providerKey(self, value: str) -> str:
        registry = get_registry()
        if not registry.get_provider(value):
            raise serializers.ValidationError('Unknown provider')
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
    class Meta:
        model = IntegrationJob
        fields = [
            'id',
            'connection',
            'object_key',
            'status',
            'payload',
            'logs',
            'celery_id',
            'started_at',
            'finished_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


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
