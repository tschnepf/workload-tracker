from __future__ import annotations

import base64
import hashlib
import os
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Dict, Tuple

import requests
from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import (
    EncryptedSecret,
    IntegrationConnection,
    IntegrationProviderCredential,
    IntegrationSetting,
)
from .registry import get_registry


class OAuthError(Exception):
    pass


@dataclass
class OAuthTokenResponse:
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str
    raw: dict


class OAuthStateManager:
    STATE_TTL = 300  # seconds
    SALT = 'integrations.oauth.state'
    CACHE_PREFIX = 'integrations:oauth:pkce:'

    @classmethod
    def build_state(cls, connection_id: int, actor_id: int, callback_origin: str | None = None) -> str:
        payload = {'c': connection_id, 'u': actor_id}
        if callback_origin:
            payload['o'] = callback_origin
        return signing.dumps(payload, salt=cls.SALT)

    @classmethod
    def parse_state(cls, state: str) -> Tuple[int, int, str | None]:
        try:
            payload = signing.loads(state, max_age=cls.STATE_TTL, salt=cls.SALT)
            origin = payload.get('o')
            if origin is not None:
                origin = str(origin)
            return int(payload['c']), int(payload['u']), origin
        except Exception as exc:  # pragma: no cover - defensive
            raise OAuthError('Invalid or expired state parameter') from exc

    @classmethod
    def store_code_verifier(cls, state: str, code_verifier: str) -> None:
        cache.set(cls.CACHE_PREFIX + state, code_verifier, timeout=cls.STATE_TTL)

    @classmethod
    def pop_code_verifier(cls, state: str) -> str:
        key = cls.CACHE_PREFIX + state
        code_verifier = cache.get(key)
        if not code_verifier:
            raise OAuthError('Authorization session expired. Please start again.')
        cache.delete(key)
        return code_verifier


def _url_safe_b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


class BQEOAuthClient:
    def __init__(
        self,
        auth_base_url: str,
        token_url: str,
        client_id: str,
        client_secret: str,
        token_auth_method: str = 'basic',
    ):
        self.auth_base_url = auth_base_url.rstrip('/')
        self.token_url = token_url.rstrip('/')
        self.client_id = client_id
        self.client_secret = client_secret
        self.token_auth_method = (token_auth_method or 'basic').strip().lower()

    @staticmethod
    def _build_pkce_pair() -> Tuple[str, str]:
        verifier = _url_safe_b64(os.urandom(40))
        digest = hashlib.sha256(verifier.encode('ascii')).digest()
        challenge = base64.urlsafe_b64encode(digest).decode('ascii').rstrip('=')
        return verifier, challenge

    def build_authorize_url(
        self,
        redirect_uri: str,
        scopes: list[str],
        connection_id: int,
        actor_id: int,
        callback_origin: str | None = None,
    ) -> Tuple[str, str]:
        code_verifier, code_challenge = self._build_pkce_pair()
        state = OAuthStateManager.build_state(connection_id, actor_id, callback_origin=callback_origin)
        OAuthStateManager.store_code_verifier(state, code_verifier)
        from urllib.parse import urlencode

        params = {
            'response_type': 'code',
            'client_id': self.client_id,
            'redirect_uri': redirect_uri,
            'scope': ' '.join(sorted(set(scopes or []))),
            'state': state,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256',
        }
        return f"{self.auth_base_url}?{urlencode(params)}", state

    def _token_request(self, data: Dict[str, Any]) -> OAuthTokenResponse:
        auth = None
        payload = dict(data or {})
        if self.token_auth_method == 'body':
            payload['client_id'] = self.client_id
            payload['client_secret'] = self.client_secret
        else:
            auth = (self.client_id, self.client_secret)
        resp = requests.post(self.token_url, data=payload, auth=auth, timeout=(5, 30))
        if resp.status_code >= 400:
            raise OAuthError(f"Token request failed ({resp.status_code})")
        payload = resp.json()
        return OAuthTokenResponse(
            access_token=payload['access_token'],
            refresh_token=payload.get('refresh_token', ''),
            expires_in=int(payload.get('expires_in', 3600)),
            token_type=payload.get('token_type', 'bearer'),
            raw=payload,
        )

    def exchange_code(self, code: str, redirect_uri: str, code_verifier: str) -> OAuthTokenResponse:
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
            'code_verifier': code_verifier,
        }
        return self._token_request(data)

    def refresh_token(self, refresh_token: str) -> OAuthTokenResponse:
        if not refresh_token:
            raise OAuthError('Refresh token missing')
        data = {
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token,
        }
        return self._token_request(data)


