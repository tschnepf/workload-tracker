import React, { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import GlobalDepartmentFilter from '@/components/filters/GlobalDepartmentFilter';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { getProjectGridSnapshot, getProjectTotals } from '@/services/projectAssignmentsApi';
import { toWeekHeader, WeekHeader } from '@/pages/Assignments/grid/utils';
import { useCellSelection } from '@/pages/Assignments/grid/useCellSelection';
import { useGridUrlState } from '@/pages/Assignments/grid/useGridUrlState';
import type { Project, Assignment, Person } from '@/types/models';
import { showToast } from '@/lib/toastBus';
import { useAbortManager } from '@/utils/useAbortManager';
import { assignmentsApi, peopleApi } from '@/services/api';
import StatusBadge from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useDropdownManager } from '@/components/projects/useDropdownManager';
import { useProjectStatus } from '@/components/projects/useProjectStatus';
import { useProjectStatusSubscription } from '@/components/projects/useProjectStatusSubscription';
import { useCapabilities } from '@/hooks/useCapabilities';

// Project Assignments Grid (scaffold)
// Prescriptive: lean, best-practice; no client-side week calculations.
// Week header placeholder only; wired to server weekKeys in Step 4.

const ProjectAssignmentsGrid: React.FC = () => {
  const { state: deptState } = useDepartmentFilter();
  const [weeks, setWeeks] = useState<WeekHeader[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const selection = useCellSelection(weeks.map(w => w.date));
  const aborts = useAbortManager();
  const caps = useCapabilities();
  const url = useGridUrlState();
  const statusDropdown = useDropdownManager<string>();
  const { emitStatusChange } = useProjectStatusSubscription({ debug: false });
  const projectStatus = useProjectStatus({
    onSuccess: (pid, newStatus) => emitStatusChange({ projectId: pid, newStatus }),
    getCurrentStatus: (pid) => {
      const p = projects.find(x => x.id === pid);
      return (p?.status as any) || 'active';
    }
  });

  type ProjectWithAssignments = Project & { assignments: Assignment[]; isExpanded: boolean };
  const [projects, setProjects] = useState<ProjectWithAssignments[]>([]);
  const [hoursByProject, setHoursByProject] = useState<Record<number, Record<string, number>>>({});
  const [loadingTotals, setLoadingTotals] = useState<Set<number>>(new Set());
  const [deliverablesByProjectWeek, setDeliverablesByProjectWeek] = useState<Record<number, Record<string, number>>>({});
  const [hasFutureDeliverablesByProject, setHasFutureDeliverablesByProject] = useState<Set<number>>(new Set());
  const [loadingAssignments, setLoadingAssignments] = useState<Set<number>>(new Set());
  const [weeksHorizon, setWeeksHorizon] = useState<number>(8);
  const [editingCell, setEditingCell] = useState<{ rowKey: string; weekKey: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  // Add person combobox state
  const [isAddingForProject, setIsAddingForProject] = useState<number | null>(null);
  const [personQuery, setPersonQuery] = useState<string>('');
  const [personResults, setPersonResults] = useState<Array<{ id: number; name: string; department: number | null }>>([]);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState<number>(-1);
  // Status filter chips
  const statusFilterOptions = ['active', 'active_ca', 'on_hold', 'completed', 'cancelled', 'active_no_deliverables', 'Show All'] as const;
  type StatusFilter = typeof statusFilterOptions[number];
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<StatusFilter>>(() => {
    try {
      const raw = localStorage.getItem('projGrid:statusFilters');
      if (!raw) return new Set<StatusFilter>(['active','active_ca']);
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : ['active','active_ca'];
      const set = new Set<StatusFilter>();
      arr.forEach((s: any) => { if (statusFilterOptions.includes(s)) set.add(s); });
      return set.size > 0 ? set : new Set<StatusFilter>(['active','active_ca']);
    } catch { return new Set<StatusFilter>(['active','active_ca']); }
  });

  const toggleStatusFilter = (status: StatusFilter) => {
    setSelectedStatusFilters(prev => {
      const next = new Set<StatusFilter>(prev);
      if (status === 'Show All') {
        return new Set<StatusFilter>(['Show All']);
      }
      next.delete('Show All');
      if (next.has(status)) next.delete(status); else next.add(status);
      if (next.size === 0) return new Set<StatusFilter>(['Show All']);
      try { localStorage.setItem('projGrid:statusFilters', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  // Helper: refresh totals for project from server
  const refreshTotalsForProject = async (projectId: number) => {
    try {
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
      const res = await getProjectTotals([projectId], { weeks: weeks.length, department: dept, include_children: inc });
      setHoursByProject(prev => ({ ...prev, [projectId]: res.hoursByProject[String(projectId)] || {} }));
    } catch (e:any) {
      showToast('Failed to refresh totals: ' + (e?.message || 'Unknown error'), 'error');
    }
  };

  // Initialize from URL params once
  React.useEffect(() => {
    try {
      // view param
      url.set('view', 'project');
      const w = url.get('weeks');
      if (w) {
        const n = parseInt(w, 10); if (!Number.isNaN(n) && n >= 1 && n <= 26) setWeeksHorizon(n);
      }
      const s = url.get('status');
      if (s && s.length > 0) {
        const toks = s.split(',');
        const set = new Set<StatusFilter>();
        for (const t of toks) {
          const tok = t as StatusFilter;
          if ((['active','active_ca','on_hold','completed','cancelled','active_no_deliverables','Show All'] as const).includes(tok)) set.add(tok);
        }
        if (set.size > 0) setSelectedStatusFilters(set);
      } else {
        // Default filters in URL to reduce initial payload
        url.set('status', 'active,active_ca');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
        const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
        // Build server filters
        const statuses = Array.from(selectedStatusFilters);
        const hasShowAll = statuses.includes('Show All');
        const hasNoDelivs = statuses.includes('active_no_deliverables');
        const statusIn = hasShowAll ? undefined : statuses.filter(s => s !== 'active_no_deliverables' && s !== 'Show All').join(',') || undefined;
        const hasFutureParam = (!hasShowAll && hasNoDelivs && statuses.length === 1) ? 0 : undefined;
        const snap = await getProjectGridSnapshot({ weeks: weeksHorizon, department: dept, include_children: inc, status_in: statusIn, has_future_deliverables: hasFutureParam });
        if (!mounted) return;
        setWeeks(toWeekHeader(snap.weekKeys || []));
        // Normalize projects
        const proj: ProjectWithAssignments[] = (snap.projects || []).map(p => ({ id: p.id, name: p.name, client: p.client ?? undefined, status: p.status ?? undefined, assignments: [], isExpanded: false }));
        setProjects(proj);
        // Coerce hours map keys to numbers
        const hb: Record<number, Record<string, number>> = {};
        Object.entries(snap.hoursByProject || {}).forEach(([pid, wk]) => { hb[Number(pid)] = wk; });
        setHoursByProject(hb);
        // Deliverables maps
        const dbw: Record<number, Record<string, number>> = {};
        Object.entries(snap.deliverablesByProjectWeek || {}).forEach(([pid, wk]) => { dbw[Number(pid)] = wk; });
        setDeliverablesByProjectWeek(dbw);
        const future = new Set<number>();
        Object.entries(snap.hasFutureDeliverablesByProject || {}).forEach(([pid, val]) => { if (val) future.add(Number(pid)); });
        setHasFutureDeliverablesByProject(future);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load project grid snapshot');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [deptState.selectedDepartmentId, deptState.includeChildren, weeksHorizon, selectedStatusFilters]);

  // Sync URL when weeks or status filters change
  useEffect(() => { url.set('weeks', String(weeksHorizon)); }, [weeksHorizon]);
  useEffect(() => {
    const s = Array.from(selectedStatusFilters);
    const val = s.includes('Show All') && s.length === 1 ? null : s.join(',');
    url.set('status', val || null);
  }, [selectedStatusFilters]);
  return (
    <Layout>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Header */}
        <div className="sticky top-0 bg-[#1e1e1e] border-b border-[#3e3e42] z-30 px-6 py-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h1 className="text-2xl font-bold text-[#cccccc]">Project Assignments</h1>
              <p className="text-[#969696] text-sm">Server‑driven grid across upcoming weeks</p>
              {!loading && !error && (
                <div className="mt-1 text-[#9aa0a6] text-xs">
                  <span className="mr-4">Projects: {projects.length}</span>
                  <span className="mr-4">Total Hours: {Object.values(hoursByProject).reduce((s, m) => s + Object.values(m).reduce((a,b)=>a+(b||0),0), 0)}</span>
                </div>
              )}
              </div>
              <div className="flex items-center gap-3">
                <GlobalDepartmentFilter />
                {/* Status filters */}
                <div className="flex items-center gap-1 text-xs">
                  {statusFilterOptions.map(opt => (
                    <button
                      key={opt}
                      className={`px-2 py-0.5 rounded border ${selectedStatusFilters.has(opt) ? 'border-[#007acc] text-[#e0e0e0] bg-[#007acc]/20' : 'border-[#3e3e42] text-[#9aa0a6] hover:text-[#cfd8dc]'}`}
                      onClick={() => toggleStatusFilter(opt)}
                      title={opt === 'active_no_deliverables' ? 'Active – No Deliverables' : opt.replace('_',' ').toUpperCase()}
                    >
                      {opt === 'active_no_deliverables' ? 'Active – No Deliverables' : opt.replace('_',' ')}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-xs text-[#cccccc]">
                  <span>Weeks</span>
                  {[8,12,16,20].map(n => (
                    <button key={n} onClick={() => setWeeksHorizon(n)} className={`px-2 py-0.5 rounded border ${weeksHorizon===n?'border-[#007acc] text-[#e0e0e0] bg-[#007acc]/20':'border-[#3e3e42] text-[#9aa0a6] hover:text-[#cfd8dc]'}`}>
                      {n}
                    </button>
                  ))}
                  {/* Switch view */}
                  <a href="/assignments" className="ml-3 px-2 py-0.5 rounded border border-[#3e3e42] text-xs text-[#9aa0a6] hover:text-[#cfd8dc]">People View</a>
                </div>
              </div>
            </div>

          {/* Week Header from server weekKeys */}
          <div className="mt-3 overflow-x-auto">
            {loading && (
              <div className="flex gap-px">
                {Array.from({ length: 12 }).map((_, idx) => (
                  <div key={idx} className="w-16 h-6 bg-[#2d2d30] animate-pulse rounded" />
                ))}
              </div>
            )}
            {!loading && error && (
              <div className="text-red-400 text-sm">{error}</div>
            )}
            {!loading && !error && (
              <div className="flex gap-px select-none">
                {weeks.map((w) => (
                  <div
                    key={w.date}
                    className={`w-16 h-6 rounded text-[#cccccc] text-xs flex items-center justify-center border border-transparent ${selection.isCellSelected('__header__', w.date) ? 'bg-[#007acc]/30 border-[#007acc]' : 'bg-[#2d2d30]'}`}
                    onMouseDown={(e) => selection.onCellMouseDown('__header__', w.date, e as any)}
                    onMouseEnter={() => selection.onCellMouseEnter('__header__', w.date)}
                    role="columnheader"
                    aria-label={`Week starting ${w.display}`}
                  >
                    {w.display}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Projects grid (totals by week, server authoritative) */}
        <div className="px-6 py-4">
          {!loading && !error && projects.length === 0 && (
            <div className="text-[#969696]">No projects found in scope.</div>
          )}

          {!loading && !error && projects.length > 0 && (
            <div className="space-y-1">
              {projects.map((p) => (
                <div key={p.id}>
                  {/* Project summary row */}
                  <div className="grid items-stretch gap-px bg-[#2a2a2a] hover:bg-[#2d2d30] transition-colors" style={{ gridTemplateColumns: `220px 320px 160px repeat(${weeks.length}, 70px)` }}>
                    {/* Client */}
                    <div className="pl-4 pr-2 py-2 text-[#969696] text-xs truncate" title={p.client || ''}>{p.client || ''}</div>
                    {/* Project name */}
                    <div className="pr-2 py-2 text-[#cccccc] text-xs truncate flex items-center gap-2" title={p.name}>
                      <span className="font-medium">{p.name}</span>
                    </div>
                    {/* Actions */}
                    <div className="py-2 flex items-center justify-center gap-2">
                      {/* Status badge + dropdown */}
                      <div className="relative" data-dropdown>
                        <StatusBadge
                          status={(p.status as any) || 'active'}
                          variant={caps.data?.canEditProjects ? 'editable' : 'default'}
                          onClick={() => p.id && caps.data?.canEditProjects && statusDropdown.toggle(String(p.id))}
                          isUpdating={p.id ? projectStatus.isUpdating(p.id) : false}
                        />
                        {p.id && (
                          <StatusDropdown
                            currentStatus={(p.status as any) || 'active'}
                            isOpen={statusDropdown.isOpen(String(p.id))}
                            onSelect={async (newStatus) => {
                              if (!p.id) return;
                              try {
                                await projectStatus.updateStatus(p.id, newStatus);
                                setProjects(prev => prev.map(x => x.id === p.id ? { ...x, status: newStatus } : x));
                                statusDropdown.close();
                              } catch (e:any) {
                                showToast(e?.message || 'Failed to update status', 'error');
                              }
                            }}
                            onClose={statusDropdown.close}
                            projectId={p.id}
                            disabled={projectStatus.isUpdating(p.id)}
                            closeOnSelect={false}
                          />
                        )}
                      </div>
                      <button
                      className="text-[#9aa0a6] hover:text-[#cfd8dc] text-xs border border-[#3e3e42] rounded px-2 py-0.5"
                      onClick={async () => {
                        if (!p.id) return;
                        if (loadingTotals.has(p.id)) return;
                        setLoadingTotals(prev => new Set(prev).add(p.id!));
                        try {
                          await refreshTotalsForProject(p.id!);
                          showToast('Totals refreshed', 'success');
                        } catch (e: any) {
                          showToast('Failed to refresh totals: ' + (e?.message || 'Unknown error'), 'error');
                        } finally {
                          setLoadingTotals(prev => { const n = new Set(prev); n.delete(p.id!); return n; });
                        }
                      }}
                      title="Refresh totals"
                    >
                      {p.id && loadingTotals.has(p.id) ? 'Refreshing…' : 'Refresh totals'}
                    </button>
                    <button
                      className="text-[#9aa0a6] hover:text-[#cfd8dc] text-xs border border-[#3e3e42] rounded px-2 py-0.5"
                      onClick={() => {
                        setIsAddingForProject(prev => prev === p.id ? null : p.id!);
                        setPersonQuery('');
                        setPersonResults([]);
                        setSelectedPersonIndex(-1);
                      }}
                    >
                      {isAddingForProject === p.id ? 'Cancel' : 'Add person'}
                    </button>
                    <button
                      className="text-[#9aa0a6] hover:text-[#cfd8dc] text-xs border border-[#3e3e42] rounded px-2 py-0.5"
                      onClick={async () => {
                        setProjects(prev => prev.map(x => x.id === p.id ? { ...x, isExpanded: !x.isExpanded } : x));
                        const willExpand = !p.isExpanded;
                        // Sync expanded ids to URL
                        try {
                          const current = new Set<number>(projects.filter(x => x.isExpanded).map(x => x.id!));
                          if (p.id) {
                            if (willExpand) current.add(p.id); else current.delete(p.id);
                            url.set('expanded', Array.from(current).join(','));
                          }
                        } catch {}
                        if (willExpand && p.id && (p.assignments.length === 0) && !loadingAssignments.has(p.id)) {
                          setLoadingAssignments(prev => new Set(prev).add(p.id!));
                          try {
                            const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
                            const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
                              const resp = await assignmentsApi.list({ project: p.id, department: dept, include_children: inc } as any);
                              const rows = (resp as any).results || [];
                              setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: rows } : x));
                            } catch (e:any) {
                              showToast('Failed to load assignments', 'error');
                              setProjects(prev => prev.map(x => x.id === p.id ? { ...x, isExpanded: false } : x));
                            } finally {
                              setLoadingAssignments(prev => { const n = new Set(prev); n.delete(p.id!); return n; });
                            }
                          }
                        }}
                        aria-expanded={p.isExpanded}
                      >
                        {p.isExpanded ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                    {/* Week totals */}
                    {weeks.map((w) => {
                      const v = (hoursByProject[p.id!] || {})[w.date] || 0;
                      const dcount = (deliverablesByProjectWeek[p.id!] || {})[w.date] || 0;
                      return (
                        <div key={w.date} title={dcount>0?`${dcount} deliverable(s)` : undefined} className={`py-2 flex items-center justify-center text-[#cccccc] text-xs border-l border-[#3e3e42] ${dcount>0 ? 'bg-[#007acc]/10' : ''}`}>
                          {v > 0 ? v : ''}
                        </div>
                      );
                    })}
                  </div>

                  {/* Expanded assignment rows */}
                  {p.isExpanded && (
                    <div className="grid gap-px bg-[#252526]" style={{ gridTemplateColumns: `220px 320px 160px repeat(${weeks.length}, 70px)` }}>
                      {/* Add person row */}
                      {isAddingForProject === p.id && (
                        <>
                          <div className="pl-8 pr-2 py-1">
                            <input
                              type="text"
                              value={personQuery}
                              onChange={async (e) => {
                                const q = e.target.value;
                                setPersonQuery(q);
                                if (q.trim().length === 0) { setPersonResults([]); setSelectedPersonIndex(-1); return; }
                                try {
                                  const res = await peopleApi.autocomplete(q, 20);
                                  setPersonResults(res || []);
                                  setSelectedPersonIndex(res && res.length > 0 ? 0 : -1);
                                } catch {}
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedPersonIndex(i => Math.min(i+1, personResults.length-1)); }
                                else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedPersonIndex(i => Math.max(i-1, 0)); }
                                else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const sel = selectedPersonIndex >= 0 ? personResults[selectedPersonIndex] : null;
                                  if (sel && p.id) {
                                    try {
                                      const created = await assignmentsApi.create({ person: sel.id, project: p.id, weeklyHours: {} });
                                      setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: [...x.assignments, created] } : x));
                                      await refreshTotalsForProject(p.id);
                                      showToast('Person added to project', 'success');
                                      setIsAddingForProject(null); setPersonQuery(''); setPersonResults([]); setSelectedPersonIndex(-1);
                                    } catch (err:any) {
                                      showToast(err?.message || 'Failed to add person', 'error');
                                    }
                                  }
                                } else if (e.key === 'Escape') {
                                  setIsAddingForProject(null); setPersonQuery(''); setPersonResults([]); setSelectedPersonIndex(-1);
                                }
                              }}
                              placeholder="Search people by name…"
                              className="w-full h-7 bg-[#3e3e42] border border-[#5a5a5e] rounded px-2 text-[#e0e0e0] text-xs"
                            />
                            {/* Dropdown */}
                            {personResults.length > 0 && (
                              <div className="mt-1 max-h-48 overflow-auto bg-[#2a2a2a] border border-[#3e3e42] rounded shadow-lg">
                                {personResults.map((r, idx) => (
                                  <div
                                    key={r.id}
                                    className={`px-2 py-1 text-xs cursor-pointer ${idx===selectedPersonIndex ? 'bg-[#007acc]/30 text-[#e0e0e0]' : 'text-[#cccccc] hover:bg-[#2d2d30]'}`}
                                    onMouseDown={async () => {
                                      if (!p.id) return;
                                      try {
                                        const created = await assignmentsApi.create({ person: r.id, project: p.id, weeklyHours: {} });
                                        setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: [...x.assignments, created] } : x));
                                        await refreshTotalsForProject(p.id);
                                        showToast('Person added to project', 'success');
                                      } catch (err:any) {
                                        showToast(err?.message || 'Failed to add person', 'error');
                                      } finally {
                                        setIsAddingForProject(null); setPersonQuery(''); setPersonResults([]); setSelectedPersonIndex(-1);
                                      }
                                    }}
                                  >
                                    {r.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="py-1"></div>
                          {weeks.map(w => (<div key={w.date}></div>))}
                        </>
                      )}
                      {/* Loading skeleton for assignments */}
                      {loadingAssignments.has(p.id!) && (
                        <>
                          <div className="pl-8 pr-2 py-2 text-[#969696] text-xs italic col-span-3">Loading assignments…</div>
                          {weeks.map((w) => (
                            <div key={w.date} className="py-2 border-l border-[#3e3e42]">
                              <div className="mx-auto w-10 h-4 bg-[#2d2d30] animate-pulse rounded" />
                            </div>
                          ))}
                        </>
                      )}
                      {/* Render rows */}
                      {!loadingAssignments.has(p.id!) && p.assignments.map(asn => (
                        <React.Fragment key={asn.id}>
                          <div className="pl-8 pr-2 py-2 text-[#cccccc] text-xs truncate" title={asn.personName || String(asn.person)}>
                            {asn.personName || `Person #${asn.person}`}
                          </div>
                          <div className="pr-2 py-2 text-[#969696] text-xs truncate">
                            {/* free slot for role/notes if needed */}
                          </div>
                          <div className="py-2 flex items-center justify-center">
                            <button
                              className="w-5 h-5 flex items-center justify-center text-[#969696] hover:text-red-400 hover:bg-red-500/20 rounded"
                              title="Remove assignment"
                              onClick={async () => {
                                if (!asn.id || !p.id) return;
                                try {
                                  await assignmentsApi.delete(asn.id);
                                  setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: x.assignments.filter(a => a.id !== asn.id) } : x));
                                  // Refresh totals for this project
                                  const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
                                  const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
                                  const res = await getProjectTotals([p.id!], { weeks: weeks.length, department: dept, include_children: inc });
                                  setHoursByProject(prev => ({ ...prev, [p.id!]: res.hoursByProject[String(p.id!)] || {} }));
                                  showToast('Assignment removed', 'success');
                                } catch (e:any) {
                                  showToast('Failed to remove assignment', 'error');
                                }
                              }}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {weeks.map(w => {
                            const hours = Number((asn.weeklyHours || {})[w.date] || 0) || 0;
                            const key = `${asn.id}-${w.date}`;
                            const isEditing = editingCell && editingCell.rowKey === String(asn.id) && editingCell.weekKey === w.date;
                            const isSaving = savingCells.has(key);
                            return (
                              <div
                                key={key}
                                className={`py-2 flex items-center justify-center text-[#cccccc] text-xs border-l border-[#3e3e42] ${selection.isCellSelected(String(asn.id), w.date) ? 'bg-[#007acc]/20' : ''} ${isSaving ? 'opacity-60' : ''}`}
                                onMouseDown={(e) => selection.onCellMouseDown(String(asn.id), w.date, e as any)}
                                onMouseEnter={() => selection.onCellMouseEnter(String(asn.id), w.date)}
                                onClick={() => selection.onCellSelect(String(asn.id), w.date, false)}
                                onDoubleClick={() => { setEditingCell({ rowKey: String(asn.id), weekKey: w.date }); setEditingValue(hours ? String(hours) : ''); }}
                                aria-selected={selection.isCellSelected(String(asn.id), w.date)}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (isEditing) return;
                                  const idx = weeks.findIndex(xx => xx.date === w.date);
                                  if (e.key === 'ArrowLeft' && idx > 0) {
                                    selection.onCellSelect(String(asn.id), weeks[idx-1].date);
                                  } else if (e.key === 'ArrowRight' && idx < weeks.length - 1) {
                                    selection.onCellSelect(String(asn.id), weeks[idx+1].date);
                                  } else if (e.key === 'Enter') {
                                    setEditingCell({ rowKey: String(asn.id), weekKey: w.date }); setEditingValue(hours ? String(hours) : '');
                                  } else if (e.key === 'Escape') {
                                    selection.clearSelection();
                                  }
                                }}
                              >
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onKeyDown={async (e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const v = parseFloat(editingValue);
                                        if (Number.isNaN(v) || v < 0) { showToast('Enter a valid non-negative number', 'warning'); return; }
                                        const rowKey = String(asn.id);
                                        const weeksToApply = (selection.selectionStart && selection.selectionStart.rowKey === rowKey && selection.selectedCells.length > 0)
                                          ? selection.selectedCells.filter(c => c.rowKey === rowKey).map(c => c.weekKey)
                                          : [w.date];
                                        // Prepare optimistic updates
                                        const prev = { ...(asn.weeklyHours || {}) } as Record<string, number>;
                                        const next = { ...prev } as Record<string, number>;
                                        weeksToApply.forEach(k => { next[k] = v; });
                                        // Apply optimistic UI
                                        setProjects(prevState => prevState.map(x => x.id === p.id ? {
                                          ...x,
                                          assignments: x.assignments.map(a => a.id === asn.id ? { ...a, weeklyHours: next } : a)
                                        } : x));
                                        // Mark saving cells
                                        setSavingCells(prevSet => {
                                          const s = new Set(prevSet);
                                          weeksToApply.forEach(k => s.add(`${asn.id}-${k}`));
                                          return s;
                                        });
                                        try {
                                          if (weeksToApply.length > 1) {
                                            await assignmentsApi.bulkUpdateHours([{ assignmentId: asn.id!, weeklyHours: next }]);
                                          } else {
                                            await assignmentsApi.update(asn.id!, { weeklyHours: next });
                                          }
                                          // Refresh totals for this project
                                          const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
                                          const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
                                          const res = await getProjectTotals([p.id!], { weeks: weeks.length, department: dept, include_children: inc });
                                          setHoursByProject(prev => ({ ...prev, [p.id!]: res.hoursByProject[String(p.id!)] || {} }));
                                        } catch (err:any) {
                                          // Rollback on error
                                          setProjects(prevState => prevState.map(x => x.id === p.id ? {
                                            ...x,
                                            assignments: x.assignments.map(a => a.id === asn.id ? { ...a, weeklyHours: prev } : a)
                                          } : x));
                                          showToast(err?.message || 'Failed to update hours', 'error');
                                        } finally {
                                          setSavingCells(prevSet => {
                                            const s = new Set(prevSet);
                                            weeksToApply.forEach(k => s.delete(`${asn.id}-${k}`));
                                            return s;
                                          });
                                          setEditingCell(null);
                                        }
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setEditingCell(null);
                                      }
                                    }}
                                    className="w-12 h-6 bg-[#3e3e42] border border-[#5a5a5e] rounded px-1 text-[#e0e0e0] text-xs text-center"
                                  />
                                ) : (
                                  <div className="h-6 flex items-center justify-center text-[#cccccc] text-xs">
                                    {hours > 0 ? hours : ''}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      {/* Empty state */}
                      {!loadingAssignments.has(p.id!) && p.assignments.length === 0 && (
                        <>
                          <div className="pl-8 pr-2 py-2 text-[#969696] text-xs italic col-span-3">No assignments</div>
                          {weeks.map(w => (
                            <div key={w.date} className="py-2 border-l border-[#3e3e42]" />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Selection live region for a11y */}
          <div aria-live="polite" className="sr-only">{selection.selectionSummary}</div>
        </div>
      </div>
    </Layout>
  );
};

export default ProjectAssignmentsGrid;
