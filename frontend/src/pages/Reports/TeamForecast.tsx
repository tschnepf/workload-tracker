import React, { useMemo, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '../../components/layout/Layout';
import Card from '../../components/ui/Card';
import { peopleApi, projectsApi, assignmentsApi, deliverablesApi, departmentsApi } from '../../services/api';
import { WorkloadForecastItem, Project, Assignment, Deliverable, Department } from '../../types/models';
import CapacityTimeline from '@/components/charts/CapacityTimeline';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';

function fmt(date: Date): string { return date.toISOString().slice(0,10); }

const TeamForecastPage: React.FC = () => {
  const [weeks, setWeeks] = useState<number>(12);
  const [scale, setScale] = useState<'week'|'month'|'quarter'|'year'>('month');
  const { state: deptState, setDepartment } = useDepartmentFilter();
  const [forecast, setForecast] = useState<WorkloadForecastItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [depts, setDepts] = useState<Department[]>([]);

  // Project timeline state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | ''>('');
  const [projAssignments, setProjAssignments] = useState<Assignment[]>([]);
  const [projDeliverables, setProjDeliverables] = useState<Deliverable[]>([]);
  const [projLoading, setProjLoading] = useState<boolean>(false);

  useAuthenticatedEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    peopleApi.workloadForecast({
      weeks,
      department: deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId),
      include_children: deptState.includeChildren ? 1 : 0,
    })
      .then(data => { if (active) setForecast(data || []); })
      .catch(e => { if (active) setError(e?.message || 'Failed to load forecast'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [weeks, deptState.selectedDepartmentId, deptState.includeChildren]);

  useAuthenticatedEffect(() => {
    projectsApi.list({ page: 1, page_size: 200 })
      .then(p => setProjects(p.results || []))
      .catch(() => {});
  }, []);
  useAuthenticatedEffect(() => {
    departmentsApi.list({ page: 1, page_size: 500 })
      .then(p => setDepts(p.results || []))
      .catch(()=>{});
  }, []);

  useAuthenticatedEffect(() => {
    if (!selectedProject) { setProjAssignments([]); setProjDeliverables([]); return; }
    let active = true;
    setProjLoading(true);
    const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
    const inc = deptState.includeChildren ? 1 : 0;
    Promise.all([
      assignmentsApi.list({ project: Number(selectedProject), department: dept, include_children: dept != null ? inc : undefined }).then(r => r.results || []),
      deliverablesApi.list(Number(selectedProject), { page: 1, page_size: 1000 }).then(r => r.results || [])
    ]).then(([assigns, dels]) => {
      if (!active) return;
      setProjAssignments(assigns as any);
      setProjDeliverables(dels as any);
    }).finally(() => { if (active) setProjLoading(false); });
    return () => { active = false; };
  }, [selectedProject, deptState.selectedDepartmentId, deptState.includeChildren]);

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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#cccccc]">Team Forecast & Project Timeline</h1>
            <p className="text-[#969696] mt-1">Team utilization outlook and per-project weekly timeline</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#cbd5e1]">Weeks:</span>
            {[8, 12, 16].map(w => (
              <button key={w} onClick={() => setWeeks(w)} aria-pressed={weeks===w}
                className={`px-2 py-1 text-xs rounded ${weeks===w? 'bg-[#007acc] text-white':'bg-[#3e3e42] text-[#cbd5e1] hover:bg-[#4e4e52]'}`}>
                {w}
              </button>
            ))}
          </div>
        </div>

        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[#cccccc] font-semibold">Capacity Timeline</div>
              <div className="flex items-center gap-2">
                {/* Scale toggles */}
                {(['week','month','quarter','year'] as const).map(s => (
                  <button key={s} onClick={()=> setScale(s)} aria-pressed={scale===s}
                    className={`px-2 py-1 text-xs rounded ${scale===s? 'bg-[#007acc] text-white':'bg-[#3e3e42] text-[#cbd5e1] hover:bg-[#4e4e52]'}`}>{s[0].toUpperCase()+s.slice(1)}</button>
                ))}
                {/* Department filter (bound to global) */}
                <select value={deptState.selectedDepartmentId ?? ''} onChange={(e)=> setDepartment(e.target.value ? Number(e.target.value) : null)}
                  className="ml-3 px-2 py-1 text-xs bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cbd5e1] focus:border-[#007acc]">
                  <option value="">All Departments</option>
                  {depts.map(d => <option key={d.id} value={d.id as number}>{d.name}</option>)}
                </select>
              </div>
            </div>
            {loading ? (
              <div className="text-[#969696]">Loading forecast...</div>
            ) : error ? (
              <div className="text-red-400">{error}</div>
            ) : (
              <CapacityTimeline weeklyData={forecast} scale={scale} />
            )}
          </div>
        </Card>

        <Card className="bg-[#2d2d30] border-[#3e3e42]">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-[#cccccc] font-semibold">Project Timeline</div>
              <select value={selectedProject} onChange={(e)=> setSelectedProject(e.target.value? Number(e.target.value):'')}
                className="px-2 py-1 text-sm bg-[#3e3e42] border border-[#3e3e42] rounded text-[#cbd5e1] focus:border-[#007acc] focus:outline-none min-w-[220px]">
                <option value="">Select a project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id as number}>{p.name}</option>
                ))}
              </select>
            </div>
            {selectedProject === '' ? (
              <div className="text-[#969696]">Choose a project to view its weekly assignment timeline and deliverable markers.</div>
            ) : projLoading ? (
              <div className="text-[#969696]">Loading project data...</div>
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
  if (!weekStarts || weekStarts.length===0) return <div className="text-[#969696]">No data</div>;
  const max = Math.max(10, ...weeklyTotals) * 1.1;
  return (
    <div className="space-y-2">
      <div style={{ overflowX:'auto' }}>
        <div className="grid" style={{ gridTemplateColumns:`repeat(${weekStarts.length}, 56px)`, gap: '8px' }}>
          {weeklyTotals.map((v,i)=> {
            const h = Math.max(2, Math.round((v/max)*120));
            return (
              <div key={i} className="flex flex-col items-center">
                <div title={`${v}h`} className="w-full bg-[#3e3e42] rounded" style={{ height: 124 }}>
                  <div className="bg-[#3b82f6] rounded" style={{ height: h }} />
                </div>
                <div className="text-[10px] text-[#94a3b8] mt-1">{weekStarts[i].slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-[#cbd5e1] text-xs">Deliverables: {deliverables?.length || 0}</div>
    </div>
  );
}

export default TeamForecastPage;


