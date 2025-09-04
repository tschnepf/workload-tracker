from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.throttling import UserRateThrottle

from .models import UserProfile
from .serializers import UserProfileSerializer
from people.models import Person


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

