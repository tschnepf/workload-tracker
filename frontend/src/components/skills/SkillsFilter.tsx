/**
 * Skills Filter Component - Advanced skills filtering for search and filtering
 */

import React, { useState, useEffect, useRef } from 'react';
import { SkillTag } from '@/types/models';
import { skillTagsApi } from '@/services/api';

interface SkillsFilterProps {
  selectedSkills: string[];
  onSkillsChange: (skills: string[]) => void;
  placeholder?: string;
  className?: string;
  maxDisplayedSkills?: number;
}

const SkillsFilter: React.FC<SkillsFilterProps> = ({
  selectedSkills,
  onSkillsChange,
  placeholder = "Filter by skills...",
  className = "",
  maxDisplayedSkills = 5
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableSkills, setAvailableSkills] = useState<SkillTag[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadSkills = async () => {
    try {
      setLoading(true);
      const response = await skillTagsApi.list();
      setAvailableSkills(response.results || []);
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSkills = availableSkills.filter(skill =>
    skill.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !selectedSkills.includes(skill.name)
  );

  const handleSkillSelect = (skillName: string) => {
    onSkillsChange([...selectedSkills, skillName]);
    setSearchTerm('');
  };

  const handleSkillRemove = (skillName: string) => {
    onSkillsChange(selectedSkills.filter(skill => skill !== skillName));
  };

  const handleClearAll = () => {
    onSkillsChange([]);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input Area */}
      <div
        className="min-h-[42px] px-3 py-2 bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cccccc] focus-within:border-[#007acc] cursor-text"
        onClick={() => setIsOpen(true)}
      >
        {/* Selected Skills Tags */}
        <div className="flex flex-wrap gap-1 mb-1">
          {selectedSkills.slice(0, maxDisplayedSkills).map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs"
            >
              {skill}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSkillRemove(skill);
                }}
                className="hover:text-blue-300 transition-colors"
              >
                ×
              </button>
            </span>
          ))}
          
          {selectedSkills.length > maxDisplayedSkills && (
            <span className="px-2 py-1 bg-slate-500/20 text-slate-400 rounded text-xs">
              +{selectedSkills.length - maxDisplayedSkills} more
            </span>
          )}
        </div>
        
        {/* Search Input */}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedSkills.length > 0 ? "Add more skills..." : placeholder}
          className="bg-transparent border-none outline-none text-[#cccccc] placeholder-[#969696] w-full text-sm"
        />
      </div>
      
      {/* Clear All Button */}
      {selectedSkills.length > 0 && (
        <button
          onClick={handleClearAll}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[#969696] hover:text-[#cccccc] text-sm"
        >
          Clear all
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-48 bg-[#2d2d30] border border-[#3e3e42] rounded shadow-lg z-50 overflow-auto">
          {loading && (
            <div className="px-3 py-2 text-sm text-[#969696]">Loading skills...</div>
          )}
          
          {!loading && filteredSkills.length === 0 && searchTerm && (
            <div className="px-3 py-2 text-sm text-[#969696]">
              No skills found matching "{searchTerm}"
            </div>
          )}
          
          {!loading && filteredSkills.length === 0 && !searchTerm && selectedSkills.length === availableSkills.length && (
            <div className="px-3 py-2 text-sm text-[#969696]">
              All available skills selected
            </div>
          )}
          
          {filteredSkills.slice(0, 10).map((skill) => (
            <button
              key={skill.id}
              onClick={() => handleSkillSelect(skill.name)}
              className="w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#3e3e42] transition-colors"
            >
              <div className="flex items-center justify-between">
                <span>{skill.name}</span>
                {skill.category && (
                  <span className="text-xs text-[#969696]">{skill.category}</span>
                )}
              </div>
            </button>
          ))}
          
          {filteredSkills.length > 10 && (
            <div className="px-3 py-2 text-xs text-[#969696] border-t border-[#3e3e42]">
              {filteredSkills.length - 10} more skills available...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SkillsFilter;