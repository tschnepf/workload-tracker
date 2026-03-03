from __future__ import annotations

import base64
import hashlib
import os
import secrets
from urllib.parse import urlencode

import jwt
import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponseRedirect
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from integrations.azure_identity import get_auth_method_policy, get_azure_connection, upsert_azure_principal
from integrations.models import IntegrationProvider
from integrations.registry import get_registry

from .token_views import _set_refresh_cookie

STATE_TTL_SECONDS = 300
STATE_PREFIX = 'auth:sso:azure:state:'
COMPLETE_PREFIX = 'auth:sso:complete:'


def _b64_url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def _pkce_pair() -> tuple[str, str]:
    verifier = _b64_url(os.urandom(48))
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    challenge = _b64_url(digest)
    return verifier, challenge


def _callback_uri(request) -> str:
    configured = (getattr(settings, 'AZURE_SSO_REDIRECT_URI', '') or '').strip()
    if configured:
        return configured
    return request.build_absolute_uri('/api/auth/sso/azure/callback/')


def _complete_redirect_url(code: str) -> str:
    base = (getattr(settings, 'APP_BASE_URL', '') or '').strip().rstrip('/')
    if not base:
        raise ImproperlyConfigured('APP_BASE_URL is required for SSO callback redirect')
    policy = get_auth_method_policy()
    path = (policy.frontend_complete_path or '/sso/complete').strip()
    if not path.startswith('/'):
        path = f'/{path}'
    return f"{base}{path}?code={code}"


def _tenant_id() -> str:
    tid = (getattr(settings, 'AZURE_SSO_TENANT_ID', '') or '').strip()
    if not tid:
        raise ImproperlyConfigured('AZURE_SSO_TENANT_ID is required for Azure SSO')
    return tid


def _get_provider_credentials():
    provider = IntegrationProvider.objects.filter(key='azure').select_related('credentials').first()
    if not provider:
        meta = get_registry().get_provider('azure')
        if meta:
            provider, _ = IntegrationProvider.objects.get_or_create(
                key='azure',
                defaults={
                    'display_name': meta.display_name,
                    'metadata': meta.raw,
                    'schema_version': meta.schema_version,
                },
            )
    if not provider:
        raise ImproperlyConfigured('Azure provider is not configured')
    credential = getattr(provider, 'credentials', None)
    if not credential:
        raise ImproperlyConfigured('Azure provider credentials are not configured')
    client_secret = credential.get_client_secret()
    if not client_secret:
        raise ImproperlyConfigured('Azure client secret is missing')
    return credential, client_secret


def _state_cache_key(state: str) -> str:
    return f"{STATE_PREFIX}{state}"


def _complete_cache_key(code: str) -> str:
    return f"{COMPLETE_PREFIX}{code}"


def _pop_cache_dict(key: str) -> dict | None:
    value = cache.get(key)
    if value is None:
        return None
    cache.delete(key)
    if not isinstance(value, dict):
        return None
    return value


def _store_state(state: str, payload: dict) -> None:
    cache.set(_state_cache_key(state), payload, timeout=STATE_TTL_SECONDS)


def _pop_state(state: str) -> dict | None:
    return _pop_cache_dict(_state_cache_key(state))


def _store_complete_code(payload: dict) -> str:
    code = secrets.token_urlsafe(32)
    cache.set(_complete_cache_key(code), payload, timeout=120)
    return code


def _pop_complete_code(code: str) -> dict | None:
    return _pop_cache_dict(_complete_cache_key(code))


