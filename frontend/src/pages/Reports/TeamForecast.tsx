import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '../../components/layout/Layout';
import Card from '../../components/ui/Card';
import { peopleApi, projectsApi, assignmentsApi, deliverablesApi, departmentsApi } from '../../services/api';
import { WorkloadForecastItem, Project, Assignment, Deliverable, Department } from '../../types/models';
import CapacityTimeline, { CapacityTimelineCompact } from '@/components/charts/CapacityTimeline';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { subscribeAssignmentsRefresh } from '@/lib/assignmentsRefreshBus';
import { subscribeDeliverablesRefresh } from '@/lib/deliverablesRefreshBus';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';
import { subscribeDepartmentsRefresh } from '@/lib/departmentsRefreshBus';

function fmt(date: Date): string { return date.toISOString().slice(0,10); }

const TeamForecastPage: React.FC = () => {
  const [weeks, setWeeks] = useState<number>(12);
  const [scale, setScale] = useState<'week'|'month'|'quarter'|'year'>('month');
  const { state: deptState, setDepartment } = useDepartmentFilter();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [forecast, setForecast] = useState<WorkloadForecastItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [depts, setDepts] = useState<Department[]>([]);
  const forecastRef = useRef<WorkloadForecastItem[]>([]);

  // Project timeline state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | ''>('');
  const [projAssignments, setProjAssignments] = useState<Assignment[]>([]);
  const [projDeliverables, setProjDeliverables] = useState<Deliverable[]>([]);
  const [projLoading, setProjLoading] = useState<boolean>(false);

  const [pendingDeptId, setPendingDeptId] = useState<number | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<number | ''>('');
  const forecastRefreshTimerRef = useRef<number | null>(null);
  const projectDetailsRefreshTimerRef = useRef<number | null>(null);
  const forecastRequestIdRef = useRef(0);
  const projectDetailsRequestIdRef = useRef(0);
  const projectsRequestIdRef = useRef(0);
  const departmentsRequestIdRef = useRef(0);

  useEffect(() => {
    setPendingDeptId(deptState.selectedDepartmentId ?? null);
  }, [deptState.selectedDepartmentId]);

  useEffect(() => {
    setPendingProjectId(selectedProject);
  }, [selectedProject]);

  useEffect(() => {
    forecastRef.current = forecast;
  }, [forecast]);

  const loadForecast = useCallback(async () => {
    const requestId = ++forecastRequestIdRef.current;
    const hasData = (forecastRef.current || []).length > 0;
    setIsLoading(!hasData);
    setIsFetching(hasData);
    setError(null);
    try {
      const data = await peopleApi.workloadForecast({
        weeks,
        department: deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId),
        include_children: deptState.includeChildren ? 1 : 0,
      });
      if (requestId === forecastRequestIdRef.current) setForecast(data || []);
    } catch (e: any) {
      if (requestId === forecastRequestIdRef.current) setError(e?.message || 'Failed to load forecast');
    } finally {
      if (requestId === forecastRequestIdRef.current) {
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [weeks, deptState.selectedDepartmentId, deptState.includeChildren]);

  useAuthenticatedEffect(() => {
    loadForecast();
  }, [loadForecast]);

  const loadProjects = useCallback(async () => {
    const requestId = ++projectsRequestIdRef.current;
    try {
      const p = await projectsApi.list({ page: 1, page_size: 200 });
      if (requestId === projectsRequestIdRef.current) setProjects(p.results || []);
    } catch {}
  }, []);

  const loadDepartments = useCallback(async () => {
    const requestId = ++departmentsRequestIdRef.current;
    try {
      const p = await departmentsApi.list({ page: 1, page_size: 500 });
      if (requestId === departmentsRequestIdRef.current) setDepts(p.results || []);
    } catch {}
  }, []);

  useAuthenticatedEffect(() => {
    loadProjects();
  }, [loadProjects]);
  useAuthenticatedEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const loadProjectDetails = useCallback(async () => {
    const requestId = ++projectDetailsRequestIdRef.current;
    if (!selectedProject) {
      setProjAssignments([]);
      setProjDeliverables([]);
      return;
    }
    setProjLoading(true);
    const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
    const inc = deptState.includeChildren ? 1 : 0;
    try {
      const [assigns, dels] = await Promise.all([
        assignmentsApi.list({ project: Number(selectedProject), department: dept, include_children: dept != null ? inc : undefined }).then(r => r.results || []),
        deliverablesApi.list(Number(selectedProject), { page: 1, page_size: 1000 }).then(r => r.results || [])
      ]);
      if (requestId === projectDetailsRequestIdRef.current) {
        setProjAssignments(assigns as any);
        setProjDeliverables(dels as any);
      }
    } finally {
      if (requestId === projectDetailsRequestIdRef.current) setProjLoading(false);
    }
  }, [selectedProject, deptState.selectedDepartmentId, deptState.includeChildren]);

  useAuthenticatedEffect(() => {
    loadProjectDetails();
  }, [loadProjectDetails]);

  useEffect(() => {
    const scheduleForecastRefresh = () => {
      if (forecastRefreshTimerRef.current) return;
      forecastRefreshTimerRef.current = window.setTimeout(() => {
        forecastRefreshTimerRef.current = null;
        loadForecast();
      }, 200);
    };
    const scheduleProjectDetailsRefresh = () => {
      if (projectDetailsRefreshTimerRef.current) return;
      projectDetailsRefreshTimerRef.current = window.setTimeout(() => {
        projectDetailsRefreshTimerRef.current = null;
        loadProjectDetails();
      }, 200);
    };

    const unsubscribeAssignments = subscribeAssignmentsRefresh((event) => {
      scheduleForecastRefresh();
      if (selectedProject && event?.projectId != null && Number(event.projectId) !== Number(selectedProject)) return;
      if (selectedProject) scheduleProjectDetailsRefresh();
    });
    const unsubscribeDeliverables = subscribeDeliverablesRefresh(() => {
      if (selectedProject) scheduleProjectDetailsRefresh();
    });
    const unsubscribeProjects = subscribeProjectsRefresh(() => {
      loadProjects();
      if (selectedProject) scheduleProjectDetailsRefresh();
    });
    const unsubscribeDepartments = subscribeDepartmentsRefresh(() => {
      loadDepartments();
      scheduleForecastRefresh();
      if (selectedProject) scheduleProjectDetailsRefresh();
    });

    return () => {
      unsubscribeAssignments();
      unsubscribeDeliverables();
      unsubscribeProjects();
      unsubscribeDepartments();
      if (forecastRefreshTimerRef.current) {
        window.clearTimeout(forecastRefreshTimerRef.current);
        forecastRefreshTimerRef.current = null;
      }
      if (projectDetailsRefreshTimerRef.current) {
        window.clearTimeout(projectDetailsRefreshTimerRef.current);
        projectDetailsRefreshTimerRef.current = null;
      }
    };
  }, [loadForecast, loadProjectDetails, loadProjects, loadDepartments, selectedProject]);

  const weekStarts = useMemo(() => (forecast || []).map(f => f.weekStart), [forecast]);

  const projWeeklyTotals = useMemo(() => {
    if (!weekStarts || weekStarts.length === 0) return [] as number[];
    const totals = new Array(weekStarts.length).fill(0);
    const mondayDates = weekStarts.map(ws => new Date(ws));
    for (const a of projAssignments) {
      const wh = (a as any).weeklyHours || {};
      for (let i = 0; i < mondayDates.length; i++) {
        const mon = mondayDates[i];
        let hours = 0;
        for (let off = -3; off <= 3; off++) {
          const d = new Date(mon); d.setDate(d.getDate()+off);
          const key = fmt(d);
          if (wh[key] != null) { hours = Number(wh[key]) || 0; break; }
        }
        totals[i] += hours;
      }
    }
    return totals;
  }, [projAssignments, weekStarts]);

  const handleApplyMobileFilters = () => {
    if (!isMobile) return;
    setDepartment(pendingDeptId != null ? pendingDeptId : null);
    setSelectedProject(pendingProjectId || '');
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Team Forecast & Project Timeline</h1>
            <p className="text-[var(--muted)] mt-1">Team utilization outlook and per-project weekly timeline</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">Weeks:</span>
            {[8, 12, 16].map(w => (
              <button key={w} onClick={() => setWeeks(w)} aria-pressed={weeks===w}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  weeks===w
                    ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                    : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted)] hover:bg-[var(--cardHover)] hover:text-[var(--text)]'
                }`}>
                {w}
              </button>
            ))}
          </div>
        </div>

        {isMobile && (
          <div className="-mx-4 px-4 py-3 bg-[var(--bg)] border-y border-[var(--border)] sticky top-0 z-[10] space-y-3 md:hidden">
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-[var(--muted)]">Department</div>
                <select
                  value={pendingDeptId ?? ''}
                  onChange={(e)=> {
                    const value = e.target.value ? Number(e.target.value) : null;
                    setPendingDeptId(value);
                  }}
                  className="mt-1 w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                >
                  <option value="">All Departments</option>
                  {depts.map(d => (
                    <option key={d.id} value={d.id as number}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--muted)]">Project</div>
                <select
                  value={pendingProjectId}
                  onChange={(e)=> setPendingProjectId(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1 w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
                >
                  <option value="">All projects</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id as number}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleApplyMobileFilters}
                className="inline-flex items-center rounded px-3 py-1 text-xs bg-[var(--primary)] text-white shadow-sm"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}

        <Card className="bg-[var(--card)] border-[var(--border)]">
          <div className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
              <div className="text-[var(--text)] font-semibold">Capacity Timeline</div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {/* Scale toggles */}
                {(['week','month','quarter','year'] as const).map(s => (
                  <button key={s} onClick={()=> setScale(s)} aria-pressed={scale===s}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      scale===s
                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                        : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted)] hover:bg-[var(--cardHover)] hover:text-[var(--text)]'
                    }`}>{s[0].toUpperCase()+s.slice(1)}</button>
                ))}
                {/* Department filter (desktop) */}
                <select
                  value={deptState.selectedDepartmentId ?? ''}
                  onChange={(e)=> setDepartment(e.target.value ? Number(e.target.value) : null)}
                  className="hidden md:block ml-3 px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[var(--primary)]"
                >
                  <option value="">All Departments</option>
                  {depts.map(d => <option key={d.id} value={d.id as number}>{d.name}</option>)}
                </select>
              </div>
            </div>
            {isLoading ? (
              <div className="text-[var(--muted)]">Loading forecast...</div>
            ) : error ? (
              <div className="text-red-400">{error}</div>
            ) : (
              isMobile ? (
                <CapacityTimelineCompact weeklyData={forecast} scale={scale} />
              ) : (
                <CapacityTimeline weeklyData={forecast} scale={scale} />
              )
            )}
            {isFetching ? (
              <div className="mt-2 text-xs text-[var(--muted)]">Refreshing forecast…</div>
            ) : null}
          </div>
        </Card>

        <Card className="bg-[var(--card)] border-[var(--border)]">
          <div className="p-4 space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <div className="text-[var(--text)] font-semibold">Project Timeline</div>
              <select
                value={selectedProject}
                onChange={(e)=> setSelectedProject(e.target.value? Number(e.target.value):'')}
                className="hidden md:inline-block px-2 py-1 text-sm bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[var(--primary)] focus:outline-none min-w-[220px]"
              >
                <option value="">Select a project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id as number}>{p.name}</option>
                ))}
              </select>
              {isMobile && selectedProject && (
                <div className="text-xs text-[var(--muted)]">
                  Project: {projects.find((p) => p.id === selectedProject)?.name ?? 'Selected project'}
                </div>
              )}
            </div>
            {selectedProject === '' ? (
              <div className="text-[var(--muted)]">Choose a project to view its weekly assignment timeline and deliverable markers.</div>
            ) : projLoading ? (
              <div className="text-[var(--muted)]">Loading project data...</div>
            ) : (
              <ProjectTimeline weeks={weeks} weekStarts={weekStarts} weeklyTotals={projWeeklyTotals} deliverables={projDeliverables} />
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
};

// Old ForecastChart removed in favor of CapacityTimeline

const ProjectTimeline: React.FC<{ weeks:number; weekStarts:string[]; weeklyTotals:number[]; deliverables: Deliverable[] }>=({ weeks, weekStarts, weeklyTotals, deliverables })=>{
  if (!weekStarts || weekStarts.length===0) return <div className="text-[var(--muted)]">No data</div>;
  const max = Math.max(10, ...weeklyTotals) * 1.1;
  return (
    <div className="space-y-2">
      <div style={{ overflowX:'auto' }}>
        <div className="grid" style={{ gridTemplateColumns:`repeat(${weekStarts.length}, 56px)`, gap: '8px' }}>
          {weeklyTotals.map((v,i)=> {
            const h = Math.max(2, Math.round((v/max)*120));
            return (
              <div key={i} className="flex flex-col items-center">
                <div title={`${v}h`} className="w-full bg-[var(--border)] rounded" style={{ height: 124 }}>
                  <div className="bg-[var(--primary)] rounded" style={{ height: h }} />
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-1">{weekStarts[i].slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-[var(--text)] text-xs">Deliverables: {deliverables?.length || 0}</div>
    </div>
  );
}

export default TeamForecastPage;
