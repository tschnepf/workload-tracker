from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)


class ThrottledTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]
    throttle_scope = 'login'


class ThrottledTokenRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]
    throttle_scope = 'login'


class ThrottledTokenVerifyView(TokenVerifyView):
    permission_classes = [AllowAny]
    throttle_scope = 'login'

