import React from 'react';
import SaveStateBadge from '@/components/ux/SaveStateBadge';
import type { Person, PersonSkill, SkillTag } from '@/types/models';

const PROFICIENCY_OPTIONS: Array<{
  value: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  label: string;
}> = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

type GroupedPersonSkills = {
  strengths: PersonSkill[];
  development: PersonSkill[];
  learning: PersonSkill[];
};

const SKILL_TYPE_OPTIONS: Array<{ value: PersonSkill['skillType']; label: string }> = [
  { value: 'strength', label: 'Strength' },
  { value: 'development', label: 'Development' },
  { value: 'learning', label: 'Learning' },
];

type PersonSkillDetailPanelProps = {
  person: Person | null;
  groupedSkills: GroupedPersonSkills;
  getDraftForSkill: (
    skill: PersonSkill
  ) => { skillType: PersonSkill['skillType']; proficiencyLevel: PersonSkill['proficiencyLevel']; notes: string };
  getSaveStateForSkill: (skillId?: number) => 'idle' | 'saving' | 'saved' | 'error';
  getErrorForSkill: (skillId?: number) => string | undefined;
  onSkillDraftChange: (
    skill: PersonSkill,
    patch: Partial<{
      skillType: PersonSkill['skillType'];
      proficiencyLevel: PersonSkill['proficiencyLevel'];
      notes: string;
    }>
  ) => void;
  onSkillDraftBlur: (skillId?: number) => void;
  onRetrySkillSave: (skillId?: number) => void;
  onRemoveSkill: (skill: PersonSkill) => void;
  removingSkillId?: number | null;
  addSkillQuery: string;
  addSkillType: PersonSkill['skillType'];
  addSkillResults: SkillTag[];
  addSkillLoading: boolean;
  onAddSkillQueryChange: (value: string) => void;
  onAddSkillTypeChange: (value: PersonSkill['skillType']) => void;
  onAddSkill: (skill: SkillTag) => void;
  addSkillDisabled?: boolean;
};

