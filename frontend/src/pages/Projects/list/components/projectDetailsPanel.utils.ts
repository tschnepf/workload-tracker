import type { Assignment, Department, Person } from '@/types/models';
import type { ProjectRole } from '@/roles/api';

export type RoleMatch = {
  role: ProjectRole;
  deptId: number;
  deptName: string;
};

export function resolveSelectedDepartmentId(
  selectedPerson: Person | null | undefined,
  getPersonDepartmentId?: ((personId: number) => number | null) | undefined
): number | null {
  if (!selectedPerson) return null;
  if (typeof selectedPerson.department === 'number' && selectedPerson.department > 0) {
    return selectedPerson.department;
  }
  const selectedPersonId = selectedPerson.id;
  if (selectedPersonId == null || !getPersonDepartmentId) return null;
  const lookedUpDept = getPersonDepartmentId(selectedPersonId);
  return typeof lookedUpDept === 'number' && lookedUpDept > 0 ? lookedUpDept : null;
}

export function buildWeekKeys(currentWeekKey?: string): string[] {
  const base = currentWeekKey ? new Date(currentWeekKey.replace(/-/g, '/') + ' 00:00:00') : new Date();
  const monday = new Date(base);
  const dow = monday.getDay();
  monday.setDate(monday.getDate() - ((dow + 6) % 7));
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return [0, 7, 14, 21, 28, 35].map((off) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + off);
    return fmt(d);
  });
}

export function groupAssignmentsByDepartment(
  assignments: Assignment[],
  departments: Department[],
  getPersonDepartmentName?: ((personId: number) => string | null) | undefined
): Array<[string, Assignment[]]> {
  const departmentNameById = new Map<number, string>();
  departments.forEach((dept) => {
    if (dept.id != null) {
      departmentNameById.set(dept.id, dept.name || dept.shortName || `Dept #${dept.id}`);
    }
  });

  const groups = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    const deptId = (assignment as any).personDepartmentId as number | null | undefined;
    const personDeptName = assignment.person != null && getPersonDepartmentName
      ? getPersonDepartmentName(assignment.person)
      : null;
    const name = deptId != null
      ? (departmentNameById.get(deptId) || personDeptName || `Dept #${deptId}`)
      : (personDeptName || 'Unassigned');
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(assignment);
  }

  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export function computeRoleMatches(
  departments: Department[],
  rolesByDept: Record<number, ProjectRole[]>,
  roleSearchQuery: string
): RoleMatch[] {
  if (!roleSearchQuery) return [];
  const normalizedQuery = roleSearchQuery.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const matches: RoleMatch[] = [];
  departments.forEach((dept) => {
    if (dept.id == null) return;
    const roles = rolesByDept[dept.id] || [];
    roles.forEach((role) => {
      if (role.name.toLowerCase().includes(normalizedQuery)) {
        matches.push({
          role,
          deptId: dept.id as number,
          deptName: dept.shortName || dept.name || `Dept #${dept.id}`,
        });
      }
    });
  });

  return matches;
}
