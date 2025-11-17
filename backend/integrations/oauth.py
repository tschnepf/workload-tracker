from __future__ import annotations

import base64
import hashlib
import os
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Dict, Tuple

import requests
from django.core import signing
from django.core.cache import cache
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import (
    EncryptedSecret,
    IntegrationConnection,
    IntegrationProviderCredential,
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
    def build_state(cls, connection_id: int, actor_id: int) -> str:
        payload = {'c': connection_id, 'u': actor_id}
        return signing.dumps(payload, salt=cls.SALT)

    @classmethod
    def parse_state(cls, state: str) -> Tuple[int, int]:
        try:
            payload = signing.loads(state, max_age=cls.STATE_TTL, salt=cls.SALT)
            return int(payload['c']), int(payload['u'])
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
    def __init__(self, auth_base_url: str, token_url: str, client_id: str, client_secret: str):
        self.auth_base_url = auth_base_url.rstrip('/')
        self.token_url = token_url.rstrip('/')
        self.client_id = client_id
        self.client_secret = client_secret

    @staticmethod
    def _build_pkce_pair() -> Tuple[str, str]:
        verifier = _url_safe_b64(os.urandom(40))
        digest = hashlib.sha256(verifier.encode('ascii')).digest()
        challenge = base64.urlsafe_b64encode(digest).decode('ascii').rstrip('=')
        return verifier, challenge

    def build_authorize_url(self, redirect_uri: str, scopes: list[str], connection_id: int, actor_id: int) -> Tuple[str, str]:
        code_verifier, code_challenge = self._build_pkce_pair()
        state = OAuthStateManager.build_state(connection_id, actor_id)
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
        auth = (self.client_id, self.client_secret)
        resp = requests.post(self.token_url, data=data, auth=auth, timeout=(5, 30))
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
    auth_base_url = oauth_config.get('authBaseUrl')
    token_url = oauth_config.get('tokenUrl')
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
    )
    return client, credential, oauth_config


def build_authorization_url(connection: IntegrationConnection, actor_id: int) -> Tuple[str, str]:
    client, credential, oauth_config = _build_client(connection)
    redirect_uri = credential.redirect_uri
    scopes = oauth_config.get('scopes', [])
    return client.build_authorize_url(redirect_uri=redirect_uri, scopes=scopes, connection_id=connection.id, actor_id=actor_id)


def _load_latest_token_payload(connection: IntegrationConnection) -> dict | None:
    for secret in connection.secrets.all():
        try:
            payload = secret.decrypt()
        except Exception:  # pragma: no cover - defensive
            continue
        if payload.get('kind') == 'oauth_token':
            return payload
    return None


def store_token_response(connection: IntegrationConnection, token: OAuthTokenResponse) -> None:
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
