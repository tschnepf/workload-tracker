import React from 'react';
import type { Department, Person, Role, PersonSkill } from '@/types/models';
import AutocompleteDropdowns from '@/pages/People/list/components/AutocompleteDropdowns';
import GearMenu from '@/pages/People/list/components/GearMenu';
import DeleteConfirm from '@/pages/People/list/components/DeleteConfirm';
import SkillsEditor from '@/pages/People/list/components/SkillsEditor';

export interface PersonDetailsPanelProps {
  person: Person;
  roles: Role[];
  departments: Department[];
  isUpdating: boolean;
  editingName: boolean;
  editingPersonData: Person | null;
  onFieldChange: (field: keyof Person, value: string | number | boolean | null) => void;
  onSaveField: (field: keyof Person, overrideValue?: any) => Promise<void> | void;
  onEditName: () => void;
  onNameSave: () => Promise<void> | void;
  onNameCancel: () => void;
  showGearMenu: boolean;
  setShowGearMenu: (open: boolean) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (open: boolean) => void;
  onDelete: () => Promise<void> | void;

  // Location autocomplete
  locationInputValue: string;
  setLocationInputValue: (v: string) => void;
  showLocationAutocomplete: boolean;
  setShowLocationAutocomplete: (v: boolean) => void;
  selectedLocationIndex: number;
  setSelectedLocationIndex: (i: number) => void;
  filteredLocations: string[];
  selectLocation: (loc: string) => void;

  // Role autocomplete
  roleInputValue: string;
  setRoleInputValue: (v: string) => void;
  showRoleAutocomplete: boolean;
  setShowRoleAutocomplete: (v: boolean) => void;
  selectedRoleIndex: number;
  setSelectedRoleIndex: (i: number) => void;
  filteredRoles: Role[];
  selectRole: (role: Role) => void;

  // Skills
  editingSkills: boolean;
  onSkillsEdit: () => void;
  onSkillsSave: () => Promise<void> | void;
  onSkillsCancel: () => void;
  skillsData: {
    strengths: PersonSkill[];
    development: PersonSkill[];
    learning: PersonSkill[];
  };
  updateSkillsByType: (type: 'strengths' | 'development' | 'learning', skills: PersonSkill[]) => void;
  editingProficiency: string | null;
  onProficiencyClick: (skill: PersonSkill, skillType: string) => void;
  onProficiencyChange: (skill: PersonSkill, skillType: 'strengths' | 'development' | 'learning', newLevel: string) => void;
  proficiencyLevels: { value: 'beginner' | 'intermediate' | 'advanced' | 'expert'; label: string }[];
}

