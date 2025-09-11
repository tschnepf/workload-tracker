from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status
from rest_framework.throttling import UserRateThrottle, ScopedRateThrottle

from .models import UserProfile, AdminAuditLog
from .serializers import UserProfileSerializer, AdminAuditLogSerializer
from people.models import Person
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password


class HotEndpointThrottle(ScopedRateThrottle):
    scope = 'hot_endpoint'


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """Return the current user's profile with settings and optional person link."""
    # Ensure profile exists (signals and data migration should cover this)
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    serializer = UserProfileSerializer(profile)
    return Response(serializer.data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
@throttle_classes([UserRateThrottle])
def settings_view(request):
    """Update settings for the current user's profile (partial)."""
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    serializer = UserProfileSerializer(profile, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([UserRateThrottle])
def link_person(request):
    """Link or unlink the current user's profile to a Person.

    Body: { "person_id": number | null }
    - If person_id is null, unlink.
    - Else link to the specified person subject to guardrails.
    """
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
        # Handle race collisions on OneToOne
        return Response({
            "detail": "Unable to link. This person may already be linked."
        }, status=status.HTTP_409_CONFLICT)

    serializer = UserProfileSerializer(profile)
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([UserRateThrottle, HotEndpointThrottle])
def change_password(request):
    """Change password for the authenticated user.

    Body: { "currentPassword": str, "newPassword": str }
    """
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
    # Audit: user changed own password
    try:
        AdminAuditLog.objects.create(
            actor=request.user,
            action='change_password',
            target_user=request.user,
            detail={},
        )
    except Exception:
        pass
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
@throttle_classes([UserRateThrottle, HotEndpointThrottle])
def create_user(request):
    """Create a new user (staff only) and optionally link to a Person.

    Body: { "username": str, "email": str, "password": str, "personId": number|null, "role": "admin"|"manager"|"user" }
    """
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
                # Uniqueness
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
            detail={
                'role': role,
                'personId': person_id,
            },
        )
    except Exception:
        pass
    ser = UserProfileSerializer(profile)
    return Response(ser.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
@throttle_classes([UserRateThrottle, HotEndpointThrottle])
def set_password(request):
    """Set password for a target user (staff only).

    Body: { "userId": number, "newPassword": str }
    """
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
    # Audit: admin set password for another user
    try:
        AdminAuditLog.objects.create(
            actor=request.user,
            action='set_password',
            target_user=target,
            detail={},
        )
    except Exception:
        pass
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"]) 
@permission_classes([IsAuthenticated, IsAdminUser])
@throttle_classes([UserRateThrottle])
def list_users(request):
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


@api_view(["DELETE"]) 
@permission_classes([IsAuthenticated, IsAdminUser])
@throttle_classes([UserRateThrottle, HotEndpointThrottle])
def delete_user(request, user_id: int):
    """Delete a user account (admin only).

    Guards:
    - Prevent deleting own account.
    - Prevent deleting a superuser unless the requester is a superuser.
    """
    User = get_user_model()
    target = get_object_or_404(User, pk=user_id)

    if target.id == request.user.id:
        return Response({"detail": "You cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)

    if target.is_superuser and not request.user.is_superuser:
        return Response({"detail": "Only a superuser may delete another superuser."}, status=status.HTTP_403_FORBIDDEN)

    # Audit before delete to retain target id/email in detail
    try:
        AdminAuditLog.objects.create(
            actor=request.user,
            action='delete_user',
            target_user=target,
            detail={
                'username': target.username,
                'email': target.email,
            },
        )
    except Exception:
        pass
    target.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"]) 
@permission_classes([IsAuthenticated, IsAdminUser])
@throttle_classes([UserRateThrottle])
def admin_audit_logs(request):
    """Read-only endpoint for recent admin audit logs (admin only).

    Query params:
    - limit: int (default 50, max 500)
    """
    try:
        limit = int(request.query_params.get('limit', '50'))
    except Exception:
        limit = 50
    limit = max(1, min(500, limit))
    qs = AdminAuditLog.objects.select_related('actor', 'target_user').all()[:limit]
    ser = AdminAuditLogSerializer(qs, many=True)
    return Response(ser.data)
