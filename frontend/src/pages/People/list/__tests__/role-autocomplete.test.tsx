import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PersonDetailsPanel from '@/pages/People/list/components/PersonDetailsPanel';

describe('PersonDetailsPanel role autocomplete', () => {
  it('shows role options and selects one on click', () => {
    const person = { id: 1, name: 'Test User' } as any;
    const roles = [
      { id: 1, name: 'Engineer', isActive: true },
      { id: 2, name: 'Designer', isActive: true },
    ] as any;
    const departments: any[] = [];

    const onSaveField = vi.fn();
    const onFieldChange = vi.fn();
    const onEditName = vi.fn();
    const onNameSave = vi.fn();
    const onNameCancel = vi.fn();
    const setShowGearMenu = vi.fn();
    const setShowDeleteConfirm = vi.fn();
    const setLocationInputValue = vi.fn();
    const setShowLocationAutocomplete = vi.fn();
    const setSelectedLocationIndex = vi.fn();
    const setRoleInputValue = vi.fn();
    const setShowRoleAutocomplete = vi.fn();
    const setSelectedRoleIndex = vi.fn();
    const onSkillsEdit = vi.fn();
    const onSkillsSave = vi.fn();
    const onSkillsCancel = vi.fn();
    const updateSkillsByType = vi.fn();
    const onProficiencyClick = vi.fn();
    const onProficiencyChange = vi.fn();
    const selectRole = vi.fn();

    render(
      <PersonDetailsPanel
        person={person}
        roles={roles as any}
        departments={departments as any}
        isUpdating={false}
        editingName={false}
        editingPersonData={person as any}
        onFieldChange={onFieldChange}
        onSaveField={onSaveField}
        onEditName={onEditName}
        onNameSave={onNameSave}
        onNameCancel={onNameCancel}
        showGearMenu={false}
        setShowGearMenu={setShowGearMenu}
        showDeleteConfirm={false}
        setShowDeleteConfirm={setShowDeleteConfirm}
        onDelete={() => {}}
        locationInputValue={''}
        setLocationInputValue={setLocationInputValue}
        showLocationAutocomplete={false}
        setShowLocationAutocomplete={setShowLocationAutocomplete}
        selectedLocationIndex={-1}
        setSelectedLocationIndex={setSelectedLocationIndex}
        filteredLocations={[]}
        selectLocation={() => {}}
        roleInputValue={'Eng'}
        setRoleInputValue={setRoleInputValue}
        showRoleAutocomplete={true}
        setShowRoleAutocomplete={setShowRoleAutocomplete}
        selectedRoleIndex={-1}
        setSelectedRoleIndex={setSelectedRoleIndex}
        filteredRoles={[roles[0]] as any}
        selectRole={selectRole as any}
        editingSkills={false}
        onSkillsEdit={onSkillsEdit}
        onSkillsSave={onSkillsSave}
        onSkillsCancel={onSkillsCancel}
        skillsData={{ strengths: [], development: [], learning: [] } as any}
        updateSkillsByType={updateSkillsByType}
        editingProficiency={null}
        onProficiencyClick={onProficiencyClick}
        onProficiencyChange={onProficiencyChange as any}
        proficiencyLevels={[
          { value: 'beginner', label: 'Beginner' },
          { value: 'intermediate', label: 'Intermediate' },
          { value: 'advanced', label: 'Advanced' },
          { value: 'expert', label: 'Expert' },
        ]}
      />
    );

    // Dropdown should render the filtered role
    const option = screen.getByText('Engineer');
    expect(option).toBeTruthy();

    // Click the option to select
    fireEvent.click(option);
    expect(selectRole).toHaveBeenCalledWith(roles[0]);
  });

  it('navigates with ArrowDown + Enter to select role', async () => {
    const person = { id: 1, name: 'Test User' } as any;
    const roles = [
      { id: 1, name: 'Engineer', isActive: true },
      { id: 2, name: 'Designer', isActive: true },
    ] as any;

    const selectRole = vi.fn();

    const Harness = () => {
      const [roleInputValue, setRoleInputValue] = React.useState('');
      const [showRoleAutocomplete, setShowRoleAutocomplete] = React.useState(true);
      const [selectedRoleIndex, setSelectedRoleIndex] = React.useState(-1);
      const filteredRoles = roles as any;
      return (
        <PersonDetailsPanel
          person={person}
          roles={roles as any}
          departments={[] as any}
          isUpdating={false}
          editingName={false}
          editingPersonData={person as any}
          onFieldChange={() => {}}
          onSaveField={async () => {}}
          onEditName={() => {}}
          onNameSave={async () => {}}
          onNameCancel={() => {}}
          showGearMenu={false}
          setShowGearMenu={() => {}}
          showDeleteConfirm={false}
          setShowDeleteConfirm={() => {}}
          onDelete={() => {}}
          locationInputValue={''}
          setLocationInputValue={() => {}}
          showLocationAutocomplete={false}
          setShowLocationAutocomplete={() => {}}
          selectedLocationIndex={-1}
          setSelectedLocationIndex={() => {}}
          filteredLocations={[]}
          selectLocation={() => {}}
          roleInputValue={roleInputValue}
          setRoleInputValue={setRoleInputValue}
          showRoleAutocomplete={showRoleAutocomplete}
          setShowRoleAutocomplete={setShowRoleAutocomplete}
          selectedRoleIndex={selectedRoleIndex}
          setSelectedRoleIndex={setSelectedRoleIndex}
          filteredRoles={filteredRoles}
          selectRole={selectRole as any}
          editingSkills={false}
          onSkillsEdit={() => {}}
          onSkillsSave={async () => {}}
          onSkillsCancel={() => {}}
          skillsData={{ strengths: [], development: [], learning: [] } as any}
          updateSkillsByType={() => {}}
          editingProficiency={null}
          onProficiencyClick={() => {}}
          onProficiencyChange={() => {}}
          proficiencyLevels={[
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Intermediate' },
            { value: 'advanced', label: 'Advanced' },
            { value: 'expert', label: 'Expert' },
          ]}
        />
      );
    };

    const { getByPlaceholderText } = render(<Harness />);
    const input = getByPlaceholderText('Search roles...');
    // Open + ArrowDown to first option
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Press Enter, should select the first filtered role
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(selectRole).toHaveBeenCalledWith(roles[0]);
  });
});
