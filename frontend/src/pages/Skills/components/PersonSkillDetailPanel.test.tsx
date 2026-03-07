import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Person, PersonSkill, SkillTag } from '@/types/models';
import PersonSkillDetailPanel from '@/pages/Skills/components/PersonSkillDetailPanel';

const person: Person = {
  id: 1,
  name: 'Alex',
  departmentName: 'Electrical',
  roleName: 'Designer',
};

const strength: PersonSkill = {
  id: 11,
  person: 1,
  skillTagId: 90,
  skillTagName: 'Heat Calc Support',
  skillType: 'strength',
  proficiencyLevel: 'intermediate',
  notes: 'Needs help determining xyz',
};

const development: PersonSkill = {
  id: 12,
  person: 1,
  skillTagId: 91,
  skillTagName: 'Power Modeling',
  skillType: 'development',
  proficiencyLevel: 'beginner',
  notes: '',
};

const addResults: SkillTag[] = [
  {
    id: 92,
    name: 'ETAP',
    scopeType: 'global',
  },
];

describe('PersonSkillDetailPanel', () => {
  it('renders grouped skills and person metadata', () => {
    render(
      <PersonSkillDetailPanel
        person={person}
        groupedSkills={{ strengths: [strength], development: [development], learning: [] }}
        getDraftForSkill={(skill) => ({
          skillType: skill.skillType,
          proficiencyLevel: skill.proficiencyLevel,
          notes: skill.notes || '',
        })}
        getSaveStateForSkill={() => 'idle'}
        getErrorForSkill={() => undefined}
        onSkillDraftChange={vi.fn()}
        onSkillDraftBlur={vi.fn()}
        onRetrySkillSave={vi.fn()}
        onRemoveSkill={vi.fn()}
        addSkillQuery=""
        addSkillType="strength"
        addSkillResults={addResults}
        addSkillLoading={false}
        onAddSkillQueryChange={vi.fn()}
        onAddSkillTypeChange={vi.fn()}
        onAddSkill={vi.fn()}
      />
    );

    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Strengths' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Development' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Learning' })).toBeInTheDocument();
    expect(screen.getByText('Heat Calc Support')).toBeInTheDocument();
    expect(screen.getByText('Power Modeling')).toBeInTheDocument();
  });

  it('emits draft change and blur handlers', () => {
    const onSkillDraftChange = vi.fn();
    const onSkillDraftBlur = vi.fn();
    const onAddSkill = vi.fn();
    const onRemoveSkill = vi.fn();

    render(
      <PersonSkillDetailPanel
        person={person}
        groupedSkills={{ strengths: [strength], development: [], learning: [] }}
        getDraftForSkill={(skill) => ({
          skillType: skill.skillType,
          proficiencyLevel: skill.proficiencyLevel,
          notes: skill.notes || '',
        })}
        getSaveStateForSkill={() => 'idle'}
        getErrorForSkill={() => undefined}
        onSkillDraftChange={onSkillDraftChange}
        onSkillDraftBlur={onSkillDraftBlur}
        onRetrySkillSave={vi.fn()}
        onRemoveSkill={onRemoveSkill}
        addSkillQuery="eta"
        addSkillType="strength"
        addSkillResults={addResults}
        addSkillLoading={false}
        onAddSkillQueryChange={vi.fn()}
        onAddSkillTypeChange={vi.fn()}
        onAddSkill={onAddSkill}
      />
    );

    const typeSelect = screen.getByLabelText('Skill Type');
    fireEvent.change(typeSelect, { target: { value: 'development' } });
    expect(onSkillDraftChange).toHaveBeenCalledWith(strength, { skillType: 'development' });

    const combo = screen.getByLabelText('Skill Level');
    fireEvent.change(combo, { target: { value: 'advanced' } });
    expect(onSkillDraftChange).toHaveBeenCalledWith(strength, { proficiencyLevel: 'advanced' });

    const notes = screen.getByLabelText('Notes');
    fireEvent.change(notes, { target: { value: 'Updated note' } });
    expect(onSkillDraftChange).toHaveBeenCalledWith(strength, { notes: 'Updated note' });

    fireEvent.blur(notes);
    expect(onSkillDraftBlur).toHaveBeenCalledWith(11);

    fireEvent.click(screen.getByText('ETAP'));
    expect(onAddSkill).toHaveBeenCalledWith(addResults[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemoveSkill).toHaveBeenCalledWith(strength);
  });

  it('renders placeholder when no person is selected', () => {
    render(
      <PersonSkillDetailPanel
        person={null}
        groupedSkills={{ strengths: [], development: [], learning: [] }}
        getDraftForSkill={() => ({ skillType: 'strength', proficiencyLevel: 'beginner', notes: '' })}
        getSaveStateForSkill={() => 'idle'}
        getErrorForSkill={() => undefined}
        onSkillDraftChange={vi.fn()}
        onSkillDraftBlur={vi.fn()}
        onRetrySkillSave={vi.fn()}
        onRemoveSkill={vi.fn()}
        addSkillQuery=""
        addSkillType="strength"
        addSkillResults={[]}
        addSkillLoading={false}
        onAddSkillQueryChange={vi.fn()}
        onAddSkillTypeChange={vi.fn()}
        onAddSkill={vi.fn()}
      />
    );

    expect(screen.getByText('Select a person to view details.')).toBeInTheDocument();
  });
});
