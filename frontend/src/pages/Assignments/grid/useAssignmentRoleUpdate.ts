import type { Assignment } from '@/types/models';

export async function updateAssignmentRoleAction(params: {
  assignmentsApi: any;
  setPeople: React.Dispatch<React.SetStateAction<any[]>>;
  setAssignmentsData: React.Dispatch<React.SetStateAction<Assignment[]>>;
  people: any[];
  personId: number;
  assignmentId: number;
  roleId: number | null;
  roleName: string | null;
  showToast: (msg: string, type?: 'info'|'success'|'warning'|'error') => void;
}) {
  const { assignmentsApi, setPeople, setAssignmentsData, people, personId, assignmentId, roleId, roleName, showToast } = params;
  const person = people.find(p => p.id === personId);
  const assignment = person?.assignments.find((a: any) => a.id === assignmentId);
  if (!assignment) return;
  const prev = { id: assignment.roleOnProjectId ?? null, name: assignment.roleName ?? null };
  // optimistic update
  setPeople(prevPeople => prevPeople.map((p: any) => p.id === personId ? {
    ...p,
    assignments: p.assignments.map((a: any) => a.id === assignmentId ? { ...a, roleOnProjectId: roleId, roleName: roleName } : a)
  } : p));
  setAssignmentsData(prevAss => prevAss.map((a: any) => a.id === assignmentId ? { ...a, roleOnProjectId: roleId, roleName: roleName } : a));
  try {
    await assignmentsApi.update(assignmentId, { roleOnProjectId: roleId });
  } catch (err: any) {
    // revert
    setPeople(prevPeople => prevPeople.map((p: any) => p.id === personId ? {
      ...p,
      assignments: p.assignments.map((a: any) => a.id === assignmentId ? { ...a, roleOnProjectId: prev.id, roleName: prev.name } : a)
    } : p));
    setAssignmentsData(prevAss => prevAss.map((a: any) => a.id === assignmentId ? { ...a, roleOnProjectId: prev.id, roleName: prev.name } : a));
    showToast('Failed to update role: ' + (err?.message || 'Unknown error'), 'error');
  }
}

