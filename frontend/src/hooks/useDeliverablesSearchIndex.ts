import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliverableCalendarUnion } from '@/features/fullcalendar/eventAdapters';
import { assignmentsApi, departmentsApi } from '@/services/api';

export type DeliverablesSearchIndex = {
  projectPeople: Map<number, Set<string>>;
  projectDepartments: Map<number, Set<string>>;
};

type Options = {
  enabled?: boolean;
  vertical?: number | null;
};

export function useDeliverablesSearchIndex(items: DeliverableCalendarUnion[], options?: Options) {
  const projectIds = useMemo(() => {
    const ids = new Set<number>();
    for (const item of items || []) {
      const projectId = (item as any)?.project ?? null;
      if (Number.isFinite(projectId)) ids.add(Number(projectId));
    }
    return Array.from(ids.values()).sort((a, b) => a - b);
  }, [items]);

  const vertical = options?.vertical ?? null;
  const enabled = (options?.enabled ?? true) && projectIds.length > 0;
  const projectKey = projectIds.join(',');

  return useQuery<DeliverablesSearchIndex, Error>({
    queryKey: ['deliverables-search-index', projectKey, vertical ?? 'all'],
    enabled,
    queryFn: async () => {
      const [assignments, departments] = await Promise.all([
        assignmentsApi.listAll({
          project_ids: projectIds,
          include_placeholders: 0,
          vertical: vertical ?? undefined,
        }, { noCache: true }),
        departmentsApi.listAll({ vertical: vertical ?? undefined }),
      ]);

      const deptNameById = new Map<number, string>();
      (departments || []).forEach((dept: any) => {
        if (dept?.id != null && dept?.name) deptNameById.set(Number(dept.id), dept.name);
      });

      const projectPeople = new Map<number, Set<string>>();
      const projectDepartments = new Map<number, Set<string>>();

      (assignments || []).forEach((assignment: any) => {
        const projectId = assignment?.project;
        if (!Number.isFinite(projectId)) return;
        const pid = Number(projectId);
        const personName = (assignment?.personName || '').trim();
        if (personName) {
          const set = projectPeople.get(pid) ?? new Set<string>();
          set.add(personName);
          projectPeople.set(pid, set);
        }
        const deptId = assignment?.personDepartmentId ?? assignment?.personDepartment ?? null;
        if (Number.isFinite(deptId)) {
          const deptName = deptNameById.get(Number(deptId));
          if (deptName) {
            const set = projectDepartments.get(pid) ?? new Set<string>();
            set.add(deptName);
            projectDepartments.set(pid, set);
          }
        }
      });

      return { projectPeople, projectDepartments };
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}
