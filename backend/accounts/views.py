from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.throttling import UserRateThrottle, ScopedRateThrottle
from drf_spectacular.utils import extend_schema, OpenApiParameter

from .models import UserProfile, AdminAuditLog
from .serializers import (
    UserProfileSerializer,
    AdminAuditLogSerializer,
    UserSettingsPatchSerializer,
    LinkPersonRequestSerializer,
    ChangePasswordRequestSerializer,
    CreateUserRequestSerializer,
    SetPasswordRequestSerializer,
    UserListItemSerializer,
    SetUserRoleRequestSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    InviteUserRequestSerializer,
    NotificationPreferencesSerializer,
)
from people.models import Person
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from core.models import NotificationPreference
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes
from django.contrib.auth.tokens import default_token_generator
from django.conf import settings as django_settings


class HotEndpointThrottle(ScopedRateThrottle):
    scope = 'hot_endpoint'

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=UserProfileSerializer)
    def get(self, request):
        """Return the current user's profile with settings and optional person link."""
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)


class SettingsView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    @extend_schema(request=UserSettingsPatchSerializer, responses=UserProfileSerializer)
    def patch(self, request):
        """Update settings for the current user's profile (partial)."""
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = UserProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class LinkPersonView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    @extend_schema(request=LinkPersonRequestSerializer, responses=UserProfileSerializer)
    def post(self, request):
        """Link or unlink the current user's profile to a Person."""
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        person_id = request.data.get("person_id", None)

        # Unlink
        if person_id in (None, ""):
            if profile.person_id is not None:
                profile.person = None
                profile.save(update_fields=["person", "updated_at"])
            serializer = UserProfileSerializer(profile)
            return Response(serializer.data)

        # Link with guardrails inside an atomic transaction
        try:
            with transaction.atomic():
                person = get_object_or_404(Person, pk=person_id)

                # Unique: ensure person not already linked to someone else
                existing = UserProfile.objects.select_for_update().filter(person_id=person.id).exclude(user_id=request.user.id)
                if existing.exists():
                    return Response({
                        "detail": "This person is already linked to another user."
                    }, status=status.HTTP_409_CONFLICT)

                # Email guardrails: require match or staff override
                user_email = (request.user.email or '').strip().lower()
                person_email = (person.email or '').strip().lower()
                if user_email and person_email:
                    if user_email != person_email and not (request.user.is_staff or request.user.is_superuser):
                        return Response({
                            "detail": "Email mismatch. Only staff can link accounts without matching emails."
                        }, status=status.HTTP_403_FORBIDDEN)
                else:
                    # Missing one/both emails; require staff
                    if not (request.user.is_staff or request.user.is_superuser):
                        return Response({
                            "detail": "Email missing. Only staff can link accounts without emails."
                        }, status=status.HTTP_403_FORBIDDEN)

                profile.person = person
                profile.save(update_fields=["person", "updated_at"])
        except IntegrityError:
            return Response({"detail": "Unable to link. This person may already be linked."}, status=status.HTTP_409_CONFLICT)

        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle, HotEndpointThrottle]

    @extend_schema(request=ChangePasswordRequestSerializer, responses={204: None})
    def post(self, request):
        """Change password for the authenticated user."""
        current = request.data.get("currentPassword")
        new = request.data.get("newPassword")
        if not current or not new:
            return Response({"detail": "currentPassword and newPassword are required."}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(current):
            return Response({"detail": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new, user=request.user)
        except Exception as e:
            return Response({"detail": "Invalid password.", "errors": [str(x) for x in (e.error_list if hasattr(e, 'error_list') else [e])]}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        try:
            AdminAuditLog.objects.create(actor=request.user, action='change_password', target_user=request.user, detail={})
        except Exception:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class CreateUserView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    throttle_classes = [UserRateThrottle, HotEndpointThrottle]

    @extend_schema(request=CreateUserRequestSerializer, responses=UserProfileSerializer)
    def post(self, request):
        """Create a new user (staff only) and optionally link to a Person."""
        User = get_user_model()
        username = (request.data.get("username") or "").strip()
        email = (request.data.get("email") or "").strip()
        password = request.data.get("password")
        person_id = request.data.get("personId")
        role = (request.data.get("role") or "user").strip().lower()

        if not username or not password:
            return Response({"detail": "username and password are required."}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({"detail": "Username already exists."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password)
        except Exception as e:
            return Response({"detail": "Invalid password.", "errors": [str(x) for x in (e.error_list if hasattr(e, 'error_list') else [e])]}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(username=username, email=email)
        user.set_password(password)
        # Assign role
        from django.contrib.auth.models import Group
        if role == 'admin':
            user.is_staff = True
            user.save(update_fields=["password", "is_staff"])
            try:
                admin_group = Group.objects.get(name='Admin')
                user.groups.add(admin_group)
            except Group.DoesNotExist:
                pass
        elif role == 'manager':
            user.is_staff = False
            user.save(update_fields=["password", "is_staff"])
            try:
                mgr_group = Group.objects.get(name='Manager')
                user.groups.add(mgr_group)
            except Group.DoesNotExist:
                pass
        else:
            user.is_staff = False
            user.save(update_fields=["password", "is_staff"])
            try:
                user_group = Group.objects.get(name='User')
                user.groups.add(user_group)
            except Group.DoesNotExist:
                pass

        # Ensure profile exists
        profile, _ = UserProfile.objects.get_or_create(user=user)

        # Optionally link to Person (staff override allowed; still enforce uniqueness)
        if person_id not in (None, ""):
            try:
                with transaction.atomic():
                    person = get_object_or_404(Person, pk=person_id)
                    existing = UserProfile.objects.select_for_update().filter(person_id=person.id).exclude(user_id=user.id)
                    if existing.exists():
                        return Response({"detail": "This person is already linked to another user."}, status=status.HTTP_409_CONFLICT)
                    profile.person = person
                    profile.save(update_fields=["person", "updated_at"])
            except IntegrityError:
                return Response({"detail": "Unable to link. This person may already be linked."}, status=status.HTTP_409_CONFLICT)

        # Audit: admin created user
        try:
            AdminAuditLog.objects.create(
                actor=request.user,
                action='create_user',
                target_user=user,
                detail={'role': role, 'personId': person_id},
            )
        except Exception:
            pass
        ser = UserProfileSerializer(profile)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class SetPasswordView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    throttle_classes = [UserRateThrottle, HotEndpointThrottle]

    @extend_schema(request=SetPasswordRequestSerializer, responses={204: None})
    def post(self, request):
        """Set password for a target user (staff only)."""
        user_id = request.data.get("userId")
        new = request.data.get("newPassword")
        if not user_id or not new:
            return Response({"detail": "userId and newPassword are required."}, status=status.HTTP_400_BAD_REQUEST)
        User = get_user_model()
        target = get_object_or_404(User, pk=user_id)
        try:
            validate_password(new, user=target)
        except Exception as e:
            return Response({"detail": "Invalid password.", "errors": [str(x) for x in (e.error_list if hasattr(e, 'error_list') else [e])]}, status=status.HTTP_400_BAD_REQUEST)
        target.set_password(new)
        target.save(update_fields=["password"])
        try:
            AdminAuditLog.objects.create(actor=request.user, action='set_password', target_user=target, detail={})
        except Exception:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class ListUsersView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    throttle_classes = [UserRateThrottle]

    @extend_schema(responses=UserListItemSerializer(many=True))
    def get(self, request):
        """List all users with role and linked person (admin only)."""
        User = get_user_model()
        qs = (
            User.objects.all()
            .select_related('profile__person')
            .prefetch_related('groups')
            .order_by('username')
        )

        results = []
        for u in qs:
            try:
                group_names = set(u.groups.values_list('name', flat=True))
            except Exception:
                group_names = set()
            if u.is_staff or u.is_superuser:
                role = 'admin'
            elif 'Manager' in group_names:
                role = 'manager'
            else:
                role = 'user'

            person = None
            if getattr(u, 'profile', None) and getattr(u.profile, 'person', None):
                person = {
                    'id': u.profile.person.id,
                    'name': u.profile.person.name,
                }

            results.append({
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'is_staff': u.is_staff,
                'is_superuser': u.is_superuser,
                'groups': sorted(list(group_names)),
                'role': role,
                'person': person,
            })

        return Response(results)


class DeleteUserView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    throttle_classes = [UserRateThrottle, HotEndpointThrottle]

    @extend_schema(
        parameters=[OpenApiParameter(name='user_id', type=int, location=OpenApiParameter.PATH)],
        responses={204: None}
    )
    def delete(self, request, user_id: int):
        """Delete a user account (admin only)."""
        User = get_user_model()
        target = get_object_or_404(User, pk=user_id)

        if target.id == request.user.id:
            return Response({"detail": "You cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)

        if target.is_superuser and not request.user.is_superuser:
            return Response({"detail": "Only a superuser may delete another superuser."}, status=status.HTTP_403_FORBIDDEN)

        try:
            AdminAuditLog.objects.create(
                actor=request.user,
                action='delete_user',
                target_user=target,
                detail={'username': target.username, 'email': target.email},
            )
        except Exception:
            pass
        target.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UpdateUserRoleView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    throttle_classes = [UserRateThrottle, HotEndpointThrottle]

    @extend_schema(
        parameters=[OpenApiParameter(name='user_id', type=int, location=OpenApiParameter.PATH)],
        request=SetUserRoleRequestSerializer,
        responses=UserListItemSerializer,
    )
    def post(self, request, user_id: int):
        """Set role for a target user (admin only).

        Accepts one of: {'role': 'admin' | 'manager' | 'user'}
        """
        User = get_user_model()
        target = get_object_or_404(User, pk=user_id)

        # Disallow changing your own role to prevent accidental lock-out
        if target.id == request.user.id:
            return Response({"detail": "You cannot change your own role."}, status=status.HTTP_400_BAD_REQUEST)

        ser = SetUserRoleRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        role = ser.validated_data['role']

        # Prevent demoting the last admin (no remaining is_staff or superuser)
        if role != 'admin':
            # Count other admins excluding the target
            remaining_admins = User.objects.filter(Q(is_staff=True) | Q(is_superuser=True)).exclude(pk=target.id).count()
            # If target is currently an admin and would be demoted, ensure others remain
            if (target.is_staff or target.is_superuser) and remaining_admins == 0:
                return Response({"detail": "At least one admin must remain. Demote another user first or promote someone else to admin."}, status=status.HTTP_400_BAD_REQUEST)

        # Update flags and groups atomically-ish
        from django.contrib.auth.models import Group
        try:
            # Remove from known role groups if they exist
            for gname in ('Admin', 'Manager', 'User'):
                try:
                    g = Group.objects.get(name=gname)
                    target.groups.remove(g)
                except Group.DoesNotExist:
                    pass

            if role == 'admin':
                target.is_staff = True
                target.save(update_fields=["is_staff"])
                try:
                    g = Group.objects.get(name='Admin')
                    target.groups.add(g)
                except Group.DoesNotExist:
                    pass
            elif role == 'manager':
                target.is_staff = False
                target.save(update_fields=["is_staff"])
                try:
                    g = Group.objects.get(name='Manager')
                    target.groups.add(g)
                except Group.DoesNotExist:
                    pass
            else:
                target.is_staff = False
                target.save(update_fields=["is_staff"])
                try:
                    g = Group.objects.get(name='User')
                    target.groups.add(g)
                except Group.DoesNotExist:
                    pass
        finally:
            try:
                AdminAuditLog.objects.create(
                    actor=request.user,
                    action='set_role',
                    target_user=target,
                    detail={'role': role},
                )
            except Exception:
                pass

        # Build response consistent with ListUsersView
        try:
            group_names = set(target.groups.values_list('name', flat=True))
        except Exception:
            group_names = set()
        derived_role = 'admin' if (target.is_staff or target.is_superuser) else ('manager' if 'Manager' in group_names else 'user')

        person = None
        try:
            prof = getattr(target, 'profile', None)
            if prof and getattr(prof, 'person', None):
                person = {'id': prof.person.id, 'name': prof.person.name}
        except Exception:
            person = None

        data = {
            'id': target.id,
            'username': target.username,
            'email': target.email,
            'is_staff': target.is_staff,
            'is_superuser': target.is_superuser,
            'groups': sorted(list(group_names)),
            'role': derived_role,
            'person': person,
        }
        return Response(data)


class NotificationPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=NotificationPreferencesSerializer)
    def get(self, request):
        pref, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return Response(NotificationPreferencesSerializer.from_model(pref))

    @extend_schema(request=NotificationPreferencesSerializer, responses=NotificationPreferencesSerializer)
    def put(self, request):
        pref, _ = NotificationPreference.objects.get_or_create(user=request.user)
        ser = NotificationPreferencesSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        pref.email_pre_deliverable_reminders = data['emailPreDeliverableReminders']
        pref.reminder_days_before = data['reminderDaysBefore']
        pref.daily_digest = data['dailyDigest']
        pref.save(update_fields=['email_pre_deliverable_reminders', 'reminder_days_before', 'daily_digest', 'updated_at'])
        return Response(NotificationPreferencesSerializer.from_model(pref))


class AdminAuditLogsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    throttle_classes = [UserRateThrottle]

    @extend_schema(parameters=[OpenApiParameter(name='limit', type=int, required=False)], responses=AdminAuditLogSerializer(many=True))
    def get(self, request):
        """Read-only endpoint for recent admin audit logs (admin only)."""
        try:
            limit = int(request.query_params.get('limit', '50'))
        except Exception:
            limit = 50
        limit = max(1, min(500, limit))
        qs = AdminAuditLog.objects.select_related('actor', 'target_user').all()[:limit]
        ser = AdminAuditLogSerializer(qs, many=True)
        return Response(ser.data)


class PasswordResetRequestView(APIView):
    permission_classes = []  # Allow anonymous requests
    throttle_classes = [UserRateThrottle]

    @extend_schema(request=PasswordResetRequestSerializer, responses={204: None})
    def post(self, request):
        """Request a password reset by email. Always returns 204.

        If a user with the email exists, sends a reset link with uid/token.
        """
        ser = PasswordResetRequestSerializer(data=request.data)
        if not ser.is_valid():
            # avoid user enumeration; return 204 regardless
            return Response(status=status.HTTP_204_NO_CONTENT)
        email = (ser.validated_data['email'] or '').strip().lower()
        User = get_user_model()
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)

        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        base = getattr(django_settings, 'APP_BASE_URL', 'http://localhost:3000').rstrip('/')
        link = f"{base}/reset-password?uid={uidb64}&token={token}"
        subject = 'Password reset requested'
        body = (
            f"A password reset was requested for your account.\n\n"
            f"If you made this request, open the link below to set a new password:\n{link}\n\n"
            f"If you did not request this, you can ignore this email."
        )
        try:
            from django.core.mail import send_mail
            send_mail(subject, body, getattr(django_settings, 'DEFAULT_FROM_EMAIL', None), [email])
        except Exception:
            # Do not leak errors to client; rely on logs/Sentry
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(APIView):
    permission_classes = []  # Anonymous; guarded by token
    throttle_classes = [UserRateThrottle, HotEndpointThrottle]

    @extend_schema(request=PasswordResetConfirmSerializer, responses={204: None})
    def post(self, request):
        """Confirm password reset with uid/token and set a new password."""
        ser = PasswordResetConfirmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        uid = ser.validated_data['uid']
        token = ser.validated_data['token']
        new_password = ser.validated_data['newPassword']
        User = get_user_model()
        try:
            uid_int = int(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=uid_int)
        except Exception:
            return Response({"detail": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST)
        if not default_token_generator.check_token(user, token):
            return Response({"detail": "Invalid or expired token."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new_password, user=user)
        except Exception as e:
            return Response({"detail": "Invalid password.", "errors": [str(x) for x in (e.error_list if hasattr(e, 'error_list') else [e])]}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save(update_fields=["password"])
        try:
            AdminAuditLog.objects.create(actor=None, action='password_reset', target_user=user, detail={})
        except Exception:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteUserView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]
    throttle_classes = [UserRateThrottle, HotEndpointThrottle]

    @extend_schema(request=InviteUserRequestSerializer, responses={204: None})
    def post(self, request):
        """Invite a user by email.

        - If the user exists, sends a password set/reset link.
        - If not, creates an account with an unusable password and sends the link.
        - Optionally assigns role and links to a Person.
        """
        data = InviteUserRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data['email'].strip()
        username = (data.validated_data.get('username') or '').strip()
        person_id = data.validated_data.get('personId')
        role = (data.validated_data.get('role') or 'user').strip().lower()

        User = get_user_model()
        created = False
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Derive username if not provided
            if not username:
                username = email.split('@')[0]
            # Ensure uniqueness
            base = username
            n = 1
            while User.objects.filter(username=username).exists():
                n += 1
                username = f"{base}{n}"
            user = User.objects.create_user(username=username, email=email)
            user.set_unusable_password()
            # Assign role flags/groups
            from django.contrib.auth.models import Group
            if role == 'admin':
                user.is_staff = True
                user.save(update_fields=["password", "is_staff"])
                try:
                    admin_group = Group.objects.get(name='Admin')
                    user.groups.add(admin_group)
                except Group.DoesNotExist:
                    pass
            elif role == 'manager':
                user.is_staff = False
                user.save(update_fields=["password", "is_staff"])
                try:
                    mgr_group = Group.objects.get(name='Manager')
                    user.groups.add(mgr_group)
                except Group.DoesNotExist:
                    pass
            else:
                user.is_staff = False
                user.save(update_fields=["password", "is_staff"])
                try:
                    user_group = Group.objects.get(name='User')
                    user.groups.add(user_group)
                except Group.DoesNotExist:
                    pass
            # Ensure profile exists and optionally link Person
            profile, _ = UserProfile.objects.get_or_create(user=user)
            if person_id not in (None, ""):
                try:
                    with transaction.atomic():
                        person = get_object_or_404(Person, pk=person_id)
                        existing = UserProfile.objects.select_for_update().filter(person_id=person.id).exclude(user_id=user.id)
                        if existing.exists():
                            return Response({"detail": "This person is already linked to another user."}, status=status.HTTP_409_CONFLICT)
                        profile.person = person
                        profile.save(update_fields=["person", "updated_at"])
                except IntegrityError:
                    return Response({"detail": "Unable to link. This person may already be linked."}, status=status.HTTP_409_CONFLICT)
            try:
                AdminAuditLog.objects.create(actor=request.user, action='invite_user', target_user=user, detail={'role': role, 'personId': person_id})
            except Exception:
                pass
            created = True

        # Send password set link (same as reset)
        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        base = getattr(django_settings, 'APP_BASE_URL', 'http://localhost:3000').rstrip('/')
        link = f"{base}/set-password?uid={uidb64}&token={token}"
        subject = 'You are invited to Workload Tracker'
        body = (
            f"You've been invited to Workload Tracker.\n\n"
            f"To complete setup, choose your password using the link below:\n{link}\n\n"
            f"If you did not expect this invitation, you can ignore this message."
        )
        try:
            from django.core.mail import send_mail
            send_mail(subject, body, getattr(django_settings, 'DEFAULT_FROM_EMAIL', None), [email])
        except Exception:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)
