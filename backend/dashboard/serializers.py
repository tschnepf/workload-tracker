from rest_framework import serializers


class DashboardSummarySerializer(serializers.Serializer):
    total_people = serializers.IntegerField()
    avg_utilization = serializers.FloatField()
    peak_utilization = serializers.FloatField()
    peak_person = serializers.CharField(allow_null=True, required=False)
    total_assignments = serializers.IntegerField()
    overallocated_count = serializers.IntegerField()


class UtilizationDistributionSerializer(serializers.Serializer):
    underutilized = serializers.IntegerField()
    optimal = serializers.IntegerField()
    high = serializers.IntegerField()
    overallocated = serializers.IntegerField()


class TeamOverviewItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    role = serializers.CharField()
    utilization_percent = serializers.FloatField()
    allocated_hours = serializers.FloatField()
    capacity = serializers.IntegerField()
    is_overallocated = serializers.BooleanField()
    peak_utilization_percent = serializers.FloatField()
    peak_week = serializers.CharField()
    is_peak_overallocated = serializers.BooleanField()


class AvailablePersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    available_hours = serializers.FloatField()
    utilization_percent = serializers.FloatField()


class RecentAssignmentSerializer(serializers.Serializer):
    person = serializers.CharField()
    project = serializers.CharField()
    created = serializers.CharField()


class DashboardResponseSerializer(serializers.Serializer):
    summary = DashboardSummarySerializer()
    utilization_distribution = UtilizationDistributionSerializer()
    team_overview = TeamOverviewItemSerializer(many=True)
    available_people = AvailablePersonSerializer(many=True)
    recent_assignments = RecentAssignmentSerializer(many=True)

