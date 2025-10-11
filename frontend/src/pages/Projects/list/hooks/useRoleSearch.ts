import { useState, useCallback } from 'react';
import type { Person, Assignment } from '@/types/models';

export function useRoleSearch(
  availableRoles: string[],
  getSkillBasedRoleSuggestions: (person: Person | null) => string[],
) {
  const [roleSearchResults, setRoleSearchResults] = useState<string[]>([]);

  const handleNewAssignmentRoleSearch = (searchTerm: string, selectedPerson: Person | null, setRole: (role: string) => void) => {
    setRole(searchTerm);

    if (searchTerm.length < 1) {
      setRoleSearchResults([]);
      return;
    }

    const filteredExistingRoles = availableRoles.filter((role) => role.toLowerCase().includes(searchTerm.toLowerCase()));
    const skillSuggestions = selectedPerson ? getSkillBasedRoleSuggestions(selectedPerson) : [];
    const filteredSkillRoles = skillSuggestions.filter((role) => role.toLowerCase().includes(searchTerm.toLowerCase()));
    const allRoles = [...filteredSkillRoles, ...filteredExistingRoles];
    const uniqueRoles = Array.from(new Set(allRoles)).slice(0, 5);
    setRoleSearchResults(uniqueRoles);
  };

  const handleNewAssignmentRoleSelect = (role: string, setRole: (role: string) => void) => {
    setRole(role);
    setRoleSearchResults([]);
  };

  return { roleSearchResults, setRoleSearchResults, handleNewAssignmentRoleSearch, handleNewAssignmentRoleSelect } as const;
}

