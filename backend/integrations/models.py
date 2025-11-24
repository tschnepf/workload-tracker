from __future__ import annotations

import base64
import hashlib

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError, ImproperlyConfigured
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from cryptography.fernet import Fernet

from .encryption import encrypt_secret, decrypt_secret, get_primary_key_id


def _storage_cipher() -> Fernet:
    seed = (settings.SECRET_KEY or 'workload-tracker').encode('utf-8')
    digest = hashlib.sha256(seed).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


class IntegrationProvider(models.Model):
    key = models.CharField(max_length=50, unique=True)
    display_name = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict)
    schema_version = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.display_name


class IntegrationConnection(models.Model):
    ENVIRONMENT_CHOICES = (
        ('sandbox', 'Sandbox'),
        ('production', 'Production'),
    )

    provider = models.ForeignKey(IntegrationProvider, on_delete=models.CASCADE, related_name='connections')
    environment = models.CharField(max_length=20, choices=ENVIRONMENT_CHOICES, default='production')
    is_active = models.BooleanField(default=True)
    needs_reauth = models.BooleanField(default=False)
    is_disabled = models.BooleanField(default=False)
    extra_headers = models.JSONField(default=dict, blank=True)
    utc_offset_minutes = models.SmallIntegerField(
        default=0,
        validators=[MinValueValidator(-720), MaxValueValidator(840)],
        help_text='Timezone offset in minutes for APIs requiring X-UTC-OFFSET headers.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['provider', 'environment'], name='uniq_integration_connection')
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.provider_id}:{self.environment}"


class EncryptedSecret(models.Model):
    connection = models.ForeignKey(IntegrationConnection, on_delete=models.CASCADE, related_name='secrets')
    key_id = models.CharField(max_length=36)
    cipher_text = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    @classmethod
    def store(cls, connection: IntegrationConnection, payload: dict) -> 'EncryptedSecret':
        key_id = get_primary_key_id()
        cipher = encrypt_secret(payload)
        return cls.objects.create(connection=connection, key_id=key_id, cipher_text=cipher)

    def decrypt(self) -> dict:
        return decrypt_secret(bytes(self.cipher_text))


class IntegrationSetting(models.Model):
    connection = models.ForeignKey(IntegrationConnection, on_delete=models.CASCADE, related_name='settings')
    key = models.CharField(max_length=64)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('connection', 'key')
        ordering = ['key']


class IntegrationSecretKey(models.Model):
    name = models.CharField(max_length=50, default='default', unique=True)
    encrypted_value = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    @staticmethod
    def _cipher() -> Fernet:
        return _storage_cipher()

    @classmethod
    def configured(cls) -> bool:
        return cls.objects.exists()

    @classmethod
    def load_active_key(cls) -> str | None:
        record = cls.objects.order_by('-updated_at').first()
        if not record or not record.encrypted_value:
            return None
        return record.get_plaintext()

    @classmethod
    def set_plaintext(cls, raw: str) -> 'IntegrationSecretKey':
        obj, _ = cls.objects.get_or_create(name='default')
        obj.encrypted_value = cls._cipher().encrypt(raw.encode('utf-8'))
        obj.save(update_fields=['encrypted_value', 'updated_at'])
        return obj

    def get_plaintext(self) -> str:
        raw = self._cipher().decrypt(bytes(self.encrypted_value or b''))
        return raw.decode('utf-8')


class IntegrationProviderCredential(models.Model):
    provider = models.OneToOneField(IntegrationProvider, on_delete=models.CASCADE, related_name='credentials')
    client_id = models.CharField(max_length=255)
    redirect_uri = models.CharField(max_length=500)
    encrypted_client_secret = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['provider']

    def set_client_secret(self, secret: str):
        payload = {'client_secret': secret}
        self.encrypted_client_secret = encrypt_secret(payload)

    def get_client_secret(self) -> str | None:
        if not self.encrypted_client_secret:
            return None
        data = decrypt_secret(bytes(self.encrypted_client_secret))
        return data.get('client_secret')

    @property
    def has_client_secret(self) -> bool:
        return bool(self.encrypted_client_secret)


class IntegrationRule(models.Model):
    connection = models.ForeignKey(IntegrationConnection, on_delete=models.CASCADE, related_name='rules')
    object_key = models.CharField(max_length=50)
    config = models.JSONField(default=dict)
    is_enabled = models.BooleanField(default=False)
    revision = models.PositiveIntegerField(default=1)
    next_run_at = models.DateTimeField(null=True, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default='')
    resync_required = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('connection', 'object_key')
        indexes = [
            models.Index(fields=['is_enabled', 'next_run_at'], name='idx_integration_rule_next_run'),
        ]


