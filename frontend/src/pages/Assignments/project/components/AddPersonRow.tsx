import React from 'react';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import type { ProjectRole } from '@/roles/api';

type PersonOption = { id: number; name: string; department?: number | null };

const AddPersonRow = ({
  weeks,
  gridTemplate,
  newPersonName,
  onSearchChange,
  personResults,
  roleResults,
  selectedDropdownIndex,
  setSelectedDropdownIndex,
  showPersonDropdown,
  setShowPersonDropdown,
  selectedPerson,
  selectedPersonRole,
  selectedRole,
  onPersonSelect,
  onPersonRoleSelect,
  onRoleSelect,
  onAddPerson,
  onAddRole,
  onAddSelected,
  onCancel,
}: {
  weeks: { date: string; display: string; fullDisplay: string }[];
  gridTemplate: string;
  newPersonName: string;
  onSearchChange: (value: string) => void;
  personResults: Array<PersonOption>;
  roleResults: Array<ProjectRole & { departmentName?: string }>;
  selectedDropdownIndex: number;
  setSelectedDropdownIndex: React.Dispatch<React.SetStateAction<number>>;
  showPersonDropdown: boolean;
  setShowPersonDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  selectedPerson: PersonOption | null;
  selectedPersonRole: ProjectRole | null;
  selectedRole: (ProjectRole & { departmentName?: string }) | null;
  onPersonSelect: (person: PersonOption) => void;
  onPersonRoleSelect: (role: ProjectRole | null) => void;
  onRoleSelect: (role: ProjectRole & { departmentName?: string }) => void;
  onAddPerson: (person: PersonOption, role?: ProjectRole | null) => void;
  onAddRole: (role: ProjectRole & { departmentName?: string }) => void;
  onAddSelected: () => void;
  onCancel: () => void;
}) => {
  const combinedCount = personResults.length + roleResults.length;
  const hasResults = combinedCount > 0;
  const { data: roleOptions = [] } = useProjectRoles(selectedPerson?.department ?? null, { includeInactive: true });
  return (
    <div className="grid gap-px p-1 bg-[var(--card)] border border-[var(--border)]" style={{ gridTemplateColumns: gridTemplate }}>
      <div className="col-span-2 flex flex-col gap-2 py-1 pl-[60px] pr-2 relative">
        <input
          type="text"
          value={newPersonName}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (selectedDropdownIndex >= 0 && selectedDropdownIndex < combinedCount) {
                if (selectedDropdownIndex < personResults.length) {
                  const person = personResults[selectedDropdownIndex];
                  onPersonSelect(person);
                  setShowPersonDropdown(false);
                } else {
                  const roleIndex = selectedDropdownIndex - personResults.length;
                  const role = roleResults[roleIndex];
                  if (role) {
                    onRoleSelect(role);
                    setShowPersonDropdown(false);
                  }
                }
              } else if (selectedPerson || selectedRole) {
                onAddSelected();
              }
            } else if (e.key === 'Escape') {
              onCancel();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (hasResults) {
                setShowPersonDropdown(true);
                setSelectedDropdownIndex((prev) => (prev < combinedCount - 1 ? prev + 1 : prev));
              }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (showPersonDropdown && hasResults) {
                setSelectedDropdownIndex((prev) => (prev > -1 ? prev - 1 : -1));
              }
            }
          }}
          placeholder="Search people or roles..."
          className="w-full px-2 py-1 text-xs bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--focus)] focus:outline-none"
          autoFocus
        />
        {showPersonDropdown && hasResults && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg z-50 max-h-48 overflow-y-auto">
            {personResults.length > 0 && (
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                People
              </div>
            )}
            {personResults.map((person, index) => (
              <button
                key={person.id}
                onClick={() => onPersonSelect(person)}
                className={`w-full text-left px-2 py-1 text-xs transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
                  selectedDropdownIndex === index ? 'bg-[var(--surfaceHover)] border-[var(--primary)]' : 'hover:bg-[var(--surface)]'
                }`}
              >
                <div className="font-medium">{person.name}</div>
              </button>
            ))}
            {roleResults.length > 0 && (
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                Roles
              </div>
            )}
            {roleResults.map((role, index) => {
              const combinedIndex = personResults.length + index;
              return (
                <button
                  key={role.id}
                  onClick={() => onRoleSelect(role)}
                  className={`w-full text-left px-2 py-1 text-xs transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
                    selectedDropdownIndex === combinedIndex ? 'bg-[var(--surfaceHover)] border-[var(--primary)]' : 'hover:bg-[var(--surface)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{role.name}</span>
                    {role.departmentName ? (
                      <span className="text-[10px] text-[var(--muted)]">{role.departmentName}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {selectedPerson ? (
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Role</label>
            <select
              className="flex-1 px-2 py-1 text-xs bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)]"
              value={selectedPersonRole?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                const role = roleOptions.find((r) => r.id === id) || null;
                onPersonRoleSelect(role);
              }}
            >
              <option value="">Unassigned</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="col-span-2 flex items-center justify-center gap-1">
        <button
          className="shrink-0 inline-flex items-center justify-center w-[22px] h-[22px] rounded border border-[var(--border)] bg-green-600 hover:bg-green-500 text-white text-[11px] font-semibold leading-none transition-colors"
          title="Save assignment"
          onClick={onAddSelected}
          disabled={!selectedPerson && !selectedRole}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="shrink-0 inline-flex items-center justify-center w-[22px] h-[22px] rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)] text-[11px] font-semibold leading-none transition-colors"
          title="Cancel"
          onClick={onCancel}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {weeks.map((week) => (
        <div key={week.date} className="flex items-center justify-center">
          <div className="w-12 h-6" />
        </div>
      ))}
    </div>
  );
};

export default AddPersonRow;