export default function PersonDetailsPanel(props: PersonDetailsPanelProps) {
  const {
    person,
    roles,
    departments,
    isUpdating,
    editingName,
    editingPersonData,
    onFieldChange,
    onSaveField,
    onEditName,
    onNameSave,
    onNameCancel,
    showGearMenu,
    setShowGearMenu,
    showDeleteConfirm,
    setShowDeleteConfirm,
    onDelete,
    locationInputValue,
    setLocationInputValue,
    showLocationAutocomplete,
    setShowLocationAutocomplete,
    selectedLocationIndex,
    setSelectedLocationIndex,
    filteredLocations,
    selectLocation,
    roleInputValue,
    setRoleInputValue,
    showRoleAutocomplete,
    setShowRoleAutocomplete,
    selectedRoleIndex,
    setSelectedRoleIndex,
    filteredRoles,
    selectRole,
    editingSkills,
    onSkillsEdit,
    onSkillsSave,
    onSkillsCancel,
    skillsData,
    updateSkillsByType,
    editingProficiency,
    onProficiencyClick,
    onProficiencyChange,
    proficiencyLevels,
  } = props;

  return (
    <>
      {/* Person Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            {editingName ? (
              <div className="mb-2">
                <input
                  type="text"
                  value={editingPersonData?.name || ''}
                  onChange={(e) => onFieldChange('name', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onNameSave();
                    else if (e.key === 'Escape') onNameCancel();
                  }}
                  onBlur={onNameSave}
                  disabled={isUpdating}
                  className="text-xl font-bold bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)] focus:border-transparent disabled:opacity-50 w-full"
                  autoFocus
                />
                <div className="text-xs text-[var(--muted)] mt-1">Press Enter to save, Escape to cancel</div>
              </div>
            ) : (
              <h2 className="text-xl font-bold text-[var(--text)] mb-2">{person.name}</h2>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              {/* Role Autocomplete */}
              <div className="role-autocomplete relative">
                <div className="text-[var(--muted)] text-xs mb-1">Role:</div>
                <input
                  type="text"
                  value={roleInputValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    setRoleInputValue(value);
                    if (value.length > 0 && filteredRoles.length > 0) {
                      setShowRoleAutocomplete(true);
                    } else {
                      setShowRoleAutocomplete(false);
                    }
                    setSelectedRoleIndex(-1);
                  }}
                  onFocus={() => {
                    if (roleInputValue.length > 0 && filteredRoles.length > 0) {
                      setShowRoleAutocomplete(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!showRoleAutocomplete || filteredRoles.length === 0) return;
                    switch (e.key) {
                      case 'ArrowDown':
                        e.preventDefault();
                        setSelectedRoleIndex(
                          selectedRoleIndex < filteredRoles.length - 1 ? selectedRoleIndex + 1 : 0
                        );
                        break;
                      case 'ArrowUp':
                        e.preventDefault();
                        setSelectedRoleIndex(
                          selectedRoleIndex > 0 ? selectedRoleIndex - 1 : filteredRoles.length - 1
                        );
                        break;
                      case 'Enter':
                        e.preventDefault();
                        if (selectedRoleIndex >= 0 && selectedRoleIndex < filteredRoles.length) {
                          selectRole(filteredRoles[selectedRoleIndex]);
                        }
                        break;
                      case 'Escape':
                        e.preventDefault();
                        setShowRoleAutocomplete(false);
                        setSelectedRoleIndex(-1);
                        break;
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowRoleAutocomplete(false);
                      setSelectedRoleIndex(-1);
                    }, 150);
                  }}
                  placeholder="Search roles..."
                  disabled={isUpdating}
                  className="w-full px-2 py-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)] focus:border-transparent disabled:opacity-50"
                />
                <AutocompleteDropdowns
                  visible={showRoleAutocomplete && filteredRoles.length > 0}
                  options={filteredRoles}
                  selectedIndex={selectedRoleIndex}
                  onSelect={(role) => selectRole(role)}
                  onHover={(index) => setSelectedRoleIndex(index)}
                  renderOption={(role) => role.name}
                />
              </div>

              {/* Weekly Capacity */}
              <div>
                <div className="text-[var(--muted)] text-xs mb-1">Weekly Capacity:</div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={editingPersonData?.weeklyCapacity || 36}
                    onChange={(e) => onFieldChange('weeklyCapacity', parseInt(e.target.value) || 36)}
                    onBlur={() => onSaveField('weeklyCapacity')}
                    disabled={isUpdating}
                    className="w-16 px-2 py-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)] focus:border-transparent disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[var(--muted)]">hours/week</span>
                </div>
              </div>

              {/* Department */}
              <div>
                <div className="text-[var(--muted)] text-xs mb-1">Department:</div>
                <select
                  value={editingPersonData?.department || ''}
                  onChange={(e) => {
                    const deptId = e.target.value ? parseInt(e.target.value) : null;
                    onFieldChange('department', deptId);
                    const selectedDept = departments.find((d) => d.id === deptId);
                    onFieldChange('departmentName', selectedDept?.name || '');
                    onSaveField('department', deptId);
                  }}
                  disabled={isUpdating}
                  className="w-full px-2 py-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)] focus:border-transparent disabled:opacity-50"
                >
                  <option value="">No Department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hire Date */}
              <div>
                <div className="text-[var(--muted)] text-xs mb-1">Hire Date:</div>
                <input
                  type="date"
                  value={editingPersonData?.hireDate || ''}
                  onChange={(e) => onFieldChange('hireDate', (e.target as HTMLInputElement).value)}
                  onBlur={() => onSaveField('hireDate')}
                  disabled={isUpdating}
                  className="w-full px-2 py-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)] focus:border-transparent disabled:opacity-50"
                />
              </div>

              {/* Active Status */}
              <div>
                <div className="text-[var(--muted)] text-xs mb-1">Status:</div>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!editingPersonData?.isActive}
                    onChange={(e) => { onFieldChange('isActive', (e.target as HTMLInputElement).checked); onSaveField('isActive', (e.target as HTMLInputElement).checked); }}
                    disabled={isUpdating}
                    className="w-4 h-4 text-[var(--primary)] bg-[var(--surface)] border-[var(--border)] rounded focus:ring-[var(--focus)] focus:ring-2"
                  />
                  <span className="text-sm text-[var(--text)]">Active</span>
                </label>
              </div>

              {/* Location Autocomplete */}
              <div className="location-autocomplete relative">
                <div className="text-[var(--muted)] text-xs mb-1">Location:</div>
                <input
                  type="text"
                  value={locationInputValue}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLocationInputValue(value);
                    onFieldChange('location', value);
                    setShowLocationAutocomplete(value.length > 0 && filteredLocations.length > 0);
                    setSelectedLocationIndex(-1);
                  }}
                  onFocus={() => {
                    if (locationInputValue.length > 0 && filteredLocations.length > 0) {
                      setShowLocationAutocomplete(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!showLocationAutocomplete || filteredLocations.length === 0) return;
                    switch (e.key) {
                      case 'ArrowDown':
                        e.preventDefault();
                        setSelectedLocationIndex(
                          selectedLocationIndex < filteredLocations.length - 1 ? selectedLocationIndex + 1 : 0
                        );
                        break;
                      case 'ArrowUp':
                        e.preventDefault();
                        setSelectedLocationIndex(
                          selectedLocationIndex > 0 ? selectedLocationIndex - 1 : filteredLocations.length - 1
                        );
                        break;
                      case 'Enter':
                        e.preventDefault();
                        if (selectedLocationIndex >= 0 && selectedLocationIndex < filteredLocations.length) {
                          selectLocation(filteredLocations[selectedLocationIndex]);
                        }
                        break;
                      case 'Escape':
                        e.preventDefault();
                        setShowLocationAutocomplete(false);
                        setSelectedLocationIndex(-1);
                        break;
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowLocationAutocomplete(false);
                      setSelectedLocationIndex(-1);
                      onSaveField('location');
                    }, 150);
                  }}
                  placeholder="e.g., New York, NY or Remote"
                  disabled={isUpdating}
                  className="w-full px-2 py-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)] focus:border-transparent disabled:opacity-50"
                />
                <AutocompleteDropdowns
                  visible={showLocationAutocomplete && filteredLocations.length > 0}
                  options={filteredLocations}
                  selectedIndex={selectedLocationIndex}
                  onSelect={(loc) => selectLocation(loc)}
                  onHover={(index) => setSelectedLocationIndex(index)}
                  renderOption={(loc) => loc}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-start">
            {isUpdating && (
              <div className="px-2 py-0.5 text-xs text-[var(--focus)] flex items-center gap-1">
                <div className="w-3 h-3 border border-[var(--focus)] border-t-transparent rounded-full animate-spin motion-reduce:animate-none"></div>
                Saving...
              </div>
            )}
            <GearMenu
              open={showGearMenu}
              disabled={isUpdating}
              editingName={editingName}
              onToggle={() => setShowGearMenu(!showGearMenu)}
              onEditName={onEditName}
              onDelete={() => setShowDeleteConfirm(true)}
            />
          </div>
        </div>
      </div>

      <DeleteConfirm
        open={showDeleteConfirm}
        title="Delete Person"
        message={`Are you sure you want to delete ${person.name}? This will permanently remove all their data, assignments, and skills.`}
        confirming={isUpdating}
        onConfirm={onDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Skills Section */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-[var(--text)]">Skills & Expertise</h3>
          <div className="flex gap-2">
            {editingSkills ? (
              <>
                <button onClick={onSkillsSave} className="px-2 py-0.5 text-xs rounded border bg-[var(--primary)] border-[var(--primary)] text-white hover:bg-[var(--primaryHover)] transition-colors">Save Skills</button>
                <button onClick={onSkillsCancel} className="px-2 py-0.5 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors">Cancel</button>
              </>
            ) : (
              <button onClick={onSkillsEdit} className="px-2 py-0.5 text-xs rounded border bg-[var(--primary)] border-[var(--primary)] text-white hover:bg-[var(--primaryHover)] transition-colors">Edit Skills</button>
            )}
          </div>
        </div>

        {/* Inline editor */}
        <SkillsEditor
          editing={editingSkills}
          skillsData={skillsData}
          onChange={updateSkillsByType}
          onSave={onSkillsSave}
          onCancel={onSkillsCancel}
        />

        {/* Strengths - display mode */}
        {!editingSkills && (
          <div className="bg-[var(--surface)]/50 p-4 rounded-lg border border-[var(--border)]">
            <h4 className="text-sm font-medium text-[var(--text)] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
              Strengths
            </h4>
            <div className="flex flex-wrap gap-2">
              {skillsData.strengths.map((skill, index) => {
                const proficiencyKey = `${skill.skillTagName}-strengths`;
                const isEditingThisProficiency = editingProficiency === proficiencyKey;
                return (
                  <div key={index} className="relative">
                    <span className="px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {skill.skillTagName}
                      <span
                        className="ml-2 underline cursor-pointer"
                        onClick={() => onProficiencyClick(skill, 'strengths')}
                        title="Edit proficiency"
                      >
                        ({skill.proficiencyLevel})
                      </span>
                    </span>
                    {isEditingThisProficiency && (
                      <div className="proficiency-dropdown absolute top-full left-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg z-50 min-w-32">
                        {proficiencyLevels.map((level) => (
                          <button
                            key={level.value}
                            onClick={() => onProficiencyChange(skill, 'strengths', level.value)}
                            className={`w-full text-left px-3 py-1 text-xs hover:bg-[var(--surface)] transition-colors border-b border-[var(--border)] last:border-b-0 ${
                              skill.proficiencyLevel === level.value ? 'bg-emerald-500/20 text-emerald-400' : 'text-[var(--text)]'
                            }`}
                          >
                            {level.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {skillsData.strengths.length === 0 && <span className="text-[var(--muted)] text-sm">No strengths listed</span>}
            </div>
          </div>
        )}

        {/* Development - display mode */}
        {!editingSkills && (
          <div className="bg-[var(--surface)]/50 p-4 rounded-lg border border-[var(--border)]">
            <h4 className="text-sm font-medium text-[var(--text)] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
              Areas for Improvement
            </h4>
            <div className="flex flex-wrap gap-2">
              {skillsData.development.map((skill, index) => (
                <span key={index} className="px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {skill.skillTagName}
                </span>
              ))}
              {skillsData.development.length === 0 && <span className="text-[var(--muted)] text-sm">No development areas listed</span>}
            </div>
          </div>
        )}

        {/* Learning - display mode */}
        {!editingSkills && (
          <div className="bg-[var(--surface)]/50 p-4 rounded-lg border border-[var(--border)]">
            <h4 className="text-sm font-medium text-[var(--text)] mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
              Currently Learning
            </h4>
            <div className="flex flex-wrap gap-2">
              {skillsData.learning.map((skill, index) => (
                <span key={index} className="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">{skill.skillTagName}</span>
              ))}
              {skillsData.learning.length === 0 && <span className="text-[var(--muted)] text-sm">No learning goals listed</span>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
