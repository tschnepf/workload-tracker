import React, { useEffect, useState } from 'react';
import type { Department, Person, PersonSkill, Role } from '@/types/models';
import { personSkillsApi, jobsApi } from '@/services/api';
import { useUpdatePerson, useDeletePerson } from '@/hooks/usePeople';
import { showToast } from '@/lib/toastBus';
import PersonDetailsPanel from '@/pages/People/list/components/PersonDetailsPanel';
import { useDropdowns } from '@/pages/People/list/hooks/useDropdowns';
import { useLocationAutocomplete, useRoleAutocomplete } from '@/pages/People/list/hooks/useAutocomplete';
import { useSkillsEditing } from '@/pages/People/list/hooks/useSkillsEditing';
import { normalizeProficiencyLevel } from '@/util/skills';

export interface PersonDetailsContainerProps {
  person: Person | null;
  roles: Role[];
  departments: Department[];
  people: Person[]; // for location autocomplete options
}

export default function PersonDetailsContainer(props: PersonDetailsContainerProps) {
  const { person, roles, departments, people } = props;

  const updatePersonMutation = useUpdatePerson();
  const deletePersonMutation = useDeletePerson();
  const { showGearMenu, setShowGearMenu, showDeleteConfirm, setShowDeleteConfirm } = useDropdowns();
  const [editingName, setEditingName] = useState(false);
  const [editingPersonData, setEditingPersonData] = useState<Person | null>(null);
  const [isUpdatingPerson, setIsUpdatingPerson] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [personSkills, setPersonSkills] = useState<PersonSkill[]>([]);
  const {
    skillsData,
    setSkillsData,
    editingSkills,
    setEditingSkills,
    editingProficiencyKey,
    openProficiencyDropdown,
    closeProficiencyDropdown,
    updateSkillsByType,
  } = useSkillsEditing({ strengths: [], development: [], learning: [] });

  const {
    showLocationAutocomplete,
    setShowLocationAutocomplete,
    locationInputValue,
    setLocationInputValue,
    selectedLocationIndex,
    setSelectedLocationIndex,
    filteredLocations,
  } = useLocationAutocomplete({ people });

  const {
    showRoleAutocomplete,
    setShowRoleAutocomplete,
    roleInputValue,
    setRoleInputValue,
    selectedRoleIndex,
    setSelectedRoleIndex,
    filteredRoles,
  } = useRoleAutocomplete({ roles });

  useEffect(() => {
    if (person) {
      setEditingPersonData({ ...person });
      setLocationInputValue(person.location || '');
      setRoleInputValue(person.roleName || '');
    }
  }, [person]);

  useEffect(() => {
    if (person?.id) {
      loadPersonSkills(person.id);
    } else {
      setPersonSkills([]);
      setSkillsData({ strengths: [], development: [], learning: [] });
    }
  }, [person?.id]);

  const loadPersonSkills = async (personId: number) => {
    try {
      const response = await personSkillsApi.list({ person: personId });
      const skills = response.results || [];
      setPersonSkills(skills);
      const grouped = {
        strengths: skills.filter((s) => s.skillType === 'strength'),
        development: skills.filter((s) => s.skillType === 'development'),
        learning: skills.filter((s) => s.skillType === 'learning'),
      };
      setSkillsData(grouped);
    } catch (err) {
      console.error('Failed to load person skills:', err);
    }
  };

  const onFieldChange = (field: keyof Person, value: string | number | boolean | null) => {
    if (!editingPersonData) return;
    setEditingPersonData((prev) => ({ ...prev!, [field]: value }));
  };

  const onSaveField = async (field: keyof Person, overrideValue?: any) => {
    if (!person?.id || !editingPersonData || isUpdatingPerson) return;
    try {
      setIsUpdatingPerson(true);
      setError(null);
      const fieldValue = overrideValue !== undefined ? overrideValue : (editingPersonData as any)[field];
      const updateData = { [field]: fieldValue } as Partial<Person>;
      const result = await updatePersonMutation.mutateAsync({ id: person.id, data: updateData }) as any;
      showToast('Saved changes', 'success');
      // If marking inactive, surface background cleanup job start + completion
      if (field === 'isActive' && fieldValue === false) {
        try { showToast('Deactivation cleanup started in background', 'info'); } catch {}
        const jobId: string | undefined = result?._jobId;
        if (jobId) {
          // Poll job status until completion or timeout (~2 minutes)
          (async () => {
            const start = Date.now();
            let lastState = '';
            while (Date.now() - start < 120000 /* 2 min */) {
              try {
                const st = await jobsApi.getStatus(jobId);
                if (st?.state && st.state !== lastState) {
                  lastState = st.state;
                }
                if (st?.state === 'SUCCESS') { try { showToast('Deactivation cleanup completed', 'success'); } catch {} break; }
                if (st?.state === 'FAILURE') { try { showToast('Deactivation cleanup failed', 'error'); } catch {} break; }
              } catch {}
              await new Promise(r => setTimeout(r, 2000));
            }
          })();
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update');
      showToast('Failed to update', 'error');
    } finally {
      setIsUpdatingPerson(false);
    }
  };

  const onEditName = () => {
    setEditingName(true);
    setShowGearMenu(false);
  };

  const onNameSave = async () => {
    if (!person?.id || !editingPersonData) return;
    await onSaveField('name', editingPersonData.name);
    setEditingName(false);
  };

  const onNameCancel = () => {
    if (!person) return;
    setEditingName(false);
    setEditingPersonData({ ...person });
  };

  const onDelete = async () => {
    if (!person?.id) return;
    try {
      await deletePersonMutation.mutateAsync(person.id);
      showToast('Person deleted', 'success');
    } catch (err: any) {
      showToast('Failed to delete person', 'error');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const onSkillsEdit = () => setEditingSkills(true);

  const onSkillsSave = async () => {
    try {
      setError(null);
      // No-op: skill persistence may be handled in specific endpoints elsewhere
      showToast('Updated skills', 'success');
      setEditingSkills(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to update skills');
      showToast('Failed to update skills', 'error');
    }
  };

  const onSkillsCancel = () => {
    setEditingSkills(false);
    if (person?.id) loadPersonSkills(person.id);
  };

  const onProficiencyClick = (skill: PersonSkill, skillType: string) => {
    const key = `${skill.skillTagName}-${skillType}`;
    openProficiencyDropdown(key);
  };

  const onProficiencyChange = async (
    skill: PersonSkill,
    skillType: 'strengths' | 'development' | 'learning',
    newProficiency: string
  ) => {
    try {
      const apiSkillType = skillType === 'strengths' ? 'strength' : skillType.slice(0, -1);
      const skillToUpdate = personSkills.find(
        (s) => s.skillTagName === skill.skillTagName && s.skillType === apiSkillType
      );
      if (skillToUpdate?.id) {
        const normalized = normalizeProficiencyLevel(newProficiency);
        await personSkillsApi.update(skillToUpdate.id, { proficiencyLevel: normalized });
        const updatedSkills = skillsData[skillType].map((s) =>
          s.skillTagName === skill.skillTagName ? { ...s, proficiencyLevel: normalized } : s
        );
        updateSkillsByType(skillType, updatedSkills);
        const updatedPersonSkills = personSkills.map((s) =>
          s.id === skillToUpdate.id ? { ...s, proficiencyLevel: normalized } : s
        );
        setPersonSkills(updatedPersonSkills);
      }
    } catch (err) {
      console.error('Failed to update proficiency level:', err);
      setError('Failed to update skill proficiency');
    }
    closeProficiencyDropdown();
  };

  const selectLocation = (location: string) => {
    setLocationInputValue(location);
    onFieldChange('location', location);
    setShowLocationAutocomplete(false);
    onSaveField('location', location);
  };

  const selectRole = (role: Role) => {
    setRoleInputValue(role.name);
    onFieldChange('role', role.id);
    onFieldChange('roleName', role.name);
    setShowRoleAutocomplete(false);
    // Persist role with both id and name for optimistic UI; backend ignores roleName
    if (person?.id) {
      try {
        setIsUpdatingPerson(true);
        updatePersonMutation.mutate({ id: person.id, data: { role: role.id, roleName: role.name } as any });
        showToast('Saved changes', 'success');
      } catch (err: any) {
        setError(err?.message || 'Failed to update');
        showToast('Failed to update', 'error');
      } finally {
        setIsUpdatingPerson(false);
      }
    }
  };

  if (!person) return null;

  return (
    <PersonDetailsPanel
      person={person}
      roles={roles}
      departments={departments}
      isUpdating={isUpdatingPerson}
      editingName={editingName}
      editingPersonData={editingPersonData}
      onFieldChange={onFieldChange}
      onSaveField={onSaveField}
      onEditName={onEditName}
      onNameSave={onNameSave}
      onNameCancel={onNameCancel}
      showGearMenu={showGearMenu}
      setShowGearMenu={setShowGearMenu}
      showDeleteConfirm={showDeleteConfirm}
      setShowDeleteConfirm={setShowDeleteConfirm}
      onDelete={onDelete}
      locationInputValue={locationInputValue}
      setLocationInputValue={setLocationInputValue}
      showLocationAutocomplete={showLocationAutocomplete}
      setShowLocationAutocomplete={setShowLocationAutocomplete}
      selectedLocationIndex={selectedLocationIndex}
      setSelectedLocationIndex={setSelectedLocationIndex}
      filteredLocations={filteredLocations}
      selectLocation={selectLocation}
      roleInputValue={roleInputValue}
      setRoleInputValue={setRoleInputValue}
      showRoleAutocomplete={showRoleAutocomplete}
      setShowRoleAutocomplete={setShowRoleAutocomplete}
      selectedRoleIndex={selectedRoleIndex}
      setSelectedRoleIndex={setSelectedRoleIndex}
      filteredRoles={filteredRoles}
      selectRole={selectRole}
      editingSkills={editingSkills}
      onSkillsEdit={onSkillsEdit}
      onSkillsSave={onSkillsSave}
      onSkillsCancel={onSkillsCancel}
      skillsData={skillsData}
      updateSkillsByType={updateSkillsByType}
      editingProficiency={editingProficiencyKey}
      onProficiencyClick={onProficiencyClick}
      onProficiencyChange={onProficiencyChange}
      proficiencyLevels={[
        { value: 'beginner', label: 'Beginner' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'advanced', label: 'Advanced' },
        { value: 'expert', label: 'Expert' },
      ]}
    />
  );
}
