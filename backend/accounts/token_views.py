from django.conf import settings
import logging
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ParseError


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Set the httpOnly refresh cookie if cookie mode is enabled."""
    if not settings.FEATURES.get('COOKIE_REFRESH_AUTH'):
        return
    # In dev (non-HTTPS), do not set Secure to allow local testing.
    is_secure = not settings.DEBUG
    # Limit cookie to token endpoints
    cookie_path = '/api/token/'
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh_token,
        httponly=True,
        secure=is_secure,
        samesite='Lax',
        path=cookie_path,
        max_age=60 * 60 * 24 * 30,  # 30 days
    )


def _clear_refresh_cookie(response: Response) -> None:
    if not settings.FEATURES.get('COOKIE_REFRESH_AUTH'):
        return
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path='/api/token/')


class UsernameOrEmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Allow login with either username or email.

    If the incoming 'username' field looks like an email or uniquely matches a
    user email (case-insensitive), rewrite it to that user's username before
    delegating to the base serializer.
    """
    def validate(self, attrs):  # type: ignore[override]
        raw = attrs.get('username') or ''
        if isinstance(raw, str) and raw:
            User = get_user_model()
            try:
                # Prefer exact case-insensitive email match when unique
                qs = User.objects.filter(email__iexact=raw)
                if qs.count() == 1:
                    user = qs.first()
                    if user is not None:
                        attrs['username'] = getattr(user, User.USERNAME_FIELD)
                elif '@' in raw:
                    # If it looks like an email but multiple results (rare) or none,
                    # leave as-is and let authentication fail normally.
                    pass
            except Exception:  # nosec B110
                # On any DB error, fall through to default behavior
                pass
        return super().validate(attrs)


class ThrottledTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]
    throttle_scope = 'login'
    serializer_class = UsernameOrEmailTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):  # type: ignore[override]
        response: Response = super().post(request, *args, **kwargs)
        if response.status_code >= 400:
            logging.getLogger(__name__).warning(
                "auth.login_failed status=%s ip=%s", response.status_code, request.META.get('REMOTE_ADDR')
            )
        # When cookie mode is on, move refresh to httpOnly cookie and hide from body
        if settings.FEATURES.get('COOKIE_REFRESH_AUTH') and isinstance(response.data, dict):
            refresh_token = response.data.pop('refresh', None)
            if refresh_token:
                _set_refresh_cookie(response, refresh_token)
        return response


class ThrottledTokenRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]
    throttle_scope = 'login'

    def post(self, request, *args, **kwargs):  # type: ignore[override]
        # Build serializer input, tolerating empty/invalid JSON bodies
        try:
            incoming = request.data
        except ParseError:
            incoming = {}

        if not isinstance(incoming, dict):
            try:
                incoming = dict(incoming)
            except Exception:
                incoming = {}

        if settings.FEATURES.get('COOKIE_REFRESH_AUTH'):
            refresh_cookie = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
            if refresh_cookie and not incoming.get('refresh'):
                incoming = { 'refresh': refresh_cookie }

        serializer = self.get_serializer(data=incoming)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:  # return consistent InvalidToken response
            logging.getLogger(__name__).warning(
                "auth.refresh_failed token_error ip=%s", request.META.get('REMOTE_ADDR')
            )
            raise InvalidToken(e.args[0])

        body = dict(serializer.validated_data)
        response = Response(body, status=status.HTTP_200_OK)
        if settings.FEATURES.get('COOKIE_REFRESH_AUTH') and isinstance(body, dict):
            new_refresh = body.pop('refresh', None)
            if new_refresh:
                _set_refresh_cookie(response, new_refresh)
        return response


class ThrottledTokenVerifyView(TokenVerifyView):
    permission_classes = [AllowAny]
    throttle_scope = 'login'


class ThrottledTokenLogoutView(TokenRefreshView):
    """Clears the refresh cookie in cookie mode. Body is ignored."""
    permission_classes = [AllowAny]
    throttle_scope = 'login'

    def post(self, request, *args, **kwargs):  # type: ignore[override]
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response
