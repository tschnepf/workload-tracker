/**
 * Skills Autocomplete Component - Following existing role autocomplete pattern
 * Based on ProjectsList.tsx role search implementation (Line 912-937)
 */

import React, { useState, useEffect } from 'react';
import { SkillTag, PersonSkill } from '@/types/models';
import { skillTagsApi } from '@/services/api';

interface SkillsAutocompleteProps {
  selectedSkills: PersonSkill[];
  onSkillsChange: (skills: PersonSkill[]) => void;
  skillType?: 'strength' | 'development' | 'learning' | 'all';
  placeholder?: string;
  className?: string;
}

const SkillsAutocomplete: React.FC<SkillsAutocompleteProps> = ({
  selectedSkills,
  onSkillsChange,
  skillType = 'all',
  placeholder = "Add skills...",
  className = "w-full px-2 py-1 text-xs bg-[#2d2d30] border border-[#3e3e42] rounded text-[#cccccc] placeholder-[#969696] focus:border-[#007acc] focus:outline-none"
}) => {
  const [skillSearch, setSkillSearch] = useState('');
  const [skillResults, setSkillResults] = useState<SkillTag[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Search skills using real API
  const searchSkills = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSkillResults([]);
      setShowDropdown(false);
      return;
    }

    try {
      const response = await skillTagsApi.list({ search: searchTerm });
      const filtered = response.results.filter(skill =>
        !selectedSkills.some(selected => selected.skillTagName === skill.name)
      ).slice(0, 5);

      setSkillResults(filtered);
      setShowDropdown(filtered.length > 0);
    } catch (error) {
      console.error('Error searching skills:', error);
      setSkillResults([]);
      setShowDropdown(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchSkills(skillSearch);
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [skillSearch, selectedSkills]);

  const handleSkillSelect = (skill: SkillTag) => {
    const newSkill: PersonSkill = {
      id: 0, // Will be set by backend
      person: 0, // Will be set by parent component
      skillTagId: skill.id,
      skillTagName: skill.name,
      skillType: skillType === 'all' ? 'strength' : skillType,
      proficiencyLevel: 'intermediate',
      notes: '',
      lastUsed: null,
      createdAt: '',
      updatedAt: ''
    };

    onSkillsChange([...selectedSkills, newSkill]);
    setSkillSearch('');
    setShowDropdown(false);
  };

  const handleSkillRemove = (skillToRemove: PersonSkill) => {
    onSkillsChange(selectedSkills.filter(skill => 
      skill.skillTagName !== skillToRemove.skillTagName
    ));
  };

  const getSkillTypeColor = (type: string) => {
    switch (type) {
      case 'strength': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'development': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'learning': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-2">
      {/* Search Input - Following exact pattern from ProjectsList role search */}
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={skillSearch}
          onChange={(e) => setSkillSearch(e.target.value)}
          className={className}
        />
        
        {/* Search Results Dropdown - Same styling as existing */}
        {showDropdown && skillResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 max-h-32 overflow-y-auto">
            {skillResults.map((skill) => (
              <button
                key={skill.id}
                onClick={() => handleSkillSelect(skill)}
                className="w-full text-left px-2 py-1 text-xs hover:bg-[#3e3e42] transition-colors text-[#cccccc] border-b border-[#3e3e42] last:border-b-0"
              >
                <div className="font-medium">{skill.name}</div>
                {skill.category && (
                  <div className="text-[#969696]">{skill.category}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Skills Tags */}
      <div className="flex flex-wrap gap-1">
        {selectedSkills.map((skill, index) => (
          <div
            key={`${skill.skillTagName}-${index}`}
            className={`px-2 py-1 rounded-full border text-xs font-medium flex items-center gap-1 ${getSkillTypeColor(skill.skillType)}`}
          >
            {skill.skillTagName}
            <button
              onClick={() => handleSkillRemove(skill)}
              className="hover:opacity-80 transition-opacity"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SkillsAutocomplete;