from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.utils import OperationalError, ProgrammingError
from .models import Department
from verticals.models import Vertical
from people.models import Person

class DepartmentSerializer(serializers.ModelSerializer):
    """Department serializer with explicit camelCase field mapping"""
    parentDepartment = serializers.PrimaryKeyRelatedField(
        source='parent_department', 
        queryset=Department.objects.all(), 
        required=False, 
        allow_null=True
    )
    vertical = serializers.PrimaryKeyRelatedField(
        queryset=Vertical.objects.all(),
        required=False,
        allow_null=True,
    )
    verticalName = serializers.CharField(source='vertical.name', read_only=True)
    shortName = serializers.CharField(source='short_name', required=False, allow_blank=True)
    managerName = serializers.CharField(source='manager.name', read_only=True)
    secondaryManagers = serializers.PrimaryKeyRelatedField(
        source='secondary_managers',
        queryset=Person.objects.all(),
        many=True,
        required=False,
    )
    secondaryManagerNames = serializers.SerializerMethodField(read_only=True)
    isActive = serializers.BooleanField(source='is_active')
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = Department
        fields = [
            'id', 
            'name', 
            'shortName',
            'parentDepartment',    
            'vertical',
            'verticalName',
            'manager',
            'managerName',         
            'secondaryManagers',
            'secondaryManagerNames',
            'description',
            'isActive',           
            'createdAt',          
            'updatedAt',          
        ]

    def get_secondaryManagerNames(self, obj):
        try:
            return [p.name for p in obj.secondary_managers.all()]
        except Exception:
            return []

    def to_representation(self, instance):
        """Gracefully degrade if secondary manager m2m table is unavailable.

        This keeps department reads alive in environments where code deploy and DB
        migrations are temporarily out of sync.
        """
        try:
            return super().to_representation(instance)
        except (OperationalError, ProgrammingError):
            return {
                'id': instance.id,
                'name': instance.name,
                'shortName': instance.short_name or '',
                'parentDepartment': instance.parent_department_id,
                'vertical': instance.vertical_id,
                'verticalName': getattr(getattr(instance, 'vertical', None), 'name', None),
                'manager': instance.manager_id,
                'managerName': getattr(getattr(instance, 'manager', None), 'name', None),
                'secondaryManagers': [],
                'secondaryManagerNames': [],
                'description': instance.description or '',
                'isActive': bool(instance.is_active),
                'createdAt': instance.created_at.isoformat() if instance.created_at else None,
                'updatedAt': instance.updated_at.isoformat() if instance.updated_at else None,
            }

    def validate(self, data):
        """Custom validation to prevent circular department hierarchies"""
        parent_department = data.get('parent_department')
        instance = getattr(self, 'instance', None)
        vertical = data.get('vertical')
        manager = data.get('manager', getattr(instance, 'manager', None))
        secondary_managers = data.get('secondary_managers', None)

        if secondary_managers is None and instance is not None:
            secondary_manager_ids = set(instance.secondary_managers.values_list('id', flat=True))
        else:
            secondary_manager_ids = {p.id for p in (secondary_managers or [])}

        if manager and manager.id in secondary_manager_ids:
            raise serializers.ValidationError({
                'secondaryManagers': ['Primary manager cannot also be a secondary manager.']
            })

        if parent_department:
            # Create a temporary instance to test the validation
            temp_instance = Department(
                id=getattr(instance, 'id', None),
                name=data.get('name', getattr(instance, 'name', None)),
                parent_department=parent_department,
                vertical=vertical if vertical is not None else getattr(instance, 'vertical', None),
            )

            try:
                temp_instance.clean()
            except DjangoValidationError as e:
                # Convert Django ValidationError to DRF ValidationError
                raise serializers.ValidationError({
                    'parentDepartment': e.messages
                })

        return data
