import React from 'react';
import type { PersonSkill } from '@/types/models';
import SkillsAutocomplete from '@/components/skills/SkillsAutocomplete';

export interface SkillsEditorProps {
  editing: boolean;
  skillsData: {
    strengths: PersonSkill[];
    inProgress: PersonSkill[];
    goals: PersonSkill[];
  };
  onChange: (type: 'strengths' | 'inProgress' | 'goals', skills: PersonSkill[]) => void;
  onSave: () => Promise<void> | void;
  onCancel: () => void;
}

export default function SkillsEditor(props: SkillsEditorProps) {
  const { editing, skillsData, onChange } = props;
  if (!editing) return null;

  return (
    <>
      {/* Strengths */}
      <div className="bg-[var(--surface)]/50 p-4 rounded-lg border border-[var(--border)]">
        <h4 className="text-sm font-medium text-[var(--text)] mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
          Strengths
        </h4>
        <SkillsAutocomplete
          selectedSkills={skillsData.strengths}
          onSkillsChange={(skills) => onChange('strengths', skills)}
          skillType="strength"
          placeholder="Add strengths..."
          className="w-full px-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--focus)] focus:outline-none"
        />
      </div>

      {/* In Progress */}
      <div className="bg-[var(--surface)]/50 p-4 rounded-lg border border-[var(--border)]">
        <h4 className="text-sm font-medium text-[var(--text)] mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
          In Progress
        </h4>
        <SkillsAutocomplete
          selectedSkills={skillsData.inProgress}
          onSkillsChange={(skills) => onChange('inProgress', skills)}
          skillType="in_progress"
          placeholder="Add in-progress skills..."
          className="w-full px-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--focus)] focus:outline-none"
        />
      </div>

      {/* Goals */}
      <div className="bg-[var(--surface)]/50 p-4 rounded-lg border border-[var(--border)]">
        <h4 className="text-sm font-medium text-[var(--text)] mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
          Goals
        </h4>
        <SkillsAutocomplete
          selectedSkills={skillsData.goals}
          onSkillsChange={(skills) => onChange('goals', skills)}
          skillType="goals"
          placeholder="Add goals..."
          className="w-full px-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--focus)] focus:outline-none"
        />
      </div>
    </>
  );
}
