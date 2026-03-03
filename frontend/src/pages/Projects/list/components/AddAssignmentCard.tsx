import React from 'react';
import RoleDropdown from '@/roles/components/RoleDropdown';
import type { AddAssignmentCardProps } from '@/pages/Projects/list/components/projectDetailsPanel.types';

const AddAssignmentCard: React.FC<AddAssignmentCardProps> = ({
  addAssignmentState,
  onPersonSearch,
  onPersonSearchFocus,
  onPersonSearchKeyDown,
  srAnnouncement,
  personSearchResults,
  selectedPersonIndex,
  onPersonSelect,
  onRoleSelectNew,
  onRolePlaceholderSelect,
  onSaveAssignment,
  onCancelAddAssignment,
  addRoles,
  roleMatches,
  isPersonSearchOpen,
  personSearchDropdownAbove,
  personSearchInputRef,
  className,
}) => {
  const [openAddRole, setOpenAddRole] = React.useState(false);
  const addRoleBtnRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <div className={`bg-[var(--card)] border border-[var(--border)] rounded shadow-sm p-3 ${className || ''}`} data-testid="add-assignment-card">
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div className="text-[var(--muted)] text-xs uppercase font-medium">PERSON</div>
        <div className="text-[var(--muted)] text-xs uppercase font-medium">ROLE</div>
        <div className="text-[var(--muted)] text-xs uppercase font-medium">ACTIONS</div>
      </div>
      <div className="relative">
        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="relative">
            <input
              type="text"
              placeholder="Start typing name or role..."
              value={addAssignmentState.personSearch}
              onChange={(e) => onPersonSearch(e.target.value)}
              onFocus={onPersonSearchFocus}
              onKeyDown={onPersonSearchKeyDown}
              role="combobox"
              aria-expanded={isPersonSearchOpen}
              aria-haspopup="listbox"
              aria-owns="person-search-results"
              aria-describedby="person-search-help"
              className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
              autoFocus
              ref={personSearchInputRef}
            />
            <div id="person-search-help" className="sr-only">
              Search for people to assign to this project. Use arrow keys to navigate results.
            </div>
            <div aria-live="polite" aria-atomic="true" className="sr-only">
              {srAnnouncement}
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenAddRole((v) => !v)}
              className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-left text-[var(--text)] hover:bg-[var(--cardHover)]"
              aria-haspopup="listbox"
              aria-expanded={openAddRole}
              ref={addRoleBtnRef}
            >
              {addAssignmentState.roleOnProject || 'Set role'}
            </button>
            {openAddRole && (
              <RoleDropdown
                roles={addRoles as any}
                currentId={null}
                onSelect={(id, name) => {
                  onRoleSelectNew(id, name);
                }}
                onClose={() => setOpenAddRole(false)}
                labelledById={undefined}
                anchorRef={addRoleBtnRef}
              />
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={onSaveAssignment}
              disabled={!addAssignmentState.selectedPerson && !addAssignmentState.roleOnProjectId}
              className="px-2 py-1 text-xs rounded border bg-[var(--primary)] border-[var(--primary)] text-white hover:bg-[var(--primaryHover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
            <button
              onClick={onCancelAddAssignment}
              className="px-2 py-1 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
        {isPersonSearchOpen && (
          <div className={`absolute left-0 right-0 z-50 ${personSearchDropdownAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
            <div id="person-search-results" role="listbox" className="bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg max-h-56 overflow-y-auto">
              {personSearchResults.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  People
                </div>
              )}
              {personSearchResults.map((person: any, index: number) => (
                <button
                  key={person.id}
                  onClick={() => onPersonSelect(person)}
                  className={`w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
                    selectedPersonIndex === index ? 'bg-[var(--surfaceOverlay)] border-[var(--primary)]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{person.name}</div>
                    {person.hasSkillMatch && (
                      <span className="text-xs px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Skill Match</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-[var(--muted)]">{person.role}</div>
                    {person.availableHours !== undefined && (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-1 py-0.5 rounded ${
                            person.utilizationPercent > 100
                              ? 'text-red-400 bg-red-500/20'
                              : person.utilizationPercent > 85
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
              ))}
              {roleMatches.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  Roles
                </div>
              )}
              {roleMatches.map((match) => (
                <button
                  key={`${match.deptId}-${match.role.id}`}
                  onClick={() => onRolePlaceholderSelect(match.role)}
                  className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{`<${match.role.name}>`}</div>
                    <div className="text-[10px] text-[var(--muted)]">{match.deptName}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddAssignmentCard;
