import type { Assignment } from '@/types/models';
import { updateAssignment } from '@/lib/mutations/assignments';

export async function updateAssignmentRoleAction(params: {
  assignmentsApi: any;
  setPeople: React.Dispatch<React.SetStateAction<any[]>>;
  setAssignmentsData: React.Dispatch<React.SetStateAction<Assignment[]>>;
  assignmentsData?: Assignment[];
  people: any[];
  personId: number;
  assignmentId: number;
  roleId: number | null;
  roleName: string | null;
  showToast: (msg: string, type?: 'info'|'success'|'warning'|'error') => void;
}) {
  const {
    assignmentsApi,
    setPeople,
    setAssignmentsData,
    assignmentsData,
    people,
    personId,
    assignmentId,
    roleId,
    roleName,
    showToast,
  } = params;
  const person = people.find(p => p.id === personId);
  const assignmentFromPerson = Array.isArray(person?.assignments)
    ? person.assignments.find((a: any) => a?.id === assignmentId)
    : null;
  const assignmentFromData = Array.isArray(assignmentsData)
    ? assignmentsData.find((a) => a?.id === assignmentId)
    : null;
  const assignment = assignmentFromPerson || assignmentFromData;
  const prev = { id: assignment?.roleOnProjectId ?? null, name: assignment?.roleName ?? null };
  // optimistic update
  setPeople(prevPeople => prevPeople.map((p: any) => p.id === personId ? {
    ...p,
    assignments: Array.isArray(p.assignments)
      ? p.assignments.map((a: any) => a.id === assignmentId ? { ...a, roleOnProjectId: roleId, roleName: roleName } : a)
      : p.assignments
  } : p));
  setAssignmentsData(prevAss => prevAss.map((a: any) => a.id === assignmentId ? { ...a, roleOnProjectId: roleId, roleName: roleName } : a));
  try {
    await updateAssignment(assignmentId, { roleOnProjectId: roleId }, assignmentsApi);
    return true;
  } catch (err: any) {
    // revert
    setPeople(prevPeople => prevPeople.map((p: any) => p.id === personId ? {
      ...p,
      assignments: Array.isArray(p.assignments)
        ? p.assignments.map((a: any) => a.id === assignmentId ? { ...a, roleOnProjectId: prev.id, roleName: prev.name } : a)
        : p.assignments
    } : p));
    setAssignmentsData(prevAss => prevAss.map((a: any) => a.id === assignmentId ? { ...a, roleOnProjectId: prev.id, roleName: prev.name } : a));
    showToast('Failed to update role: ' + (err?.message || 'Unknown error'), 'error');
    return false;
  }
}
