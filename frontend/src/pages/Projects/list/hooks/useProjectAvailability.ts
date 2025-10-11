import { useMemo, useState } from 'react';
import { projectsApi } from '@/services/api';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';

interface Params {
  projectId: number | undefined;
  departmentId?: number | null;
  includeChildren?: boolean;
  candidatesOnly?: boolean;
}

export function useProjectAvailability({ projectId, departmentId, includeChildren, candidatesOnly }: Params) {
  const [availabilityMap, setAvailabilityMap] = useState<Record<number, { availableHours: number; utilizationPercent: number; totalHours: number; capacity: number }>>({});

  // Compute Monday anchor (canonical week) per existing behavior
  const mondayIso = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return monday.toISOString().split('T')[0];
  }, []);

  useAuthenticatedEffect(() => {
    const load = async () => {
      try {
        if (!projectId) {
          setAvailabilityMap({});
          return;
        }
        const dept = departmentId != null ? Number(departmentId) : undefined;
        const inc = dept != null ? (includeChildren ? 1 : 0) : undefined;
        const items = await projectsApi.getAvailability(projectId as number, mondayIso, {
          candidates_only: candidatesOnly ? 1 : 0,
          department: dept,
          include_children: inc,
        });
        const map: Record<number, { availableHours: number; utilizationPercent: number; totalHours: number; capacity: number }> = {};
        for (const it of items) {
          map[it.personId] = {
            availableHours: it.availableHours || 0,
            utilizationPercent: it.utilizationPercent || 0,
            totalHours: it.totalHours || 0,
            capacity: it.capacity || 0,
          };
        }
        setAvailabilityMap(map);
      } catch (e) {
        console.warn('Failed to load project availability; falling back to zero availability.', e);
        setAvailabilityMap({});
      }
    };
    load();
  }, [projectId, departmentId, includeChildren, candidatesOnly, mondayIso]);

  return { availabilityMap } as const;
}