def _authorize_url(request) -> tuple[str, str]:
    credential, _ = _get_provider_credentials()
    tenant = _tenant_id()
    callback_uri = _callback_uri(request)
    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(16)
    verifier, challenge = _pkce_pair()
    _store_state(
        state,
        {
            'nonce': nonce,
            'verifier': verifier,
            'created_at': timezone.now().isoformat(),
            'callback_uri': callback_uri,
        },
    )

    scopes = getattr(
        settings,
        'AZURE_SSO_SCOPES',
        ['openid', 'profile', 'email', 'offline_access', 'User.Read'],
    )
    params = {
        'client_id': credential.client_id,
        'response_type': 'code',
        'redirect_uri': callback_uri,
        'response_mode': 'query',
        'scope': ' '.join(scopes),
        'state': state,
        'nonce': nonce,
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
    }
    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{urlencode(params)}"
    return url, state


def _exchange_code_for_tokens(code: str, verifier: str, callback_uri: str) -> dict:
    credential, client_secret = _get_provider_credentials()
    tenant = _tenant_id()
    token_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    scopes = getattr(
        settings,
        'AZURE_SSO_SCOPES',
        ['openid', 'profile', 'email', 'offline_access', 'User.Read'],
    )
    payload = {
        'grant_type': 'authorization_code',
        'client_id': credential.client_id,
        'client_secret': client_secret,
        'code': code,
        'redirect_uri': callback_uri,
        'code_verifier': verifier,
        'scope': ' '.join(scopes),
    }
    resp = requests.post(token_url, data=payload, timeout=(5, 30))
    if resp.status_code >= 400:
        raise ValueError(f"Token exchange failed ({resp.status_code})")
    return resp.json()


def _decode_verified_id_token(id_token: str, expected_nonce: str) -> dict:
    unverified = jwt.decode(id_token, options={"verify_signature": False})
    tenant = _tenant_id()
    credential, _ = _get_provider_credentials()
    jwks_url = f"https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys"
    issuer = f"https://login.microsoftonline.com/{tenant}/v2.0"
    jwks_client = jwt.PyJWKClient(jwks_url)
    signing_key = jwks_client.get_signing_key_from_jwt(id_token)
    payload = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=['RS256'],
        audience=credential.client_id,
        issuer=issuer,
    )
    nonce = payload.get('nonce')
    if nonce != expected_nonce:
        raise ValueError('Invalid nonce')
    if payload.get('tid') != tenant:
        raise ValueError('Invalid tenant')
    # preserve helpful fields from unverified parse for consistency if missing.
    for key in ('preferred_username', 'email', 'name', 'given_name', 'family_name', 'oid', 'tid'):
        if key not in payload and key in unverified:
            payload[key] = unverified[key]
    return payload


def _principal_from_claims(claims: dict[str, str]) -> dict:
    upn = (claims.get('preferred_username') or claims.get('upn') or claims.get('email') or '').strip()
    email = (claims.get('email') or upn).strip()
    return {
        'tenant_id': (claims.get('tid') or '').strip(),
        'azure_oid': (claims.get('oid') or claims.get('sub') or '').strip(),
        'upn': upn,
        'email': email,
        'display_name': (claims.get('name') or '').strip(),
        'given_name': (claims.get('given_name') or '').strip(),
        'surname': (claims.get('family_name') or claims.get('surname') or '').strip(),
        'department': '',
        'job_title': '',
        'active': True,
        'assigned_to_app': True,
        'user_type': 'Member',
    }


class AzureSsoStatusView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            name='AzureSsoStatus',
            fields={
                'enabled': serializers.BooleanField(),
                'enforced': serializers.BooleanField(),
                'passwordLoginEnabledNonBreakGlass': serializers.BooleanField(),
                'breakGlassConfigured': serializers.BooleanField(),
            },
        )
    )
    def get(self, request):
        policy = get_auth_method_policy()
        return Response(
            {
                'enabled': bool(policy.azure_sso_enabled),
                'enforced': bool(policy.azure_sso_enforced),
                'passwordLoginEnabledNonBreakGlass': bool(policy.password_login_enabled_non_break_glass),
                'breakGlassConfigured': bool(policy.break_glass_user_id),
            }
        )


