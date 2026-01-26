import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Assignment, Deliverable, Project } from '@/types/models';
import { useWeekHeaders } from '@/pages/Assignments/grid/useWeekHeaders';

export interface UseAssignmentsSnapshotArgs {
  weeksHorizon: number;
  departmentId?: number;
  includeChildren?: boolean;
  capsAsyncJobs: boolean;

  // APIs
  assignmentsApi: any;
  peopleApi: any;
  deliverablesApi: any;
  projectsApi: any;
  jobsApi: any;

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
  const [asyncJobId, setAsyncJobId] = useState<string | null>(null);
  const [asyncProgress, setAsyncProgress] = useState<number>(0);
  const [asyncMessage, setAsyncMessage] = useState<string | undefined>(undefined);

  const loadData = useCallback(async () => {
    const pageSize = 100;
    try {
      const hasData = args.getHasData ? args.getHasData() : false;
      args.setLoading(!hasData);
      if (args.setIsFetching) args.setIsFetching(hasData);
      args.setError(null);

      const dept = args.departmentId == null ? undefined : Number(args.departmentId);
      const inc = dept != null ? (args.includeChildren ? 1 : 0) : undefined;

      const targetWeeks = args.weeksHorizon;

      // Heuristic to choose async job
      let estimatedCount = 0;
      try {
        const headPage = await args.peopleApi.list({ page: 1, page_size: 1, department: dept, include_children: inc });
        estimatedCount = (headPage as any)?.count ?? 0;
      } catch {}
      const shouldUseAsync = args.capsAsyncJobs && (targetWeeks > 20 || estimatedCount > 400);

      let snapshot: { weekKeys: string[]; people: any[]; hoursByPerson: Record<string, Record<string, number>> };
      if (shouldUseAsync) {
        try {
          const { jobId } = await args.assignmentsApi.getGridSnapshotAsync({ weeks: targetWeeks, department: dept, include_children: inc });
          setAsyncJobId(jobId);
          setAsyncProgress(0);
          // Manual polling for progress
          while (true) {
            const s = await args.jobsApi.getStatus(jobId);
            setAsyncProgress(s.progress || 0);
            setAsyncMessage(s.message || undefined);
            if (s.state === 'SUCCESS') {
              if (s.result && (s.result as any).weekKeys) {
                snapshot = s.result as any;
              } else {
                throw new Error('Missing result');
              }
              break;
            }
            if (s.state === 'FAILURE') {
              throw new Error(s.error || 'Job failed');
            }
            await new Promise(r => setTimeout(r, 1500));
          }
        } catch (e: any) {
          console.warn('Async snapshot failed; falling back to sync path.', e);
          args.showToast('Async snapshot failed, using sync path', 'warning');
          const resp = await args.assignmentsApi.getGridSnapshot({ weeks: targetWeeks, department: dept, include_children: inc });
          snapshot = resp as any;
        } finally {
          setAsyncJobId(null);
          setAsyncProgress(0);
          setAsyncMessage(undefined);
        }
      } else {
        snapshot = await args.assignmentsApi.getGridSnapshot({ weeks: targetWeeks, department: dept, include_children: inc }) as any;
      }

      // Weeks from snapshot
      setFromSnapshot(snapshot.weekKeys || []);

      // People list from snapshot
      const peopleWithAssignments: any[] = (snapshot.people || []).map((p: any) => ({
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
      Object.entries(snapshot.hoursByPerson || {}).forEach(([pid, map]) => {
        hb[Number(pid)] = map as Record<string, number>;
      });
      args.setHoursByPerson(hb);

      // Deliverables + projects for UI
      const [deliverablesData, projectsPage] = await Promise.all([
        (async () => {
          // Prefer calendar API scoped to visible window; fallback to listAll
          try {
            const wk = (snapshot.weekKeys || []) as string[];
            if (wk.length > 0) {
              const start = wk[0];
              const endDate = new Date(wk[wk.length - 1].replace(/-/g, '/'));
              endDate.setDate(endDate.getDate() + 6); // include full last week
              const end = endDate.toISOString().slice(0, 10);
              const items = await args.deliverablesApi.calendar(start, end);
              // Coerce to Deliverable-like objects expected by downstream indexer
              const mapped = (items || []).map((it: any) => {
                const title = (it as any).title ?? '';
                // Extract percentage from title if not provided by API
                let pct: number | undefined = undefined;
                const m = String(title).match(/(\d{1,3})\s*%/);
                if (m) { const n = parseInt(m[1], 10); if (!Number.isNaN(n) && n >= 0 && n <= 100) pct = n; }
                return {
                  id: it.id,
                  project: it.project,
                  date: it.date,
                  description: title,
                  percentage: (it as any).percentage ?? pct,
                };
              });
              return mapped;
            }
          } catch {}
          try {
            return await args.deliverablesApi.listAll();
          } catch {
            // Last resort: grab large first page
            const page = await args.deliverablesApi.list(undefined, { page: 1, page_size: 1000 });
            return page.results || [];
          }
        })(),
        args.projectsApi.list({ page: 1, page_size: pageSize })
      ]);
      args.setDeliverables(deliverablesData || []);
      args.setProjectsData(projectsPage.results || []);
      setIsSnapshotMode(true);

      // Telemetry
      try {
        args.trackPerformanceEvent?.('assignments-grid-load', 1, 'count', {
          mode: 'snapshot',
          weeks: (snapshot.weekKeys || []).length,
          department: args.departmentId ?? null,
          include_children: args.includeChildren ? 1 : 0,
        });
      } catch {}
    } catch (err: any) {
      console.warn('Grid snapshot unavailable; not using client aggregation.', err);
      args.setError('Failed to load assignment grid snapshot: ' + (err?.message || 'Unknown error'));
    } finally {
      args.setLoading(false);
      if (args.setIsFetching) args.setIsFetching(false);
    }
  }, [args]);

  // Refresh grid on bus events
  useEffect(() => {
    const unsub = args.subscribeGridRefresh(() => {
      try { loadData(); } catch {}
    });
    return unsub;
  }, [args.subscribeGridRefresh, loadData]);

  const asyncJob = useMemo(() => ({ id: asyncJobId, progress: asyncProgress, message: asyncMessage }), [asyncJobId, asyncProgress, asyncMessage]);

  return { weeks, isSnapshotMode, loadData, asyncJob, setPeople: args.setPeople, setAssignmentsData: args.setAssignmentsData, setProjectsData: args.setProjectsData, setDeliverables: args.setDeliverables, setHoursByPerson: args.setHoursByPerson } as const;
}

export type UseAssignmentsSnapshotReturn = ReturnType<typeof useAssignmentsSnapshot>;