TOKEN_BUFFER_SECONDS = 60
AZURE_OAUTH_TENANT_SETTING_KEY = 'azure.oauth_tenant'


def _configured_azure_tenant() -> str:
    return (getattr(settings, 'AZURE_SSO_TENANT_ID', '') or '').strip()


def _decode_unverified_jwt_claims(token: str | None) -> dict[str, Any]:
    raw = (token or '').strip()
    if not raw or '.' not in raw:
        return {}
    parts = raw.split('.')
    if len(parts) < 2:
        return {}
    payload_segment = parts[1]
    pad = '=' * ((4 - len(payload_segment) % 4) % 4)
    try:
        decoded = base64.urlsafe_b64decode((payload_segment + pad).encode('ascii'))
        import json

        payload = json.loads(decoded.decode('utf-8'))
        return payload if isinstance(payload, dict) else {}
    except Exception:  # nosec B110
        return {}


def _extract_azure_token_tenant(token_payload: dict[str, Any]) -> str:
    id_claims = _decode_unverified_jwt_claims(str(token_payload.get('id_token') or ''))
    tid = str(id_claims.get('tid') or '').strip()
    if tid:
        return tid
    access_claims = _decode_unverified_jwt_claims(str(token_payload.get('access_token') or ''))
    return str(access_claims.get('tid') or '').strip()


def _resolve_oauth_url(connection: IntegrationConnection, url: str) -> str:
    resolved = (url or '').strip()
    if '{tenant}' not in resolved:
        return resolved
    if connection.provider.key != 'azure':
        raise OAuthError('Provider OAuth URL uses an unsupported template placeholder.')
    tenant = _configured_azure_tenant()
    if not tenant:
        raise OAuthError('AZURE_SSO_TENANT_ID is required for Azure OAuth.')
    return resolved.replace('{tenant}', tenant)


def _store_azure_connection_tenant(connection: IntegrationConnection, tenant_id: str) -> None:
    IntegrationSetting.objects.update_or_create(
        connection=connection,
        key=AZURE_OAUTH_TENANT_SETTING_KEY,
        defaults={
            'data': {
                'tenantId': tenant_id,
                'verifiedAt': timezone.now().isoformat(),
            }
        },
    )


def _get_stored_azure_connection_tenant(connection: IntegrationConnection) -> str:
    setting = IntegrationSetting.objects.filter(connection=connection, key=AZURE_OAUTH_TENANT_SETTING_KEY).first()
    if not setting or not isinstance(setting.data, dict):
        return ''
    return str(setting.data.get('tenantId') or '').strip()


def _validate_azure_token_tenant(connection: IntegrationConnection, token_payload: dict[str, Any]) -> str:
    if connection.provider.key != 'azure':
        return ''
    expected = _configured_azure_tenant()
    if not expected:
        raise OAuthError('AZURE_SSO_TENANT_ID is required for Azure OAuth.')
    actual = _extract_azure_token_tenant(token_payload)
    if not actual:
        raise OAuthError('Azure token is missing tenant (tid) claim.')
    if actual != expected:
        raise OAuthError('Azure OAuth token tenant mismatch.')
    _store_azure_connection_tenant(connection, actual)
    return actual


def _validate_azure_connection_tenant(connection: IntegrationConnection, token_payload: dict[str, Any] | None = None) -> None:
    if connection.provider.key != 'azure':
        return
    expected = _configured_azure_tenant()
    if not expected:
        raise OAuthError('AZURE_SSO_TENANT_ID is required for Azure OAuth.')
    stored = _get_stored_azure_connection_tenant(connection)
    if stored and stored != expected:
        raise OAuthError('Stored Azure OAuth tenant does not match current configured tenant.')
    if token_payload:
        actual = _extract_azure_token_tenant(token_payload)
        if actual and actual != expected:
            raise OAuthError('Azure OAuth access token tenant mismatch.')


def _get_provider_metadata(connection: IntegrationConnection):
    registry = get_registry()
    provider = registry.get_provider(connection.provider.key)
    if not provider:
        raise OAuthError('Provider metadata missing')
    return provider


def _get_provider_credentials(connection: IntegrationConnection) -> IntegrationProviderCredential:
    credential = getattr(connection.provider, 'credentials', None)
    if not credential or not credential.has_client_secret:
        raise OAuthError('Provider credentials are not configured')
    return credential