class AzureSsoStartView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            name='AzureSsoStartResponse',
            fields={'authorizeUrl': serializers.CharField(), 'state': serializers.CharField()},
        )
    )
    def post(self, request):
        policy = get_auth_method_policy()
        if not policy.azure_sso_enabled:
            return Response({'detail': 'Azure SSO is not enabled.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            authorize_url, state = _authorize_url(request)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'authorizeUrl': authorize_url, 'state': state})


class AzureSsoCallbackView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=OpenApiResponse(
            response=OpenApiTypes.STR,
            description='Redirects browser to frontend SSO completion route.',
        )
    )
    def get(self, request):
        error = request.query_params.get('error')
        state = request.query_params.get('state')
        code = request.query_params.get('code')
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        if not state or not code:
            return Response({'detail': 'Missing state or code'}, status=status.HTTP_400_BAD_REQUEST)

        state_payload = _pop_state(state)
        if not state_payload:
            return Response({'detail': 'Invalid or expired state'}, status=status.HTTP_400_BAD_REQUEST)
        nonce = str(state_payload.get('nonce') or '')
        verifier = str(state_payload.get('verifier') or '')
        callback_uri = str(state_payload.get('callback_uri') or _callback_uri(request))
        if not nonce or not verifier:
            return Response({'detail': 'Invalid SSO state payload'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token_payload = _exchange_code_for_tokens(code, verifier, callback_uri)
            claims = _decode_verified_id_token(str(token_payload.get('id_token') or ''), nonce)
            principal = _principal_from_claims(claims)
            connection = get_azure_connection()
            if not connection:
                return Response({'detail': 'Azure integration connection is not configured.'}, status=status.HTTP_400_BAD_REQUEST)
            outcome = upsert_azure_principal(
                connection,
                principal,
                source='login',
                allow_create=True,
            )
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if outcome.get('status') == 'conflict':
            return Response(
                {'detail': 'Azure account matches multiple local users; admin resolution is required.'},
                status=status.HTTP_409_CONFLICT,
            )
        user_id = outcome.get('user_id')
        if not user_id:
            return Response({'detail': 'Unable to resolve a local user for SSO login.'}, status=status.HTTP_400_BAD_REQUEST)
        User = get_user_model()
        user = User.objects.filter(id=user_id).first()
        if not user or not user.is_active:
            return Response({'detail': 'Account is inactive.'}, status=status.HTTP_403_FORBIDDEN)
        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        refresh_str = str(refresh)
        complete_code = _store_complete_code({'access': access, 'refresh': refresh_str, 'user_id': user.id})
        redirect_url = _complete_redirect_url(complete_code)
        return HttpResponseRedirect(redirect_to=redirect_url)


class AzureSsoCompleteView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=inline_serializer(
            name='AzureSsoCompleteRequest',
            fields={'code': serializers.CharField()},
        ),
        responses=inline_serializer(
            name='AzureSsoCompleteResponse',
            fields={'access': serializers.CharField(), 'refresh': serializers.CharField(required=False)},
        ),
    )
    def post(self, request):
        code = ((request.data or {}).get('code') or '').strip()
        if not code:
            return Response({'detail': 'code is required'}, status=status.HTTP_400_BAD_REQUEST)
        payload = _pop_complete_code(code)
        if not payload:
            return Response({'detail': 'Invalid or expired code'}, status=status.HTTP_400_BAD_REQUEST)
        access = str(payload.get('access') or '')
        refresh = str(payload.get('refresh') or '')
        if not access or not refresh:
            return Response({'detail': 'SSO payload is incomplete'}, status=status.HTTP_400_BAD_REQUEST)
        response_payload = {'access': access}
        response = Response(response_payload, status=status.HTTP_200_OK)
        if settings.FEATURES.get('COOKIE_REFRESH_AUTH'):
            _set_refresh_cookie(response, refresh)
        else:
            response_payload['refresh'] = refresh
            response.data = response_payload
        return response
