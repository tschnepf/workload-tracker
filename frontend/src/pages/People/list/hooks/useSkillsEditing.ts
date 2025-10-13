import { useState } from 'react';
import type { PersonSkill } from '@/types/models';
import { normalizeProficiencyLevel } from '@/util/skills';

export interface UseSkillsEditingApi {
  skillsData: SkillsGroups;
  setSkillsData: (s: SkillsGroups) => void;
  editingSkills: boolean;
  setEditingSkills: (v: boolean) => void;
  editingProficiencyKey: string | null;
  openProficiencyDropdown: (key: string) => void;
  closeProficiencyDropdown: () => void;
  updateSkillsByType: (type: keyof SkillsGroups, skills: PersonSkill[]) => void;
  changeProficiencyLocalOnly: (
    type: keyof SkillsGroups,
    skillTagName: string,
    newLevel: string
  ) => void;
}

export interface SkillsGroups {
  strengths: PersonSkill[];
  development: PersonSkill[];
  learning: PersonSkill[];
}

export function useSkillsEditing(initial: SkillsGroups = { strengths: [], development: [], learning: [] }): UseSkillsEditingApi {
  const [skillsData, setSkillsData] = useState<SkillsGroups>(initial);
  const [editingSkills, setEditingSkills] = useState(false);
  const [editingProficiencyKey, setEditingProficiencyKey] = useState<string | null>(null);

  const updateSkillsByType = (skillType: keyof SkillsGroups, skills: PersonSkill[]) => {
    setSkillsData(prev => ({ ...prev, [skillType]: skills }));
  };

  const openProficiencyDropdown = (key: string) => setEditingProficiencyKey(key);
  const closeProficiencyDropdown = () => setEditingProficiencyKey(null);

  const changeProficiencyLocalOnly = (
    skillType: keyof SkillsGroups,
    skillTagName: string,
    newLevel: string
  ) => {
    const level = normalizeProficiencyLevel(newLevel);
    const updated = skillsData[skillType].map(s =>
      s.skillTagName === skillTagName ? { ...s, proficiencyLevel: level } : s
    );
    updateSkillsByType(skillType, updated);
  };

  return {
    skillsData,
    setSkillsData,
    editingSkills,
    setEditingSkills,
    editingProficiencyKey,
    openProficiencyDropdown,
    closeProficiencyDropdown,
    updateSkillsByType,
    changeProficiencyLocalOnly,
  };
}

export type UseSkillsEditingReturn = ReturnType<typeof useSkillsEditing>;
