from __future__ import annotations

import base64
import os
import secrets
import time
from dataclasses import dataclass
from typing import Dict, Any

import requests
from django.core.cache import cache
from django.urls import reverse

from .http import IntegrationHttpClient


@dataclass
class OAuthTokenResponse:
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str
    raw: dict


class OAuthError(Exception):
    pass


class OAuthStateManager:
    STATE_TTL = 300  # seconds

    @staticmethod
    def build_state(connection_id: int, actor_id: int) -> str:
        payload = f"{connection_id}:{actor_id}:{int(time.time())}"
        return base64.urlsafe_b64encode(payload.encode('utf-8')).decode('ascii')

    @staticmethod
    def parse_state(state: str) -> tuple[int, int]:
        try:
            decoded = base64.urlsafe_b64decode(state.encode('ascii')).decode('utf-8')
            connection_id_str, actor_id_str, _timestamp = decoded.split(':', 2)
            return int(connection_id_str), int(actor_id_str)
        except Exception as exc:
            raise OAuthError('Invalid state parameter') from exc


class BQEOAuthClient:
    def __init__(self, base_url: str, client_id: str, client_secret: str):
        self.base_url = base_url.rstrip('/')
        self.client_id = client_id
        self.client_secret = client_secret
        self.http = IntegrationHttpClient(base_url)

    @staticmethod
    def _build_pkce_pair() -> tuple[str, str]:
        code_verifier = base64.urlsafe_b64encode(os.urandom(32)).decode('ascii').rstrip('=')
        hashed = base64.urlsafe_b64encode(code_verifier.encode('ascii')).decode('ascii').rstrip('=')
        return code_verifier, hashed

    @classmethod
    def build_authorize_url(cls, auth_base_url: str, redirect_uri: str, connection_id: int, actor_id: int, scopes: list[str]) -> tuple[str, str]:
        code_verifier, code_challenge = cls._build_pkce_pair()
        state = OAuthStateManager.build_state(connection_id, actor_id)
        cache.set(f"oauth:pkce:{state}", code_verifier, timeout=cls.STATE_TTL)
        scope = ' '.join(sorted(set(scopes)))
        url = (
            f"{auth_base_url}?response_type=code"
            f"&client_id={cls._urlencode(cls, scopes=None, value=cls.client_id)}"  # placeholder; we will build manually
        )
        url = (
            f"{auth_base_url}"
            f"?response_type=code"
            f"&client_id={cls._urlencode(None, value=cls.client_id)}"
            f"&redirect_uri={cls._urlencode(None, value=redirect_uri)}"
            f"&scope={cls._urlencode(None, value=scope)}"
            f"&state={state}"
            f"&code_challenge={code_challenge}"
            f"&code_challenge_method=S256"
        )
        return url, state

    @staticmethod
    def _urlencode(_self, value: str | None = None, scopes: list[str] | None = None) -> str:
        from urllib.parse import quote_plus
        if value is None:
            return ''
        return quote_plus(value)

    def _token_request(self, data: Dict[str, Any]) -> OAuthTokenResponse:
        auth = (self.client_id, self.client_secret)
        resp = requests.post(
            f"{self.base_url}/token",
            data=data,
            auth=auth,
            timeout=(5, 30),
        )
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
        data = {
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token,
        }
        return self._token_request(data)
