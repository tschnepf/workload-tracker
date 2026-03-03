import { useEffect, useMemo, useRef, useState } from 'react';
import type { Department } from '@/types/models';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import { listProjectRoles, listProjectRolesBulk, type ProjectRole } from '@/roles/api';
import type { AddAssignmentState } from '@/pages/Projects/list/types';
import {
  computeRoleMatches,
  resolveSelectedDepartmentId,
  type RoleMatch,
} from '@/pages/Projects/list/components/projectDetailsPanel.utils';

interface Params {
  addAssignmentState: AddAssignmentState;
  showAddAssignment: boolean;
  departments: Department[];
  personSearchResultsLength: number;
  getPersonDepartmentId?: (personId: number) => number | null;
}

/**
 * Handles department-scoped role loading, cross-department role matching,
 * and dropdown placement for the add-assignment search surface.
 */
export function useAddAssignmentRoleSearch({
  addAssignmentState,
  showAddAssignment,
  departments,
  personSearchResultsLength,
  getPersonDepartmentId,
}: Params) {
  const selectedDeptId = useMemo(
    () => resolveSelectedDepartmentId(addAssignmentState?.selectedPerson, getPersonDepartmentId),
    [addAssignmentState?.selectedPerson, getPersonDepartmentId]
  );

  const { data: addRoles = [] } = useProjectRoles(selectedDeptId ?? undefined);
  const [rolesByDept, setRolesByDept] = useState<Record<number, ProjectRole[]>>({});

  const roleSearchQuery = addAssignmentState.personSearch.trim().toLowerCase();
  const roleMatches: RoleMatch[] = useMemo(
    () => computeRoleMatches(departments, rolesByDept, roleSearchQuery),
    [departments, rolesByDept, roleSearchQuery]
  );

  const isPersonSearchOpen = addAssignmentState.personSearch.trim().length > 0
    && (personSearchResultsLength > 0 || roleMatches.length > 0);

  const personSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [personSearchDropdownAbove, setPersonSearchDropdownAbove] = useState(false);

  useEffect(() => {
    if (!showAddAssignment || !isPersonSearchOpen) return;
    const updatePlacement = () => {
      const el = personSearchInputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dropdownHeight = 260;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setPersonSearchDropdownAbove(spaceBelow < dropdownHeight && spaceAbove > spaceBelow);
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isPersonSearchOpen, personSearchResultsLength, roleMatches.length, showAddAssignment]);

  useEffect(() => {
    if (!showAddAssignment || !roleSearchQuery) return;

    const missing = departments
      .map((dept) => (dept.id != null && !rolesByDept[dept.id] ? Number(dept.id) : null))
      .filter((deptId): deptId is number => typeof deptId === 'number' && deptId > 0);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const bulk = await listProjectRolesBulk(missing);
        if (cancelled) return;
        setRolesByDept((prev) => {
          const next = { ...prev };
          let changed = false;
          missing.forEach((deptId) => {
            if (next[deptId]) return;
            next[deptId] = bulk[deptId] || [];
            changed = true;
          });
          return changed ? next : prev;
        });
      } catch {
        await Promise.all(missing.map(async (deptId) => {
          try {
            const roles = await listProjectRoles(deptId);
            if (cancelled) return;
            setRolesByDept((prev) => (prev[deptId] ? prev : { ...prev, [deptId]: roles }));
          } catch {}
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [departments, roleSearchQuery, rolesByDept, showAddAssignment]);

  return {
    selectedDeptId,
    addRoles,
    roleSearchQuery,
    roleMatches,
    isPersonSearchOpen,
    personSearchInputRef,
    personSearchDropdownAbove,
  } as const;
}
