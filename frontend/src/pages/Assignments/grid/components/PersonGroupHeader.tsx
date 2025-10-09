import React from 'react';
import type { Assignment, Person } from '@/types/models';

export interface PersonWithAssignments extends Person {
  assignments: Assignment[];
  isExpanded: boolean;
}

export interface PersonGroupHeaderProps {
  person: PersonWithAssignments;
  onToggle: () => void;
}

const PersonGroupHeader: React.FC<PersonGroupHeaderProps> = ({ person, onToggle }) => (
  <div className="col-span-2 flex items-center">
    <button
      onClick={onToggle}
      className="flex items-center gap-2 pl-3 pr-2 py-1 w-full text-left hover:bg-[var(--surfaceHover)] transition-all duration-200 rounded-sm"
    >
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[var(--muted)]">
        <svg width="12" height="12" viewBox="0 0 12 12" className={`transition-transform duration-200 ${person.isExpanded ? 'rotate-90' : 'rotate-0'}`}>
          <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[var(--text)] text-sm truncate">{person.name}</div>
        <div className="text-xs text-[var(--muted)]">
          {[
            person.role || undefined,
            person.weeklyCapacity != null ? `${person.weeklyCapacity}h/wk` : undefined,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    </button>
  </div>
);

export default PersonGroupHeader;

