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


class ThrottledTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]
    throttle_scope = 'login'

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
        # If cookie mode is enabled, supply the refresh token from cookie to the serializer
        if settings.FEATURES.get('COOKIE_REFRESH_AUTH'):
            refresh_cookie = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
            if refresh_cookie and not request.data.get('refresh'):
                # Create a mutable copy then inject
                request._full_data = None  # invalidate DRF cached data
                data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
                data['refresh'] = refresh_cookie
                request._request.POST = data  # for Django request
        response: Response = super().post(request, *args, **kwargs)
        if response.status_code >= 400:
            logging.getLogger(__name__).warning(
                "auth.refresh_failed status=%s ip=%s", response.status_code, request.META.get('REMOTE_ADDR')
            )
        if settings.FEATURES.get('COOKIE_REFRESH_AUTH') and isinstance(response.data, dict):
            # If rotation returns a new refresh token, set cookie and hide from body
            new_refresh = response.data.pop('refresh', None)
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
