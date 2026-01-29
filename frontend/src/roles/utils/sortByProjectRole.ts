import type { Assignment } from '@/types/models';
import type { ProjectRole } from '@/roles/api';

/**
 * Sort assignments by department ProjectRole order, then by person name.
 * - Uses department-scoped ProjectRole arrays (already in server order).
 * - Falls back to bottom when role or department is missing.
 */
export function sortAssignmentsByProjectRole(
  assignments: Assignment[],
  rolesByDept: Record<number, ProjectRole[]>
): Assignment[] {
  // Precompute role order index maps per department for O(1) lookups
  const orderIndex: Record<number, Map<number, number>> = {};
  for (const [deptStr, roles] of Object.entries(rolesByDept)) {
    const deptId = Number(deptStr);
    if (!Number.isFinite(deptId)) continue;
    const map = new Map<number, number>();
    roles.forEach((r, idx) => map.set(r.id, idx));
    orderIndex[deptId] = map;
  }

  const getIdx = (a: Assignment) => {
    const deptId = (a as any).personDepartmentId as number | null | undefined;
    const roleId = (a.roleOnProjectId as number | null | undefined) ?? null;
    if (!deptId || !orderIndex[deptId] || roleId == null) return Number.MAX_SAFE_INTEGER;
    const idx = orderIndex[deptId].get(roleId);
    return idx == null ? Number.MAX_SAFE_INTEGER : idx;
  };

  const isPlaceholder = (a: Assignment) => a.person == null;

  const byName = (a: Assignment, b: Assignment) => {
    const an = ((a as any).personName || '').toString().toLowerCase();
    const bn = ((b as any).personName || '').toString().toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return (a.id || 0) - (b.id || 0);
  };

  const copy = [...assignments];
  copy.sort((a, b) => {
    const pa = isPlaceholder(a) ? 1 : 0;
    const pb = isPlaceholder(b) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    const ia = getIdx(a);
    const ib = getIdx(b);
    if (ia !== ib) return ia - ib;
    return byName(a, b);
  });
  return copy;
}
