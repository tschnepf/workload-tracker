import React from 'react';
import type { Person } from '@/types/models';

export interface PersonWithAvailability extends Person {
  availableHours?: number;
  utilizationPercent?: number;
  totalHours?: number;
  skillMatchScore?: number;
  hasSkillMatch?: boolean;
}

interface PersonSearchResultProps {
  person: PersonWithAvailability;
  isSelected: boolean;
  onSelect: () => void;
}

const PersonSearchResult: React.FC<PersonSearchResultProps> = ({ person, isSelected, onSelect }) => (
  <button
    onClick={onSelect}
    className={`w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
      isSelected ? 'bg-[var(--surfaceOverlay)] border-[var(--primary)]' : ''
    }`}
  >
    <div className="flex items-center justify-between">
      <div className="font-medium">{person.name}</div>
      {person.hasSkillMatch && (
        <span className="text-xs px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">dYZ_ Skill Match</span>
      )}
    </div>
    <div className="flex justify-between items-center">
      <div className="text-[var(--muted)]">{person.role}</div>
      {person.availableHours !== undefined && (
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-1 py-0.5 rounded ${
              person.utilizationPercent! > 100
                ? 'text-red-400 bg-red-500/20'
                : person.utilizationPercent! > 85
                ? 'text-amber-400 bg-amber-500/20'
                : person.availableHours > 0
                ? 'text-emerald-400 bg-emerald-500/20'
                : 'text-blue-400 bg-blue-500/20'
            }`}
          >
            {person.availableHours}h available
          </span>
          <span className="text-[var(--muted)] text-xs">({person.utilizationPercent}% used)</span>
        </div>
      )}
    </div>
  </button>
);

export default React.memo(PersonSearchResult);

