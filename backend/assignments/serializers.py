"""
Assignment serializers - Retrofitted for weekly hours
RETROFIT: Support weekly hours for 12-week planning horizon
"""

from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Assignment
from projects.models import Project
from skills.serializers import PersonSkillSummarySerializer

class AssignmentSerializer(serializers.ModelSerializer):
    """Assignment serializer with weekly hours support"""
    
    # Weekly hours as the primary field (replaces allocationPercentage)
    weeklyHours = serializers.JSONField(source='weekly_hours')
    projectName = serializers.CharField(source='project_name', max_length=200, required=False)
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all(), required=False, allow_null=True)
    projectDisplayName = serializers.CharField(source='project_display', read_only=True)
    personName = serializers.CharField(source='person.name', read_only=True)
    personWeeklyCapacity = serializers.IntegerField(source='person.weekly_capacity', read_only=True)
    personDepartmentId = serializers.IntegerField(source='person.department_id', read_only=True)
    personSkills = PersonSkillSummarySerializer(source='person.skills', many=True, read_only=True)
    # Department-scoped Project Role fields (FK-based)
    roleOnProjectId = serializers.IntegerField(source='role_on_project_ref_id', required=False, allow_null=True)
    roleName = serializers.SerializerMethodField()
    
    # Calculated fields removed for performance - not used on projects page
    
    # Legacy field - kept for backward compatibility but not used in UI
    allocationPercentage = serializers.IntegerField(source='allocation_percentage', read_only=True)
    
    class Meta:
        model = Assignment
        fields = [
            'id', 
            'person', 
            'personName', 
            'personWeeklyCapacity',
            'personDepartmentId',
            'personSkills',
            'projectName', 
            'project',
            'projectDisplayName',
            'roleOnProjectId',
            'roleName',
            'weeklyHours',
            'allocationPercentage',  # Legacy
            'createdAt', 
            'updatedAt'
        ]
        extra_kwargs = {
            'createdAt': {'source': 'created_at', 'read_only': True},
            'updatedAt': {'source': 'updated_at', 'read_only': True},
        }

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_roleName(self, obj) -> str | None:
        """Prefer FK role name; fallback to legacy role_on_project string."""
        try:
            if getattr(obj, 'role_on_project_ref', None) and obj.role_on_project_ref.name:
                return obj.role_on_project_ref.name
        except Exception:
            pass
        legacy = getattr(obj, 'role_on_project', None)
        return legacy or None
    
    def validate_weeklyHours(self, value):
        """Validate weekly hours data structure and values.

        Over-allocation is allowed; we only check structure, date format, and non-negativity.
        """
        if not isinstance(value, dict):
            raise serializers.ValidationError("Weekly hours must be a dictionary")

        from datetime import datetime, date
        from django.conf import settings
        from core.week_utils import sunday_of_week

        normalized: dict[str, float] = {}
        for week_key, hours in value.items():
            # Validate week key format (should be YYYY-MM-DD)
            try:
                dt = datetime.strptime(week_key, '%Y-%m-%d').date()
            except ValueError:
                raise serializers.ValidationError(f"Invalid week date format: {week_key}. Use YYYY-MM-DD")

            # Validate hours value (non-negative, numeric). No hard caps.
            try:
                hours_float = float(hours)
                if hours_float < 0:
                    raise serializers.ValidationError(f"Hours cannot be negative for week {week_key}")
            except (ValueError, TypeError):
                raise serializers.ValidationError(f"Invalid hours value for week {week_key}: {hours}")

            # Enforce Sunday-canonical keys; optionally coerce during transition window
            sunday = sunday_of_week(dt)
            key_out = sunday.strftime('%Y-%m-%d')
            if key_out != week_key and not settings.FEATURES.get('WEEK_KEYS_TRANSITION_READ_BOTH', True):
                raise serializers.ValidationError(f"Week key {week_key} must be a Sunday (canonical) date")
            normalized[key_out] = normalized.get(key_out, 0.0) + hours_float

        return normalized
    
    def validate(self, attrs):
        """Cross-field validation.

        - Ensure department is set from person if missing.
        - If a role FK is provided, enforce department match at the application level.
        """
        person = self.instance.person if getattr(self, 'instance', None) else attrs.get('person')
        # Prevent assigning projects to inactive people when person is explicitly set/changed
        if attrs.get('person') is not None:
            try:
                if not attrs['person'].is_active:
                    raise serializers.ValidationError({'person': 'Cannot assign projects to inactive people.'})
            except AttributeError:
                pass
        dept = attrs.get('department')
        if dept is None and person is not None:
            # Default department from person
            try:
                attrs['department'] = person.department
            except Exception:
                pass
        role = attrs.get('role_on_project_ref')
        if role is not None:
            # Determine effective department
            effective_dept = attrs.get('department') or (getattr(self.instance, 'department', None) if getattr(self, 'instance', None) else None) or (getattr(person, 'department', None) if person else None)
            if effective_dept is None or role.department_id != getattr(effective_dept, 'id', effective_dept):
                raise serializers.ValidationError({'roleOnProjectId': 'role_department_mismatch'})
        return attrs
    
    def create(self, validated_data):
        """Create assignment with weekly hours and enforce department default."""
        if 'weekly_hours' not in validated_data:
            validated_data['weekly_hours'] = {}
        if not validated_data.get('department') and validated_data.get('person'):
            try:
                validated_data['department'] = validated_data['person'].department
            except Exception:
                pass
        return super().create(validated_data)
    
    def to_representation(self, instance):
        """Add computed fields to the response"""
        data = super().to_representation(instance)
        
        # Add the list of next 12 weeks for the frontend
        data['availableWeeks'] = Assignment.get_next_12_weeks()
        
        return data
