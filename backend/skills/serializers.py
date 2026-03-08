"""
Skills serializers - CRITICAL: snake_case → camelCase transformation
Following established naming convention patterns from other apps
"""

from rest_framework import serializers
from .models import SkillTag, PersonSkill
from departments.models import Department

class SkillTagSerializer(serializers.ModelSerializer):
    """Skill tag serializer with camelCase field names"""
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    departmentName = serializers.CharField(source='department.name', read_only=True, allow_null=True)
    scopeType = serializers.SerializerMethodField()
    isActive = serializers.BooleanField(source='is_active', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    def get_scopeType(self, obj):
        return 'global' if getattr(obj, 'department_id', None) is None else 'department'
    
    class Meta:
        model = SkillTag
        fields = [
            'id',
            'name',
            'department',
            'departmentName',
            'scopeType',
            'category',
            'description',
            'isActive',
            'createdAt',
            'updatedAt',
        ]

class PersonSkillSerializer(serializers.ModelSerializer):
    """Person skill serializer with camelCase field names and related data"""
    skillTagName = serializers.CharField(source='skill_tag.name', read_only=True)
    skillTagId = serializers.IntegerField(source='skill_tag.id')
    skillType = serializers.ChoiceField(
        source='skill_type',
        choices=[choice[0] for choice in PersonSkill.SKILL_TYPE_CHOICES],
    )
    proficiencyLevel = serializers.ChoiceField(
        source='proficiency_level',
        choices=[choice[0] for choice in PersonSkill.PROFICIENCY_CHOICES],
    )
    lastUsed = serializers.DateField(source='last_used', allow_null=True, required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = PersonSkill
        fields = [
            'id', 'person', 'skillTagId', 'skillTagName', 'skillType', 
            'proficiencyLevel', 'notes', 'lastUsed', 'createdAt', 'updatedAt'
        ]
    
    def create(self, validated_data):
        """Handle skillTagId during creation"""
        skill_tag_id = validated_data.pop('skill_tag', {}).get('id')
        if skill_tag_id:
            validated_data['skill_tag_id'] = skill_tag_id
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Handle skillTagId during updates"""
        skill_tag_id = validated_data.pop('skill_tag', {}).get('id')
        if skill_tag_id:
            validated_data['skill_tag_id'] = skill_tag_id
        return super().update(instance, validated_data)

class PersonSkillSummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer for person skill summaries"""
    skillTagName = serializers.CharField(source='skill_tag.name', read_only=True)
    skillType = serializers.CharField(source='skill_type', read_only=True)
    proficiencyLevel = serializers.CharField(source='proficiency_level', read_only=True)
    
    class Meta:
        model = PersonSkill
        fields = ['skillTagName', 'skillType', 'proficiencyLevel']
