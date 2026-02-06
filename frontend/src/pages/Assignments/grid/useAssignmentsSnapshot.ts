import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Assignment, Deliverable, Project } from '@/types/models';
import { useWeekHeaders } from '@/pages/Assignments/grid/useWeekHeaders';
import { useAssignmentsPageSnapshot } from '@/pages/Assignments/hooks/useAssignmentsPageSnapshot';

export interface UseAssignmentsSnapshotArgs {
  weeksHorizon: number;
  departmentId?: number;
  includeChildren?: boolean;
  departmentFilters?: Array<{ departmentId: number; op: 'or' | 'and' | 'not' }>;
  vertical?: number;

  // External state setters (container-owned)
  setPeople: React.Dispatch<React.SetStateAction<any[]>>;
  setAssignmentsData: React.Dispatch<React.SetStateAction<Assignment[]>>;
  setProjectsData: React.Dispatch<React.SetStateAction<Project[]>>;
  setDeliverables: React.Dispatch<React.SetStateAction<Deliverable[]>>;
  setHoursByPerson: React.Dispatch<React.SetStateAction<Record<number, Record<string, number>>>>;

  // Optional loading behavior controls
  getHasData?: () => boolean;
  setIsFetching?: (v: boolean) => void;

  // Utilities
  subscribeGridRefresh: (fn: () => void) => () => void;
  trackPerformanceEvent?: (name: string, value: number, unit: string, tags?: Record<string, any>) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  setError: (msg: string | null) => void;
  setLoading: (v: boolean) => void;
}

export function useAssignmentsSnapshot(args: UseAssignmentsSnapshotArgs) {
  const { weeks, setFromSnapshot } = useWeekHeaders();

  const [isSnapshotMode, setIsSnapshotMode] = useState<boolean>(false);
  const [asyncJobId] = useState<string | null>(null);
  const [asyncProgress] = useState<number>(0);
  const [asyncMessage] = useState<string | undefined>(undefined);

  // Assignments page snapshot (React Query)
  const snapshot = useAssignmentsPageSnapshot({
    weeks: args.weeksHorizon,
    department: args.departmentId,
    includeChildren: args.includeChildren,
    departmentFilters: args.departmentFilters,
    vertical: args.vertical,
    include: 'assignment',
  });

  const loadData = useCallback(async () => {
    try {
      await snapshot.refetch();
    } catch (err: any) {
      console.warn('Assignments page snapshot refetch failed.', err);
    }
  }, [snapshot.refetch]);

  // Map snapshot into local state
  useEffect(() => {
    const data = snapshot.data;
    if (!data?.assignmentGridSnapshot) return;
    const grid = data.assignmentGridSnapshot;

    // Weeks from snapshot
    setFromSnapshot(grid.weekKeys || []);

    // People list from snapshot
    const peopleWithAssignments: any[] = (grid.people || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      weeklyCapacity: p.weeklyCapacity,
      department: p.department ?? null,
      assignments: [],
      isExpanded: false,
    }));
    args.setPeople(peopleWithAssignments);
    args.setAssignmentsData([]);

    // hoursByPerson map
    const hb: Record<number, Record<string, number>> = {};
    Object.entries(grid.hoursByPerson || {}).forEach(([pid, map]) => {
      hb[Number(pid)] = map as Record<string, number>;
    });
    args.setHoursByPerson(hb);

    // Deliverables + projects for UI
    if (data.deliverables) args.setDeliverables(data.deliverables as any);
    if (data.projects) args.setProjectsData(data.projects as any);

    setIsSnapshotMode(true);

    // Telemetry
    try {
      args.trackPerformanceEvent?.('assignments-grid-load', 1, 'count', {
        mode: 'snapshot',
        weeks: (grid.weekKeys || []).length,
        department: args.departmentId ?? null,
        include_children: args.includeChildren ? 1 : 0,
        vertical: args.vertical ?? null,
      });
    } catch {}
  }, [
    snapshot.data,
    args.setPeople,
    args.setAssignmentsData,
    args.setHoursByPerson,
    args.setDeliverables,
    args.setProjectsData,
    args.trackPerformanceEvent,
    args.departmentId,
    args.includeChildren,
    setFromSnapshot,
  ]);

  // Loading/error state wiring
  useEffect(() => {
    const hasData = args.getHasData ? args.getHasData() : false;
    if (snapshot.isLoading && !hasData) {
      args.setLoading(true);
    } else {
      args.setLoading(false);
    }
    if (args.setIsFetching) {
      args.setIsFetching(snapshot.isFetching && hasData);
    }
    if (snapshot.error) {
      args.setError('Failed to load assignment grid snapshot: ' + (snapshot.error?.message || 'Unknown error'));
    } else {
      args.setError(null);
    }
  }, [snapshot.isLoading, snapshot.isFetching, snapshot.error, args]);

  // Refresh grid on bus events
  useEffect(() => {
    const unsub = args.subscribeGridRefresh(() => {
      try { loadData(); } catch {}
    });
    return unsub;
  }, [args.subscribeGridRefresh, loadData]);

  const asyncJob = useMemo(() => ({ id: asyncJobId, progress: asyncProgress, message: asyncMessage }), [asyncJobId, asyncProgress, asyncMessage]);

  return {
    weeks,
    isSnapshotMode,
    loadData,
    asyncJob,
    departments: snapshot.data?.departments || [],
    setPeople: args.setPeople,
    setAssignmentsData: args.setAssignmentsData,
    setProjectsData: args.setProjectsData,
    setDeliverables: args.setDeliverables,
    setHoursByPerson: args.setHoursByPerson,
  } as const;
}

export type UseAssignmentsSnapshotReturn = ReturnType<typeof useAssignmentsSnapshot>;