def _build_client(connection: IntegrationConnection, provider_meta=None) -> Tuple[BQEOAuthClient, IntegrationProviderCredential, dict]:
    provider_meta = provider_meta or _get_provider_metadata(connection)
    oauth_config = provider_meta.raw.get('oauth') or {}
    auth_base_url = _resolve_oauth_url(connection, str(oauth_config.get('authBaseUrl') or ''))
    token_url = _resolve_oauth_url(connection, str(oauth_config.get('tokenUrl') or ''))
    if not auth_base_url or not token_url:
        raise OAuthError('Provider OAuth configuration is incomplete')
    credential = _get_provider_credentials(connection)
    client_secret = credential.get_client_secret()
    if not client_secret:
        raise OAuthError('Provider client secret missing')
    client = BQEOAuthClient(
        auth_base_url=auth_base_url,
        token_url=token_url,
        client_id=credential.client_id,
        client_secret=client_secret,
        token_auth_method=str(oauth_config.get('tokenAuthMethod') or 'basic'),
    )
    return client, credential, oauth_config


def build_authorization_url(
    connection: IntegrationConnection,
    actor_id: int,
    callback_origin: str | None = None,
) -> Tuple[str, str]:
    client, credential, oauth_config = _build_client(connection)
    redirect_uri = credential.redirect_uri
    scopes = oauth_config.get('scopes', [])
    return client.build_authorize_url(
        redirect_uri=redirect_uri,
        scopes=scopes,
        connection_id=connection.id,
        actor_id=actor_id,
        callback_origin=callback_origin,
    )


def _load_latest_token_payload(connection: IntegrationConnection) -> dict | None:
    for secret in connection.secrets.all():
        try:
            payload = secret.decrypt()
        except Exception:  # pragma: no cover - defensive  # nosec B112
            continue
        if payload.get('kind') == 'oauth_token':
            return payload
    return None


def store_token_response(connection: IntegrationConnection, token: OAuthTokenResponse) -> None:
    token_tenant = _validate_azure_token_tenant(connection, token.raw)
    expires_at = timezone.now() + timedelta(seconds=max(token.expires_in, 60))
    endpoint = token.raw.get('endpoint')
    normalized_endpoint = endpoint.rstrip('/') if isinstance(endpoint, str) else ''
    existing_payload = _load_latest_token_payload(connection)
    if not normalized_endpoint and existing_payload:
        normalized_endpoint = (existing_payload.get('endpoint') or '').rstrip('/')
    payload = {
        'kind': 'oauth_token',
        'access_token': token.access_token,
        'refresh_token': token.refresh_token,
        'token_type': token.token_type,
        'expires_at': expires_at.isoformat(),
    }
    if token_tenant:
        payload['tenant_id'] = token_tenant
    if normalized_endpoint:
        payload['endpoint'] = normalized_endpoint
    EncryptedSecret.store(connection, payload)
    connection.needs_reauth = False
    connection.is_active = True
    connection.save(update_fields=['needs_reauth', 'is_active', 'updated_at'])


def connection_has_token(connection: IntegrationConnection) -> bool:
    return _load_latest_token_payload(connection) is not None


def exchange_code_for_connection(connection: IntegrationConnection, code: str, state: str) -> None:
    client, credential, _ = _build_client(connection)
    code_verifier = OAuthStateManager.pop_code_verifier(state)
    token = client.exchange_code(code, credential.redirect_uri, code_verifier)
    store_token_response(connection, token)


def _parse_expires_at(value: str | None):
    if not value:
        return None
    dt = parse_datetime(value)
    if dt and timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone=timezone.utc)
    return dt


def get_connection_access_token(connection: IntegrationConnection, provider_meta=None) -> str:
    payload = _load_latest_token_payload(connection)
    if not payload:
        raise OAuthError('Connection is not authorized with the provider')
    _validate_azure_connection_tenant(connection, payload)
    expires_at = _parse_expires_at(payload.get('expires_at'))
    now = timezone.now()
    if not expires_at or now >= expires_at - timedelta(seconds=TOKEN_BUFFER_SECONDS):
        client, credential, _ = _build_client(connection, provider_meta)
        refreshed = client.refresh_token(payload.get('refresh_token', ''))
        store_token_response(connection, refreshed)
        return refreshed.access_token
    return payload['access_token']


def get_connection_endpoint(connection: IntegrationConnection, provider_meta=None) -> str:
    payload = _load_latest_token_payload(connection)
    if not payload:
        raise OAuthError('Connection is not authorized with the provider')
    endpoint = (payload.get('endpoint') or '').strip()
    if not endpoint:
        raise OAuthError('Connection endpoint is missing. Re-authorize the provider.')
    return endpoint.rstrip('/')
