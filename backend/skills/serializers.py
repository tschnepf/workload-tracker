"""
Skills serializers - CRITICAL: snake_case → camelCase transformation
Following established naming convention patterns from other apps
"""

from rest_framework import serializers
from .models import SkillTag, PersonSkill

class SkillTagSerializer(serializers.ModelSerializer):
    """Skill tag serializer with camelCase field names"""
    isActive = serializers.BooleanField(source='is_active', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)
    
    class Meta:
        model = SkillTag
        fields = ['id', 'name', 'category', 'description', 'isActive', 'createdAt', 'updatedAt']

class PersonSkillSerializer(serializers.ModelSerializer):
    """Person skill serializer with camelCase field names and related data"""
    skillTagName = serializers.CharField(source='skill_tag.name', read_only=True)
    skillTagId = serializers.IntegerField(source='skill_tag.id', write_only=True)
    skillType = serializers.CharField(source='skill_type')
    proficiencyLevel = serializers.CharField(source='proficiency_level')
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