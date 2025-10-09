from rest_framework import serializers
from projects.models import ProjectRole


def normalize_name(name: str) -> str:
    return ' '.join((name or '').strip().split()).lower()


class ProjectRoleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectRole
        fields = ['id', 'name', 'is_active', 'sort_order', 'department_id']


class ProjectRoleCreateSerializer(serializers.Serializer):
    department = serializers.IntegerField()
    name = serializers.CharField(max_length=100)
    sortOrder = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        dept_id = attrs.get('department')
        name = attrs.get('name')
        if not isinstance(dept_id, int) or dept_id <= 0:
            raise serializers.ValidationError({'department': 'invalid'})
        norm = normalize_name(name)
        if not norm:
            raise serializers.ValidationError({'name': 'empty'})
        # Uniqueness check
        if ProjectRole.objects.filter(department_id=dept_id, normalized_name=norm).exists():
            raise serializers.ValidationError({'name': 'conflict'})
        attrs['normalized_name'] = norm
        return attrs


class ProjectRoleUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=False, max_length=100)
    isActive = serializers.BooleanField(required=False)
    sortOrder = serializers.IntegerField(required=False)

    def validate(self, attrs):
        # Normalize and check uniqueness if name provided
        name = attrs.get('name')
        if name is not None:
            norm = normalize_name(name)
            if not norm:
                raise serializers.ValidationError({'name': 'empty'})
            attrs['normalized_name'] = norm
        return attrs