function renderSection(
  title: string,
  skills: PersonSkill[],
  getDraftForSkill: PersonSkillDetailPanelProps['getDraftForSkill'],
  getSaveStateForSkill: PersonSkillDetailPanelProps['getSaveStateForSkill'],
  getErrorForSkill: PersonSkillDetailPanelProps['getErrorForSkill'],
  onSkillDraftChange: PersonSkillDetailPanelProps['onSkillDraftChange'],
  onSkillDraftBlur: PersonSkillDetailPanelProps['onSkillDraftBlur'],
  onRetrySkillSave: PersonSkillDetailPanelProps['onRetrySkillSave'],
  onRemoveSkill: PersonSkillDetailPanelProps['onRemoveSkill'],
  removingSkillId: PersonSkillDetailPanelProps['removingSkillId'],
) {
  return (
    <section className="rounded border border-[var(--border)] bg-[var(--surface)] p-3">
      <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">{title}</h4>
      {skills.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">No skills in this section.</div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => {
            const draft = getDraftForSkill(skill);
            const saveState = getSaveStateForSkill(skill.id);
            const error = getErrorForSkill(skill.id);
            return (
              <div key={skill.id} className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--text)]">{skill.skillTagName || 'Skill'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded border border-red-400/50 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
                      onClick={() => onRemoveSkill(skill)}
                      disabled={removingSkillId === skill.id}
                    >
                      {removingSkillId === skill.id ? 'Removing...' : 'Remove'}
                    </button>
                    <SaveStateBadge
                      state={saveState}
                      message={saveState === 'error' ? (error || 'Save failed') : undefined}
                      onRetry={saveState === 'error' ? () => onRetrySkillSave(skill.id) : undefined}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-[var(--muted)]">
                    Skill Type
                    <select
                      value={draft.skillType || 'strength'}
                      className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)]"
                      onChange={(event) =>
                        onSkillDraftChange(skill, {
                          skillType: event.target.value as PersonSkill['skillType'],
                        })
                      }
                      onBlur={() => onSkillDraftBlur(skill.id)}
                    >
                      {SKILL_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-[var(--muted)]">
                    Skill Level
                    <select
                      value={draft.proficiencyLevel || 'beginner'}
                      className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)]"
                      onChange={(event) =>
                        onSkillDraftChange(skill, {
                          proficiencyLevel: event.target.value as PersonSkill['proficiencyLevel'],
                        })
                      }
                      onBlur={() => onSkillDraftBlur(skill.id)}
                    >
                      {PROFICIENCY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs text-[var(--muted)]">
                    Notes
                    <textarea
                      value={draft.notes || ''}
                      rows={2}
                      className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)]"
                      placeholder="Add context for this skill..."
                      onChange={(event) => onSkillDraftChange(skill, { notes: event.target.value })}
                      onBlur={() => onSkillDraftBlur(skill.id)}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const PersonSkillDetailPanel: React.FC<PersonSkillDetailPanelProps> = ({
  person,
  groupedSkills,
  getDraftForSkill,
  getSaveStateForSkill,
  getErrorForSkill,
  onSkillDraftChange,
  onSkillDraftBlur,
  onRetrySkillSave,
  onRemoveSkill,
  removingSkillId,
  addSkillQuery,
  addSkillType,
  addSkillResults,
  addSkillLoading,
  onAddSkillQueryChange,
  onAddSkillTypeChange,
  onAddSkill,
  addSkillDisabled,
}) => {
  if (!person) {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        Select a person to view details.
      </div>
    );
  }

  const totalSkills = groupedSkills.strengths.length + groupedSkills.development.length + groupedSkills.learning.length;

  return (
    <div className="space-y-3">
      <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="text-base font-semibold text-[var(--text)]">{person.name}</div>
        <div className="text-xs text-[var(--muted)]">
          {person.departmentName || 'Department'} | {person.roleName || 'No role'}
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">{totalSkills} assigned skill(s)</div>
      </div>

      <section className="rounded border border-[var(--border)] bg-[var(--surface)] p-3">
        <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">Add Skill</h4>
        <div className="grid gap-2">
          <label className="text-xs text-[var(--muted)]">
            Add As
            <select
              value={addSkillType}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)]"
              onChange={(event) => onAddSkillTypeChange(event.target.value as PersonSkill['skillType'])}
              disabled={addSkillDisabled}
            >
              {SKILL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Search Skills
            <input
              type="text"
              value={addSkillQuery}
              onChange={(event) => onAddSkillQueryChange(event.target.value)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] placeholder-[var(--muted)]"
              placeholder="Type to search and click a skill..."
              disabled={addSkillDisabled}
            />
          </label>
        </div>
        <div className="mt-2 rounded border border-[var(--border)] bg-[var(--card)]">
          {addSkillQuery.trim().length === 0 ? (
            <div className="px-2 py-2 text-xs text-[var(--muted)]">Type a skill name to search.</div>
          ) : addSkillLoading ? (
            <div className="px-2 py-2 text-xs text-[var(--muted)]">Searching skills...</div>
          ) : addSkillResults.length === 0 ? (
            <div className="px-2 py-2 text-xs text-[var(--muted)]">No skills found.</div>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {addSkillResults.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  className="w-full border-b border-[var(--border)] px-2 py-1 text-left text-xs text-[var(--text)] transition-colors hover:bg-[var(--cardHover)] last:border-b-0 disabled:opacity-60"
                  onClick={() => onAddSkill(skill)}
                  disabled={addSkillDisabled}
                >
                  <div className="truncate font-medium">{skill.name}</div>
                  <div className="truncate text-[var(--muted)]">
                    {skill.scopeType === 'global' ? 'Global' : (skill.departmentName || 'Department')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {renderSection(
        'Strengths',
        groupedSkills.strengths,
        getDraftForSkill,
        getSaveStateForSkill,
        getErrorForSkill,
        onSkillDraftChange,
        onSkillDraftBlur,
        onRetrySkillSave,
        onRemoveSkill,
        removingSkillId
      )}
      {renderSection(
        'Development',
        groupedSkills.development,
        getDraftForSkill,
        getSaveStateForSkill,
        getErrorForSkill,
        onSkillDraftChange,
        onSkillDraftBlur,
        onRetrySkillSave,
        onRemoveSkill,
        removingSkillId
      )}
      {renderSection(
        'Learning',
        groupedSkills.learning,
        getDraftForSkill,
        getSaveStateForSkill,
        getErrorForSkill,
        onSkillDraftChange,
        onSkillDraftBlur,
        onRetrySkillSave,
        onRemoveSkill,
        removingSkillId
      )}
    </div>
  );
};

export default PersonSkillDetailPanel;