class IntegrationJob(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
    )

    connection = models.ForeignKey(IntegrationConnection, on_delete=models.CASCADE, related_name='jobs')
    provider = models.ForeignKey(IntegrationProvider, on_delete=models.CASCADE, related_name='jobs')
    object_key = models.CharField(max_length=50)
    celery_id = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    payload = models.JSONField(default=dict)
    logs = models.JSONField(default=list, blank=True)
    metrics = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def mark_running(self):
        self.status = 'running'
        self.started_at = timezone.now()
        self.save(update_fields=['status', 'started_at', 'updated_at'])

    def mark_finished(self, success: bool, *, logs: list | None = None, metrics: dict | None = None):
        self.status = 'succeeded' if success else 'failed'
        self.finished_at = timezone.now()
        if logs is not None:
            self.logs = logs
        if metrics is not None:
            self.metrics = metrics
        fields = ['status', 'finished_at', 'updated_at']
        if logs is not None:
            fields.append('logs')
        if metrics is not None:
            fields.append('metrics')
        self.save(update_fields=fields)


class IntegrationAuditLog(models.Model):
    ACTION_CHOICES = (
        ('connection.created', 'Connection created'),
        ('connection.updated', 'Connection updated'),
        ('connection.deleted', 'Connection deleted'),
        ('rule.created', 'Rule created'),
        ('rule.updated', 'Rule updated'),
        ('rule.deleted', 'Rule deleted'),
        ('rule.resync', 'Rule resync requested'),
        ('job.retry', 'Job retry requested'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    provider = models.ForeignKey(IntegrationProvider, null=True, blank=True, on_delete=models.SET_NULL)
    connection = models.ForeignKey(IntegrationConnection, null=True, blank=True, on_delete=models.SET_NULL)
    rule = models.ForeignKey(IntegrationRule, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=64, choices=ACTION_CHOICES)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class IntegrationClient(models.Model):
    connection = models.ForeignKey(IntegrationConnection, on_delete=models.CASCADE, related_name='clients')
    external_id = models.CharField(max_length=128)
    legacy_external_id = models.CharField(max_length=128, blank=True, default='')
    name = models.CharField(max_length=255, blank=True)
    client_number = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=100, blank=True, null=True)
    email = models.CharField(max_length=255, blank=True, null=True)
    phone = models.CharField(max_length=100, blank=True, null=True)
    is_archived = models.BooleanField(default=False)
    updated_on = models.DateTimeField(null=True, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('connection', 'external_id')
        indexes = [
            models.Index(fields=['connection', 'client_number'], name='idx_integration_client_number'),
            models.Index(fields=['connection', 'name'], name='idx_integration_client_name'),
            models.Index(fields=['connection', 'legacy_external_id'], name='idx_integration_client_legacy'),
        ]


class IntegrationExternalLink(models.Model):
    PROVIDER_OBJECT_CHOICES = (
        ('projects', 'Projects'),
        ('clients', 'Clients'),
    )

    provider = models.ForeignKey(IntegrationProvider, on_delete=models.CASCADE, related_name='external_links')
    connection = models.ForeignKey(IntegrationConnection, on_delete=models.CASCADE, related_name='external_links')
    object_type = models.CharField(max_length=50, choices=PROVIDER_OBJECT_CHOICES)
    external_id = models.CharField(max_length=128)
    legacy_external_id = models.CharField(max_length=128, blank=True, default='')
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    local_object = GenericForeignKey('content_type', 'object_id')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'object_type', 'connection', 'external_id'],
                name='uniq_external_link'
            )
        ]
        indexes = [
            models.Index(fields=['connection', 'legacy_external_id'], name='idx_external_link_legacy')
        ]

    @staticmethod
    def allowed_models() -> set[str]:
        return {'projects.project', 'people.person'}

    def clean(self):
        label = self.content_type.app_label + '.' + self.content_type.model
        if label not in self.allowed_models():
            raise ValidationError(f"{label} is not allowed for integrations.")


def ensure_integrations_key_present():
    from django.conf import settings
    enabled = getattr(settings, 'INTEGRATIONS_ENABLED', False)
    secret_key = getattr(settings, 'INTEGRATIONS_SECRET_KEY', None)
    if enabled and not secret_key:
        raise ImproperlyConfigured('INTEGRATIONS_SECRET_KEY is required when INTEGRATIONS_ENABLED=true')
