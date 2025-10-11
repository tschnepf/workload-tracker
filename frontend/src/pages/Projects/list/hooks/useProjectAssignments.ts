import { useCallback, useMemo, useState } from 'react';
import type { Assignment, Person } from '@/types/models';
import { assignmentsApi } from '@/services/api';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';

interface UseProjectAssignmentsParams {
  projectId: number | undefined;
  people: Person[];
}

export function useProjectAssignments({ projectId, people }: UseProjectAssignmentsParams) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const reload = useCallback(async (pid: number) => {
    const response = await assignmentsApi.list({ project: pid });
    const projectAssignments = response.results || [];
    setAssignments(projectAssignments);
  }, []);

  // Load when selection changes (preserves original behavior via authenticated effect)
  useAuthenticatedEffect(() => {
    if (projectId) {
      reload(projectId).catch((err) => {
        console.error('Failed to load project assignments:', err);
      });
    } else {
      setAssignments([]);
    }
  }, [projectId, reload]);

  // Derive available roles from current assignments + global people list
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    assignments.forEach((a) => {
      if (a.roleOnProject) roles.add(a.roleOnProject);
    });
    people.forEach((p) => {
      if (p.role) roles.add(String(p.role));
    });
    return Array.from(roles).sort();
  }, [assignments, people]);

  return { assignments, availableRoles, reload } as const;
}

