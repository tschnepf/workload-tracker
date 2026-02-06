from rest_framework import serializers
from .models import Vertical


class VerticalSerializer(serializers.ModelSerializer):
    """Vertical serializer with camelCase field mapping"""
    shortName = serializers.CharField(source='short_name', required=False, allow_blank=True)
    isActive = serializers.BooleanField(source='is_active', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = Vertical
        fields = [
            'id',
            'name',
            'shortName',
            'description',
            'isActive',
            'createdAt',
            'updatedAt',
        ]
