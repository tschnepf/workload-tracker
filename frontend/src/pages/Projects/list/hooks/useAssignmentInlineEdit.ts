import { useCallback, useState } from 'react';
import type { Assignment, Person } from '@/types/models';
import { assignmentsApi } from '@/services/api';
import { updateAssignment } from '@/lib/mutations/assignments';

interface EditData {
  roleOnProject: string; // kept for UI state only (label), not persisted
  currentWeekHours: number;
  roleSearch: string;
}

interface Params {
  assignments: Assignment[];
  people: Person[];
  availableRoles: string[];
  selectedProjectId: number | null | undefined;
  invalidateFilterMeta: () => Promise<void>;
  reloadAssignments: (projectId: number) => Promise<void>;
  getSkillBasedRoleSuggestions: (person: Person | null) => string[];
}

export function useAssignmentInlineEdit({
  assignments,
  people,
  availableRoles,
  selectedProjectId,
  invalidateFilterMeta,
  reloadAssignments,
  getSkillBasedRoleSuggestions,
}: Params) {
  const [editingAssignment, setEditingAssignment] = useState<number | null>(null);
  const [editData, setEditData] = useState<EditData>({ roleOnProject: '', currentWeekHours: 0, roleSearch: '' });
  const [roleSearchResults, setRoleSearchResults] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const getCurrentWeekKey = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    return monday.toISOString().split('T')[0];
  };

  const getCurrentWeekHours = (assignment: Assignment): number => {
    const key = getCurrentWeekKey();
    return assignment.weeklyHours?.[key] || 0;
  };

  const checkAssignmentConflicts = async (personId: number, projectId: number, weekKey: string, newHours: number): Promise<string[]> => {
    try {
      const conflictResponse = await assignmentsApi.checkConflicts(personId, projectId, weekKey, newHours);
      return conflictResponse.warnings;
    } catch (e) {
      console.error('Failed to check assignment conflicts:', e);
      return [];
    }
  };

  const handleEditAssignment = useCallback((assignment: Assignment) => {
    setEditingAssignment(assignment.id!);
    const currentWeekHours = getCurrentWeekHours(assignment);
    const existingRole = assignment.roleName || '';
    setEditData({ roleOnProject: existingRole, currentWeekHours, roleSearch: existingRole });
    setRoleSearchResults([]);
  }, []);

  const handleRoleSearch = useCallback((searchTerm: string) => {
    setEditData((prev) => ({ ...prev, roleSearch: searchTerm, roleOnProject: searchTerm }));
    if (searchTerm.length < 1) {
      setRoleSearchResults([]);
      return;
    }
    const filteredExistingRoles = availableRoles.filter((role) => role.toLowerCase().includes(searchTerm.toLowerCase()));
    const editingAssignmentData = assignments.find((a) => a.id === editingAssignment);
    const editingPerson = editingAssignmentData ? people.find((p) => p.id === editingAssignmentData.person) : null;
    const skillSuggestions = editingPerson ? getSkillBasedRoleSuggestions(editingPerson) : [];
    const filteredSkillRoles = skillSuggestions.filter((role) => role.toLowerCase().includes(searchTerm.toLowerCase()));
    const allRoles = [...filteredSkillRoles, ...filteredExistingRoles];
    const uniqueRoles = Array.from(new Set(allRoles)).slice(0, 5);
    setRoleSearchResults(uniqueRoles);
  }, [availableRoles, assignments, people, editingAssignment, getSkillBasedRoleSuggestions]);

  const handleRoleSelect = (role: string) => {
    setEditData((prev) => ({ ...prev, roleOnProject: role, roleSearch: role }));
    setRoleSearchResults([]);
  };

  const handleSaveEdit = async (assignmentId: number) => {
    try {
      const assignment = assignments.find((a) => a.id === assignmentId);
      if (!assignment) return;

      const key = getCurrentWeekKey();
      const currentWeekHours = assignment.weeklyHours?.[key] || 0;
      const hoursChange = editData.currentWeekHours - currentWeekHours;
      if (hoursChange > 0 && selectedProjectId) {
        const conflictWarnings = await checkAssignmentConflicts(assignment.person, selectedProjectId, key, hoursChange);
        setWarnings(conflictWarnings);
      } else {
        setWarnings([]);
      }

      const updatedWeeklyHours = { ...assignment.weeklyHours, [key]: editData.currentWeekHours };
      // Save hours only. Role changes are handled immediately via RoleDropdown using roleOnProjectId.
      await updateAssignment(assignmentId, { weeklyHours: updatedWeeklyHours }, assignmentsApi);
      if (selectedProjectId) {
        await reloadAssignments(selectedProjectId);
      }
      await invalidateFilterMeta();
      setEditingAssignment(null);
      setRoleSearchResults([]);
    } catch (e) {
      console.error('Failed to update assignment:', e);
      // surface error remains caller's responsibility
    }
  };

  const handleCancelEdit = () => {
    setEditingAssignment(null);
    setRoleSearchResults([]);
    setWarnings([]);
    setEditData({ roleOnProject: '', currentWeekHours: 0, roleSearch: '' });
  };

  return {
    editingAssignment,
    editData,
    roleSearchResults,
    warnings,
    setEditData,
    getCurrentWeekHours,
    getCurrentWeekKey,
    handleEditAssignment,
    handleRoleSearch,
    handleRoleSelect,
    handleSaveEdit,
    handleCancelEdit,
  } as const;
}
