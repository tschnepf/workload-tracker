"""
Read-only serializers for weekly assignment snapshots and membership events.
"""
from rest_framework import serializers
from .models import WeeklyAssignmentSnapshot, AssignmentMembershipEvent


class WeeklyAssignmentSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyAssignmentSnapshot
        read_only_fields = [f.name for f in WeeklyAssignmentSnapshot._meta.fields]
        fields = [f.name for f in WeeklyAssignmentSnapshot._meta.fields]


class AssignmentMembershipEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssignmentMembershipEvent
        read_only_fields = [f.name for f in AssignmentMembershipEvent._meta.fields]
        fields = [f.name for f in AssignmentMembershipEvent._meta.fields]

