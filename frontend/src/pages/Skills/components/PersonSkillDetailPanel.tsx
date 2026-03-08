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
  sectionType: PersonSkill['skillType'],
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
  dragOverType: PersonSkill['skillType'] | null,
  onSkillDragStart: (skill: PersonSkill, event: React.DragEvent<HTMLDivElement>) => void,
  onSkillDragEnd: () => void,
  onSectionDragOver: (section: PersonSkill['skillType'], event: React.DragEvent<HTMLElement>) => void,
  onSectionDragLeave: (section: PersonSkill['skillType']) => void,
  onSectionDrop: (section: PersonSkill['skillType'], event: React.DragEvent<HTMLElement>) => void,
) {
  const isDragTarget = dragOverType === sectionType;
  return (
    <section
      className={`rounded border bg-[var(--surface)] p-3 transition-colors ${
        isDragTarget
          ? 'border-[var(--focus)] bg-[var(--surfaceHover)]'
          : 'border-[var(--border)]'
      }`}
      data-testid={`skill-section-${sectionType}`}
      onDragOver={(event) => onSectionDragOver(sectionType, event)}
      onDragLeave={() => onSectionDragLeave(sectionType)}
      onDrop={(event) => onSectionDrop(sectionType, event)}
    >
      <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">{title}</h4>
      {skills.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">
          No skills in this section.
          {isDragTarget ? ' Drop here to move.' : ''}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-[var(--border)] bg-[var(--card)]">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(0,1.25fr)_170px_minmax(0,1.8fr)_auto] items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <div>Skill Name</div>
              <div>Skill Level</div>
              <div>Notes</div>
              <div className="text-right">Actions</div>
            </div>
            {skills.map((skill) => {
              const draft = getDraftForSkill(skill);
              const saveState = getSaveStateForSkill(skill.id);
              const error = getErrorForSkill(skill.id);
              const skillName = skill.skillTagName || 'Skill';
              return (
                <div
                  key={skill.id}
                  className="grid cursor-grab grid-cols-[minmax(0,1.25fr)_170px_minmax(0,1.8fr)_auto] items-center gap-2 border-b border-[var(--border)] px-2 py-2 last:border-b-0 active:cursor-grabbing"
                  draggable={Boolean(skill.id)}
                  onDragStart={(event) => onSkillDragStart(skill, event)}
                  onDragEnd={onSkillDragEnd}
                  data-testid={skill.id ? `skill-row-${skill.id}` : undefined}
                >
                  <div className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{skillName}</div>
                  <select
                    value={draft.proficiencyLevel || 'beginner'}
                    aria-label={`Skill level for ${skillName}`}
                    className="h-8 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)]"
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
                  <input
                    type="text"
                    value={draft.notes || ''}
                    aria-label={`Notes for ${skillName}`}
                    className="h-8 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)]"
                    placeholder="Add context for this skill..."
                    onChange={(event) => onSkillDraftChange(skill, { notes: event.target.value })}
                    onBlur={() => onSkillDraftBlur(skill.id)}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded border border-red-400/50 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
                      onClick={() => onRemoveSkill(skill)}
                      disabled={removingSkillId === skill.id}
                    >
                      {removingSkillId === skill.id ? 'Removing...' : 'Remove'}
                    </button>
                    {saveState !== 'idle' ? (
                      <SaveStateBadge
                        state={saveState}
                        message={saveState === 'error' ? (error || 'Save failed') : undefined}
                        onRetry={saveState === 'error' ? () => onRetrySkillSave(skill.id) : undefined}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
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
  const [draggingSkillId, setDraggingSkillId] = React.useState<number | null>(null);
  const [dragOverType, setDragOverType] = React.useState<PersonSkill['skillType'] | null>(null);
  const allSkills = React.useMemo(
    () => [...groupedSkills.strengths, ...groupedSkills.development, ...groupedSkills.learning],
    [groupedSkills]
  );

  const onSkillDragStart = React.useCallback((skill: PersonSkill, event: React.DragEvent<HTMLDivElement>) => {
    if (!skill.id) return;
    setDraggingSkillId(skill.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(skill.id));
    }
  }, []);

  const onSkillDragEnd = React.useCallback(() => {
    setDraggingSkillId(null);
    setDragOverType(null);
  }, []);

  const onSectionDragOver = React.useCallback(
    (section: PersonSkill['skillType'], event: React.DragEvent<HTMLElement>) => {
      if (draggingSkillId == null) return;
      const draggedSkill = allSkills.find((skill) => skill.id === draggingSkillId);
      if (!draggedSkill || draggedSkill.skillType === section) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      setDragOverType(section);
    },
    [allSkills, draggingSkillId]
  );

  const onSectionDragLeave = React.useCallback((section: PersonSkill['skillType']) => {
    setDragOverType((prev) => (prev === section ? null : prev));
  }, []);

  const onSectionDrop = React.useCallback(
    (section: PersonSkill['skillType'], event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (draggingSkillId == null) return;
      const draggedSkill = allSkills.find((skill) => skill.id === draggingSkillId);
      if (draggedSkill && draggedSkill.skillType !== section) {
        onSkillDraftChange(draggedSkill, { skillType: section });
        onSkillDraftBlur(draggedSkill.id);
      }
      setDraggingSkillId(null);
      setDragOverType(null);
    },
    [allSkills, draggingSkillId, onSkillDraftBlur, onSkillDraftChange]
  );

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
        <div className="grid gap-2 xl:grid-cols-[160px_minmax(0,1fr)] xl:items-end">
          <label className="text-xs text-[var(--muted)]">
            Add As
            <select
              value={addSkillType}
              className="mt-0.5 h-8 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)]"
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
              className="mt-0.5 h-8 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] placeholder-[var(--muted)]"
              placeholder="Type to search and click a skill..."
              disabled={addSkillDisabled}
            />
          </label>
        </div>
        <div className="mt-1 text-[11px] text-[var(--muted)]">
          Drag rows between Strengths, Development, and Learning to change skill type.
        </div>
        {addSkillQuery.trim().length > 0 ? (
          <div className="mt-2 rounded border border-[var(--border)] bg-[var(--card)]">
            {addSkillLoading ? (
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
        ) : null}
      </section>

      {renderSection(
        'strength',
        'Strengths',
        groupedSkills.strengths,
        getDraftForSkill,
        getSaveStateForSkill,
        getErrorForSkill,
        onSkillDraftChange,
        onSkillDraftBlur,
        onRetrySkillSave,
        onRemoveSkill,
        removingSkillId,
        dragOverType,
        onSkillDragStart,
        onSkillDragEnd,
        onSectionDragOver,
        onSectionDragLeave,
        onSectionDrop
      )}
      {renderSection(
        'development',
        'Development',
        groupedSkills.development,
        getDraftForSkill,
        getSaveStateForSkill,
        getErrorForSkill,
        onSkillDraftChange,
        onSkillDraftBlur,
        onRetrySkillSave,
        onRemoveSkill,
        removingSkillId,
        dragOverType,
        onSkillDragStart,
        onSkillDragEnd,
        onSectionDragOver,
        onSectionDragLeave,
        onSectionDrop
      )}
      {renderSection(
        'learning',
        'Learning',
        groupedSkills.learning,
        getDraftForSkill,
        getSaveStateForSkill,
        getErrorForSkill,
        onSkillDraftChange,
        onSkillDraftBlur,
        onRetrySkillSave,
        onRemoveSkill,
        removingSkillId,
        dragOverType,
        onSkillDragStart,
        onSkillDragEnd,
        onSectionDragOver,
        onSectionDragLeave,
        onSectionDrop
      )}
    </div>
  );
};

export default PersonSkillDetailPanel;
