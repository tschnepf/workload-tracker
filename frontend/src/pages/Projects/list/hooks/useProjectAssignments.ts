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
    // Fetch all pages to avoid partial lists and unstable ordering
    let page = 1;
    const all: Assignment[] = [];
    // Defensive upper bound to avoid accidental infinite loops
    for (let i = 0; i < 100; i++) {
      const resp = await assignmentsApi.list({ project: pid, page, page_size: 200 });
      const items = (resp?.results || []) as Assignment[];
      all.push(...items);
      const next = resp?.next;
      if (!next) break;
      try {
        const url = new URL(next);
        const nextPage = url.searchParams.get('page');
        page = nextPage ? Number(nextPage) : page + 1;
      } catch {
        page = page + 1;
      }
    }
    // Stable order by person name, then id
    all.sort((a, b) => {
      const an = (a as any).personName || '';
      const bn = (b as any).personName || '';
      if (an.toLowerCase() < bn.toLowerCase()) return -1;
      if (an.toLowerCase() > bn.toLowerCase()) return 1;
      return (a.id || 0) - (b.id || 0);
    });
    setAssignments(all);
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
      if (a.roleName) roles.add(a.roleName);
    });
    people.forEach((p) => {
      if (p.roleName) roles.add(p.roleName);
    });
    return Array.from(roles).sort();
  }, [assignments, people]);

  return { assignments, availableRoles, reload } as const;
}
