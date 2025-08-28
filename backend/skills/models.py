"""
Skills models - Complete schema for skills tagging system
Supports tagging people with strengths, development areas, and learning goals
"""

from django.db import models

class SkillTag(models.Model):
    """Skill tags - reusable skills that can be assigned to people"""
    name = models.CharField(max_length=100, unique=True)  # "Heat Calcs", "Lighting Design"
    category = models.CharField(max_length=50, blank=True)  # "Technical", "Design", "Management"
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Skill Tag'
        verbose_name_plural = 'Skill Tags'

    def __str__(self):
        return self.name

class PersonSkill(models.Model):
    """Junction table linking people to skills with proficiency and type"""
    SKILL_TYPE_CHOICES = [
        ('strength', 'Strength'),           # Good at this
        ('development', 'Development'),     # Areas for improvement  
        ('learning', 'Learning'),          # Currently learning
    ]
    
    PROFICIENCY_CHOICES = [
        ('beginner', 'Beginner'),
        ('intermediate', 'Intermediate'), 
        ('advanced', 'Advanced'),
        ('expert', 'Expert'),
    ]
    
    person = models.ForeignKey('people.Person', on_delete=models.CASCADE, related_name='skills')
    skill_tag = models.ForeignKey(SkillTag, on_delete=models.CASCADE, related_name='person_skills')
    skill_type = models.CharField(max_length=20, choices=SKILL_TYPE_CHOICES)
    proficiency_level = models.CharField(max_length=20, choices=PROFICIENCY_CHOICES)
    notes = models.TextField(blank=True)
    last_used = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        # Allow same skill in multiple categories (strengths, development, learning)
        unique_together = ['person', 'skill_tag', 'skill_type']
        ordering = ['skill_type', 'skill_tag__name']
        verbose_name = 'Person Skill'
        verbose_name_plural = 'Person Skills'

    def __str__(self):
        return f"{self.person.name} - {self.skill_tag.name} ({self.get_skill_type_display()})"
