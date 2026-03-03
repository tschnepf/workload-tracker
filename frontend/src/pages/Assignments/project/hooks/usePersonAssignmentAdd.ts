import { useCallback, useRef, useState } from 'react';
import type { ProjectRole } from '@/roles/api';

export function usePersonAssignmentAdd({
  searchPeople,
  searchRoles,
  onAddPerson,
  onAddRole,
}: {
  searchPeople: (query: string) => Promise<Array<{ id: number; name: string; department?: number | null }>>;
  searchRoles: (query: string) => Promise<Array<ProjectRole & { departmentName?: string }>>;
  onAddPerson: (projectId: number, person: { id: number; name: string; department?: number | null }, role?: ProjectRole | null) => Promise<void> | void;
  onAddRole: (projectId: number, role: ProjectRole & { departmentName?: string }) => Promise<void> | void;
}) {
  const [isAddingFor, setIsAddingFor] = useState<number | null>(null);
  const [newPersonName, setNewPersonName] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string; department?: number | null } | null>(null);
  const [selectedPersonRole, setSelectedPersonRole] = useState<ProjectRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<(ProjectRole & { departmentName?: string }) | null>(null);
  const [personResults, setPersonResults] = useState<Array<{ id: number; name: string; department?: number | null }>>([]);
  const [roleResults, setRoleResults] = useState<Array<ProjectRole & { departmentName?: string }>>([]);
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(-1);
  const latestQueryRef = useRef('');

  const open = useCallback((projectId: number) => {
    setIsAddingFor(projectId);
    setNewPersonName('');
    setSelectedPerson(null);
    setSelectedPersonRole(null);
    setSelectedRole(null);
    setPersonResults([]);
    setRoleResults([]);
    setShowPersonDropdown(false);
    setSelectedDropdownIndex(-1);
  }, []);

  const reset = useCallback(() => {
    setIsAddingFor(null);
    setNewPersonName('');
    setSelectedPerson(null);
    setSelectedPersonRole(null);
    setSelectedRole(null);
    setPersonResults([]);
    setRoleResults([]);
    setShowPersonDropdown(false);
    setSelectedDropdownIndex(-1);
  }, []);

  const cancel = useCallback(() => reset(), [reset]);

  const onSearchChange = useCallback(async (value: string) => {
    setNewPersonName(value);
    latestQueryRef.current = value;
    const trimmed = value.trim();
    if (!trimmed) {
      setPersonResults([]);
      setRoleResults([]);
      setShowPersonDropdown(false);
      setSelectedPerson(null);
      setSelectedPersonRole(null);
      setSelectedRole(null);
      return;
    }
    if (trimmed.length < 2) {
      setPersonResults([]);
      setRoleResults([]);
      setShowPersonDropdown(false);
      setSelectedPerson(null);
      setSelectedPersonRole(null);
      setSelectedRole(null);
      return;
    }
    const [peopleResults, rolesResults] = await Promise.allSettled([
      searchPeople(trimmed),
      searchRoles(trimmed),
    ]);
    if (latestQueryRef.current !== value) return;
    const nextPeople = peopleResults.status === 'fulfilled' ? (peopleResults.value || []) : [];
    const nextRoles = rolesResults.status === 'fulfilled' ? (rolesResults.value || []) : [];
    setPersonResults(nextPeople);
    setRoleResults(nextRoles);
    setShowPersonDropdown(nextPeople.length > 0 || nextRoles.length > 0);
    setSelectedPerson(null);
    setSelectedPersonRole(null);
    setSelectedRole(null);
    setSelectedDropdownIndex(-1);
  }, [searchPeople, searchRoles]);

  const onPersonSelect = useCallback((person: { id: number; name: string; department?: number | null }) => {
    setSelectedPerson(person);
    setSelectedPersonRole(null);
    setSelectedRole(null);
    setNewPersonName(person.name);
    setShowPersonDropdown(false);
    setPersonResults([]);
    setRoleResults([]);
    setSelectedDropdownIndex(-1);
  }, []);

  const onRoleSelect = useCallback((role: ProjectRole & { departmentName?: string }) => {
    setSelectedRole(role);
    setSelectedPerson(null);
    setSelectedPersonRole(null);
    setNewPersonName(role.name);
    setShowPersonDropdown(false);
    setPersonResults([]);
    setRoleResults([]);
    setSelectedDropdownIndex(-1);
  }, []);

  const onPersonRoleSelect = useCallback((role: ProjectRole | null) => {
    setSelectedPersonRole(role);
  }, []);

  const addSelected = useCallback(async (projectId: number) => {
    if (selectedPerson) {
      await onAddPerson(projectId, selectedPerson, selectedPersonRole);
      reset();
      return;
    }
    if (selectedRole) {
      await onAddRole(projectId, selectedRole);
      reset();
    }
  }, [onAddPerson, onAddRole, reset, selectedPerson, selectedRole, selectedPersonRole]);

  const addPerson = useCallback(async (projectId: number, person: { id: number; name: string; department?: number | null }, role?: ProjectRole | null) => {
    await onAddPerson(projectId, person, role);
    reset();
  }, [onAddPerson, reset]);

  const addRole = useCallback(async (projectId: number, role: ProjectRole & { departmentName?: string }) => {
    await onAddRole(projectId, role);
    reset();
  }, [onAddRole, reset]);

  return {
    isAddingFor,
    newPersonName,
    selectedPerson,
    selectedPersonRole,
    selectedRole,
    personResults,
    roleResults,
    showPersonDropdown,
    selectedDropdownIndex,
    setSelectedDropdownIndex,
    setShowPersonDropdown,
    open,
    reset,
    cancel,
    onSearchChange,
    onPersonSelect,
    onPersonRoleSelect,
    onRoleSelect,
    addSelected,
    addPerson,
    addRole,
  } as const;
}
