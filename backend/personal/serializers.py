from rest_framework import serializers
from datetime import date

from deliverables.serializers import PreDeliverableItemSerializer


class PersonalSummarySerializer(serializers.Serializer):
    personId = serializers.IntegerField()
    currentWeekKey = serializers.CharField()
    utilizationPercent = serializers.FloatField()
    allocatedHours = serializers.FloatField()
    availableHours = serializers.FloatField()


class PersonalAlertsSerializer(serializers.Serializer):
    overallocatedNextWeek = serializers.BooleanField()
    underutilizedNext4Weeks = serializers.BooleanField()
    overduePreItems = serializers.IntegerField()


class PersonalProjectItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(allow_null=True)
    client = serializers.CharField(allow_null=True, required=False)
    status = serializers.CharField(allow_null=True, required=False)
    nextDeliverableDate = serializers.DateField(allow_null=True, required=False)


class PersonalDeliverableItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    project = serializers.IntegerField()
    projectName = serializers.CharField(allow_null=True)
    title = serializers.CharField()
    date = serializers.DateField(allow_null=True)
    isCompleted = serializers.BooleanField()


class PersonalScheduleSerializer(serializers.Serializer):
    weekKeys = serializers.ListField(child=serializers.CharField())
    weekTotals = serializers.DictField(child=serializers.FloatField())
    weeklyCapacity = serializers.IntegerField()


class PersonalWorkSerializer(serializers.Serializer):
    summary = PersonalSummarySerializer()
    alerts = PersonalAlertsSerializer()
    projects = PersonalProjectItemSerializer(many=True)
    deliverables = PersonalDeliverableItemSerializer(many=True)
    preItems = PreDeliverableItemSerializer(many=True)
    schedule = PersonalScheduleSerializer()
