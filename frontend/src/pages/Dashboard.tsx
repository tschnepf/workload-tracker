/**
 * Dashboard page - Team utilization overview
 * Chunk 4: Real dashboard with team metrics and VSCode dark theme
 */

import React, { useState, useEffect } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import UpcomingPreDeliverablesWidget from '../components/dashboard/UpcomingPreDeliverablesWidget';
import UtilizationBadge from '../components/ui/UtilizationBadge';
import { utilizationLevelToClasses, getUtilizationPill, defaultUtilizationScheme, utilizationLevelToTokens } from '@/util/utilization';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import SkillsFilter from '../components/skills/SkillsFilter';
import { dashboardApi, departmentsApi, personSkillsApi, projectsApi } from '../services/api';
import { useAuth } from '@/hooks/useAuth';
import { formatUtcToLocal } from '@/utils/dates';
import QuickActionsInline from '../components/quick-actions/QuickActionsInline';
import { DashboardData, Department, PersonSkill } from '../types/models';
import { useCapacityHeatmap } from '../hooks/useCapacityHeatmap';
import { useDepartmentFilter } from '../hooks/useDepartmentFilter';
import AssignedHoursBreakdownCard from '@/components/analytics/AssignedHoursBreakdownCard';
import AssignedHoursByClientCard from '@/components/analytics/AssignedHoursByClientCard';
import AssignedHoursTimelineCard from '@/components/analytics/AssignedHoursTimelineCard';
import RoleCapacityCard from '@/components/analytics/RoleCapacityCard';

const Dashboard: React.FC = () => {
  const auth = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weeksPeriod, setWeeksPeriod] = useState<number>(1);
  
  // Department filtering state (global)
  const [departments, setDepartments] = useState<Department[]>([]);
  const { state: deptState, setDepartment } = useDepartmentFilter();
  
  // Skills filtering state
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [peopleSkills, setPeopleSkills] = useState<PersonSkill[]>([]);
  const [heatWeeks, setHeatWeeks] = useState<number>(20);
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});
  const [projectsTotal, setProjectsTotal] = useState<number>(0);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // Display helper to format project status labels nicely
  const formatStatusLabel = (raw: string | undefined | null): string => {
    const s = (raw || 'Unknown').toString();
    const words = s.replace(/_/g, ' ').split(' ').filter(Boolean);
    return words
      .map((w) => {
        const lower = w.toLowerCase();
        if (lower === 'ca') return 'CA';
        if (lower.length <= 2) return lower.toUpperCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  };

  // Load dashboard when weeks or global department changes
  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    loadDashboard();
  }, [auth.accessToken, weeksPeriod, deptState.selectedDepartmentId]);

  // Load static data once
  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    loadDepartments();
    loadPeopleSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.accessToken]);

  // Load project summary once authenticated
  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.accessToken]);

  const heatQuery = useCapacityHeatmap({ departmentId: deptState.selectedDepartmentId, includeChildren: deptState.includeChildren }, heatWeeks, !loading && !!auth.accessToken);
  const heatData = heatQuery.data ?? [];
  const heatLoading = heatQuery.isLoading;
  const heatFetching = heatQuery.isFetching;
  const weekKeys = (heatData && heatData.length > 0) ? (heatData[0].weekKeys || []) : [];
  const currentWeekKey = weekKeys[0];
  const nextWeekKey = weekKeys[1];
  const { data: utilScheme } = useUtilizationScheme();
  
  const loadDepartments = async () => {
    try {
      const response = await departmentsApi.list();
      setDepartments(response.results || []);
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  const loadPeopleSkills = async () => {
    try {
      const response = await personSkillsApi.list();
      setPeopleSkills(response.results || []);
    } catch (err) {
      console.error('Error loading people skills:', err);
    }
  };

  const loadProjects = async () => {
    try {
      setProjectsError(null);
      const list = await projectsApi.listAll();
      setProjectsTotal(list.length);
      const counts: Record<string, number> = {};
      for (const p of list) {
        const key = (p.status || 'Unknown');
        counts[key] = (counts[key] || 0) + 1;
      }
      setProjectCounts(counts);
    } catch (err: any) {
      setProjectsError(err.message || 'Failed to load projects');
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await dashboardApi.getDashboard(
        weeksPeriod,
        deptState.selectedDepartmentId != null ? String(deptState.selectedDepartmentId) : undefined
      );
      setData(response);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleWeeksPeriodChange = (newWeeks: number) => {
    if (newWeeks >= 1 && newWeeks <= 12) {
      setWeeksPeriod(newWeeks);
    }
  };

  // Filter people based on selected skills
  const filterPeopleBySkills = (people: any[]) => {
    if (selectedSkills.length === 0) return people;

    return people.filter(person => {
      const personSkills = peopleSkills
        .filter(skill => skill.person === person.id && skill.skillType === 'strength')
        .map(skill => skill.skillTagName?.toLowerCase() || '');

      return selectedSkills.some(selectedSkill =>
        personSkills.some(personSkill =>
          personSkill.includes(selectedSkill.toLowerCase()) ||
          selectedSkill.toLowerCase().includes(personSkill)
        )
      );
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-[var(--muted)]">Loading dashboard...</div>
          {/* Heatmap suppressed during loading */}
          {false && (
          <Card className="lg:col-span-2 bg-[var(--card)] border-[var(--border)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-[var(--text)]">Team Utilization Heat Map</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--muted)]">Weeks:</span>
                {[4, 8, 12, 20].map((w) => (
                  <button
                    key={w}
                    onClick={() => setHeatWeeks(w)}
                    className={`px-2 py-0.5 rounded ${heatWeeks === w ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'}`}
                    aria-pressed={heatWeeks === w}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* Show grid when we have any data; keep visible while refreshing */}
            {heatData && heatData.length > 0 ? (
              <div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '4px 6px', width: '30%' }}>Person</th>
                        {heatData[0].weekKeys.map((wk) => (
                          <th key={wk} style={{ textAlign: 'center', padding: '2px 4px', whiteSpace: 'nowrap' }}>{wk.slice(5)}</th>
                        ))}
                      </tr>
                    </thead>
                  </table>
                </div>
                <div style={{ maxHeight: '16rem', overflowY: 'auto', overflowX: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {heatData.map((row) => (
                        <tr key={row.id}>
                          <td style={{ padding: '4px 6px' }}>{row.name}</td>
                          {row.weekKeys.map((wk) => {
                            // Prefer server-provided percent/available maps when present
                            const pct = (row as any).percentByWeek && (row as any).percentByWeek[wk] != null
                              ? Number((row as any).percentByWeek[wk])
                              : (row.weeklyCapacity ? ((row.weekTotals[wk] || 0) / row.weeklyCapacity) * 100 : 0);
                            let bg = '#10b981';
                            if (pct > 100) bg = '#ef4444';
                            else if (pct > 85) bg = '#f59e0b';
                            else if (pct > 70) bg = '#3b82f6';
                            return (
                              <td key={wk} title={`${wk} - ${(row as any).availableByWeek && (row as any).availableByWeek[wk] != null ? `${(row as any).availableByWeek[wk]}h available` : `${Math.round(row.weekTotals[wk] || 0)}h allocated`}`} style={{ padding: 2 }}>
                                <div style={{ width: 16, height: 16, background: bg, opacity: 0.7, borderRadius: 3, border: '1px solid #64748b', margin: '0 auto' }} />
        <UpcomingPreDeliverablesWidget />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-[var(--muted)]">
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#10b981' }}></span> 0–70%</div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#3b82f6' }}></span> 70–85%</div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#f59e0b' }}></span> 85–100%</div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#ef4444' }}></span> 100%+</div>
                  {heatFetching && <span className="ml-2 text-[#7a7a7a]">Refreshing…</span>}
                </div>
              </div>
            ) : (
              <div className="text-[var(--muted)]">{heatLoading ? 'Loading…' : 'No data'}</div>
            )}
          </Card>
          )}

        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="space-y-4">
          <div className="text-red-400">Error: {error}</div>
          <button
            onClick={loadDashboard}
            className="bg-[var(--primary)] hover:bg-[#1e90ff] text-white px-4 py-2 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="text-[var(--muted)]">No dashboard data available</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Quick Actions moved inline into header */}

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">
              Team Dashboard
            </h1>
            <p className="text-[var(--muted)] mt-2">
              Overview of team utilization and workload allocation
              {weeksPeriod === 1 ? ' (current week)' : ` (${weeksPeriod} week average)`}
        {deptState.selectedDepartmentId != null && (
                <span className="block mt-1">
          Filtered by: {departments.find(d => d.id === deptState.selectedDepartmentId)?.name || 'Unknown Department'}
                </span>
              )}
            </p>
          </div>
          
          {/* Department and Time Period Selectors + Quick Actions */}
          <div className="flex items-center gap-6">
            {/* Department Filter */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-[var(--muted)]">Department:</label>
              <select
                value={deptState.selectedDepartmentId != null ? String(deptState.selectedDepartmentId) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setDepartment(val ? Number(val) : null);
                }}
                className="px-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[#007acc] focus:outline-none min-w-[140px]"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Time Period Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-[var(--muted)]">Time Period:</label>
              <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="12"
                value={weeksPeriod}
                onChange={(e) => handleWeeksPeriodChange(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[#007acc] focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
              <span className="text-sm text-[var(--muted)]">
                {weeksPeriod === 1 ? 'week' : 'weeks'}
              </span>
            </div>
            
              {/* Quick Select Buttons */}
              <div className="flex gap-1 ml-2">
                {[1, 2, 4, 8, 12].map((weeks) => (
                  <button
                    key={weeks}
                    onClick={() => handleWeeksPeriodChange(weeks)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      weeksPeriod === weeks
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                    }`}
                  >
                    {weeks}w
                  </button>
                ))}
              </div>
              {/* Inline Quick Actions */}
              <QuickActionsInline />
            </div>
          </div>
        </div>

        {/* Skills Filter */}
        {selectedSkills.length > 0 || (data && data.team_overview && data.team_overview.length > 0) ? (
          <div className="flex items-center gap-4">
            <label className="text-sm text-[var(--muted)] flex-shrink-0">Filter by Skills:</label>
            <SkillsFilter
              selectedSkills={selectedSkills}
              onSkillsChange={setSelectedSkills}
              placeholder="Add skills filter..."
              className="flex-grow max-w-md"
            />
            {selectedSkills.length > 0 && (
              <div className="text-xs text-blue-400 flex-shrink-0">
                Showing {filterPeopleBySkills(data?.team_overview || []).length} of {data?.team_overview?.length || 0} people
              </div>
            )}
          </div>
        ) : null}

        {/* Summary Stats + Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
          {/* Consolidated summary card (narrow, vertical list) */}
          <Card className="bg-[var(--card)] border-[var(--border)] lg:col-span-2 w-full">
            <div className="flex flex-col gap-6">
              <div>
                <div className="text-[var(--muted)] text-sm">Total Team Members</div>
                <div className="text-2xl font-bold text-[var(--text)]">{data.summary.total_people}</div>
              </div>
              <div>
                <div className="text-[var(--muted)] text-sm">Average Utilization</div>
                <div className="text-2xl font-bold text-blue-400">{data.summary.avg_utilization}%</div>
              </div>
              <div>
                <div className="text-[var(--muted)] text-sm">Peak Utilization</div>
                <div className="text-2xl font-bold text-amber-400">{data.summary.peak_utilization}%</div>
                {data.summary.peak_person && (
                  <div className="text-xs text-[var(--muted)] mt-1">{data.summary.peak_person}</div>
                )}
              </div>
              <div>
                <div className="text-[var(--muted)] text-sm">Active Assignments</div>
                <div className="text-2xl font-bold text-[var(--text)]">{data.summary.total_assignments}</div>
              </div>
              <div>
                <div className="text-[var(--muted)] text-sm">Overallocated</div>
                <div className="text-2xl font-bold text-red-400">{data.summary.overallocated_count}</div>
              </div>
            </div>
          </Card>

          {/* Future Assigned Hours by Status (compact) */}
          <div className="lg:col-span-2">
            <AssignedHoursBreakdownCard className="w-full max-w-none" size={96} />
          </div>

          {/* Future Assigned Hours by Client (double width vs. compact) */}
          <div className="lg:col-span-2">
            <AssignedHoursByClientCard size={96} className="w-full" />
          </div>

          {/* Role Capacity vs Assigned by Role (placed to the right of client card) */}
          <div className="lg:col-span-4">
            {/* Show display mode toggle on dashboard; keep timeframe compact */}
            <RoleCapacityCard hideControls={{ timeframe: true }} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Team Utilization Heat Map (compact) - moved up to left column */}
          <Card className="lg:col-span-2 lg:row-span-2 bg-[var(--card)] border-[var(--border)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-[var(--text)]">Team Utilization Heat Map</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--muted)]">Weeks:</span>
                {[4, 8, 12, 20].map((w) => (
                  <button
                    key={w}
                    onClick={() => setHeatWeeks(w)}
                    className={`px-2 py-0.5 rounded ${heatWeeks === w ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'}`}
                    aria-pressed={heatWeeks === w}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            {heatData && heatData.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: 'auto', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '140px' }} />
                    {heatData[0].weekKeys.map((wk) => (
                      <col key={`col-top-${wk}`} style={{ width: 26 }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th
                        style={{ textAlign: 'left', padding: '4px 6px', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1, fontSize: '12px' }}
                      >
                        Person
                      </th>
                      {heatData[0].weekKeys.map((wk) => (
                        <th key={`head-top-${wk}`} style={{ textAlign: 'center', padding: '2px', whiteSpace: 'nowrap', fontWeight: 600, position: 'sticky', top: 0, background: 'var(--card)', fontSize: '12px' }}>
                          {wk.slice(5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatData.map((row) => (
                      <tr key={`row-top-${row.id}`}>
                        <td style={{ padding: '4px 6px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</td>
                        {row.weekKeys.map((wk) => {
                          const h = row.weekTotals[wk] || 0;
                          const pill = getUtilizationPill({ hours: h, capacity: row.weeklyCapacity || 0, scheme: utilScheme || defaultUtilizationScheme, output: 'token' });
                          const bg = pill.tokens?.bg || '#10b981';
                          return (
                            <td key={`cell-top-${row.id}-${wk}`} title={`${wk} - ${Math.round(h)}h`} style={{ padding: 3, textAlign: 'center' }}>
                              <div style={{ width: 20, height: 20, background: bg, opacity: 0.9, borderRadius: 3, border: '1px solid var(--border)', margin: '0 auto' }} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--muted)]">
                  {(() => {
                    const s = utilScheme || defaultUtilizationScheme;
                    const labels = s.mode === 'absolute_hours'
                      ? [
                          `${s.blue_min}-${s.blue_max}h`,
                          `${s.green_min}-${s.green_max}h`,
                          `${s.orange_min}-${s.orange_max}h`,
                          `${s.red_min}h+`,
                        ]
                      : ['0-70%', '70-85%', '85-100%', '100%+'];
                    const blue = utilizationLevelToTokens('blue').bg;
                    const green = utilizationLevelToTokens('green').bg;
                    const orange = utilizationLevelToTokens('orange').bg;
                    const red = utilizationLevelToTokens('red').bg;
                    return (
                      <>
                        <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: blue }}></span> {labels[0]}</div>
                        <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: green }}></span> {labels[1]}</div>
                        <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: orange }}></span> {labels[2]}</div>
                        <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: red }}></span> {labels[3]}</div>
                        {heatFetching && <span className="ml-2 text-[#7a7a7a]">Refreshing.</span>}
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="text-[var(--muted)]">{heatLoading ? 'Loading.' : 'No data'}</div>
            )}
          </Card>

          {/* Team Members (by department) - right of heatmap */}
          <Card className="bg-[var(--card)] border-[var(--border)]">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-3">Team Members</h3>
            {heatData && heatData.length > 0 ? (
              <div className="text-sm">
                {(() => {
                  const counts = new Map<string, number>();
                  for (const row of heatData) {
                    const dept = (row.department || 'Unassigned');
                    counts.set(dept, (counts.get(dept) || 0) + 1);
                  }
                  const items = Array.from(counts.entries()).sort((a,b) => b[1]-a[1]);
                  return (
                    <div className="space-y-1">
                      {items.map(([dept, count]) => (
                        <div key={dept} className="flex justify-between">
                          <span className="text-[var(--text)]">{dept}</span>
                          <span className="text-[var(--muted)]">{count}</span>
                        </div>
                      ))}
                      <div className="mt-3 border-t border-[var(--border)] pt-2 flex justify-between font-medium">
                        <span className="text-[var(--text)]">Total</span>
                        <span className="text-[var(--text)]">{heatData.length}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-[var(--muted)] text-sm">{heatLoading ? 'Loading.' : 'No data'}</div>
            )}
          </Card>

          {/* Availability (stacked under Team Members) */}
          <Card className="bg-[var(--card)] border-[var(--border)]">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-3">Availability</h3>
            {heatData && heatData.length > 0 && currentWeekKey ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="text-[var(--muted)]">
                      <th className="text-left py-1 pr-2">Name</th>
                      <th className="text-right py-1 px-2">Current Week</th>
                      <th className="text-right py-1 pl-2">Next Week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows = heatData.map((row:any) => {
                        const wkCap = Number(row.weeklyCapacity || 0);
                        const curH = Number(row.weekTotals?.[currentWeekKey] || 0);
                        const nextH = nextWeekKey ? Number(row.weekTotals?.[nextWeekKey] || 0) : 0;
                        const curAvail = Math.max(0, (typeof row.availableByWeek?.[currentWeekKey] === 'number') ? row.availableByWeek[currentWeekKey] : wkCap - curH);
                        const nextAvail = nextWeekKey ? Math.max(0, (typeof row.availableByWeek?.[nextWeekKey] === 'number') ? row.availableByWeek[nextWeekKey] : wkCap - nextH) : 0;
                        return { id: row.id, name: row.name, curAvail, nextAvail };
                      })
                      .filter(r => r.curAvail > 0 || r.nextAvail > 0)
                      .sort((a,b) => b.curAvail - a.curAvail || b.nextAvail - a.nextAvail);
                      const filtered = selectedSkills.length ? rows.filter(r => {
                        return peopleSkills.some(ps => ps.person === r.id && ps.skillType === 'strength' && selectedSkills.some(s => (ps.skillTagName||'').toLowerCase().includes(s.toLowerCase())));
                      }) : rows;
                      return filtered.slice(0, 30).map(r => (
                        <tr key={r.id} className="border-t border-[var(--border)]">
                          <td className="py-1 pr-2 text-[var(--text)]">{r.name}</td>
                          <td className="py-1 px-2 text-right text-emerald-400">{r.curAvail.toFixed(0)}h</td>
                          <td className="py-1 pl-2 text-right text-emerald-400">{r.nextAvail.toFixed(0)}h</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-[var(--muted)] text-sm">{heatLoading ? 'Loading.' : 'No data'}</div>
            )}
          </Card>

          

          {/* Team Overview (below heatmap) */}
          <Card className="lg:col-span-2 bg-[var(--card)] border-[var(--border)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Team Overview</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--muted)]">Heat:</span>
                {[4, 8, 12, 20].map((w) => (
                  <button
                    key={w}
                    onClick={() => setHeatWeeks(w)}
                    className={`px-2 py-0.5 rounded ${heatWeeks === w ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'}`}
                    aria-pressed={heatWeeks === w}
                  >
                    {w}w
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              {filterPeopleBySkills(data.team_overview).map(person => (
                <div key={person.id} className="flex items-center justify-between p-3 bg-[var(--surface)]/50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-[var(--text)]">{person.name}</div>
                    <div className="text-sm text-[var(--muted)]">{person.role} - {person.allocated_hours}h / {person.capacity}h</div>
                    {weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (
                      <div className="text-xs text-amber-400 mt-1">
                        Peak: {person.peak_utilization_percent}%
                        {person.is_peak_overallocated && ' over'}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <UtilizationBadge percentage={person.utilization_percent} />
                    {weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (() => {
                      const pct = person.peak_utilization_percent || 0;
                      const level = pct <= 70 ? 'blue' : pct <= 85 ? 'green' : pct <= 100 ? 'orange' : 'red';
                      const classes = utilizationLevelToClasses(level as any);
                      return (
                        <div className={`text-xs px-2 py-1 rounded border ${classes}`}>
                          Peak: {pct}%
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Project Summary (beside Team Overview) */}
          <Card className="bg-[var(--card)] border-[var(--border)]">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-3">Project Summary</h3>
            {projectsError ? (
              <div className="text-red-400 text-sm">{projectsError}</div>
            ) : (
              <div className="text-sm">
                {(() => {
                  const items = Object.entries(projectCounts).sort((a,b) => b[1]-a[1]);
                  if (!items.length) return <div className="text-[var(--muted)]">No data</div>;
                  return (
                    <div className="space-y-1">
                      {items.map(([status, count]) => (
                        <div key={status} className="flex justify-between">
                          <span className="text-[var(--text)]">{formatStatusLabel(status)}</span>
                          <span className="text-[var(--muted)]">{count}</span>
                        </div>
                      ))}
                      <div className="mt-3 border-t border-[var(--border)] pt-2 flex justify-between font-medium">
                        <span className="text-[var(--text)]">Total</span>
                        <span className="text-[var(--text)]">{projectsTotal}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </Card>
        </div>

        {/* Team Utilization Heat Map (compact) [legacy block moved up] */}
        {false && (
        <Card className="lg:col-span-2 bg-[var(--card)] border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[var(--text)]">Team Utilization Heat Map</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--muted)]">Weeks:</span>
              {[4, 8, 12, 20].map((w) => (
                <button
                  key={w}
                  onClick={() => setHeatWeeks(w)}
                  className={`px-2 py-0.5 rounded ${heatWeeks === w ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'}`}
                  aria-pressed={heatWeeks === w}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {heatData && heatData.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: 'auto', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '140px' }} />
                  {heatData[0].weekKeys.map((wk) => (
                    <col key={`col-${wk}`} style={{ width: 26 }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '4px 6px',
                        position: 'sticky',
                        top: 0,
                        background: 'var(--card)',
                        zIndex: 1,
                        fontSize: '12px'
                      }}
                    >
                      Person
                    </th>
                    {heatData[0].weekKeys.map((wk) => (
                      <th
                        key={`head-${wk}`}
                        style={{
                          textAlign: 'center',
                          padding: '2px',
                          whiteSpace: 'nowrap',
                          fontWeight: 600,
                          position: 'sticky',
                          top: 0,
                          background: 'var(--card)',
                          fontSize: '12px'
                        }}
                      >
                        {wk.slice(5)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatData.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: '4px 6px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</td>
                      {row.weekKeys.map((wk) => {
                        const h = row.weekTotals[wk] || 0;
                        const pct = row.weeklyCapacity ? (h / row.weeklyCapacity) * 100 : 0;
                        let bg = '#10b981';
                        if (pct > 100) bg = '#ef4444';
                        else if (pct > 85) bg = '#f59e0b';
                        else if (pct > 70) bg = '#3b82f6';
                        return (
                          <td key={`cell-${row.id}-${wk}`} title={`${wk} - ${Math.round(h)}h`} style={{ padding: 3, textAlign: 'center' }}>
                            <div style={{ width: 20, height: 20, background: bg, opacity: 0.9, borderRadius: 3, border: '1px solid var(--border)', margin: '0 auto' }} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--muted)]">
                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#10b981' }}></span> 0-70%</div>
                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#3b82f6' }}></span> 70-85%</div>
                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#f59e0b' }}></span> 85-100%</div>
                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#ef4444' }}></span> 100%+</div>
                <span
                  className="ml-2 inline-flex items-center gap-1 text-[#7a7a7a]"
                  title="When available, heatmap tooltips show available hours instead of allocated hours."
                >
                  <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-[var(--surface)] text-[var(--muted)] text-[10px]">i</span>
                  Tooltips show available hours when provided
                </span>
                {heatFetching && <span className="ml-2 text-[#7a7a7a]">Refreshing…</span>}
              </div>
            </div>
          ) : (
            <div className="text-[var(--muted)]">{heatLoading ? 'Loading…' : 'No data'}</div>
          )}
        </Card>
        )}

        {/* Assigned Hours Timeline */}
        <AssignedHoursTimelineCard />

        {/* Utilization Distribution */}
        <Card className="bg-[var(--card)] border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--text)] mb-4">Utilization Distribution</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{data.utilization_distribution.underutilized}</div>
              <div className="text-sm text-[var(--muted)]">Underutilized (&lt;70%)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{data.utilization_distribution.optimal}</div>
              <div className="text-sm text-[var(--muted)]">Optimal (70-85%)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{data.utilization_distribution.high}</div>
              <div className="text-sm text-[var(--muted)]">High (85-100%)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{data.utilization_distribution.overallocated}</div>
              <div className="text-sm text-[var(--muted)]">Overallocated (&gt;100%)</div>
            </div>
          </div>
        </Card>

        {/* Recent Assignments */}
        {data.recent_assignments.length > 0 && (
          <Card className="bg-[var(--card)] border-[var(--border)]">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-4">Recent Assignments</h3>
            <div className="space-y-2">
              {data.recent_assignments.map((assignment, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-[var(--surface)]/30 rounded">
                  <div>
                    <span className="text-[var(--text)] font-medium">{assignment.person}</span>
                    <span className="text-[var(--muted)]"> assigned to </span>
                    <span className="text-[var(--text)]">{assignment.project}</span>
                  </div>
                  <div className="text-[var(--muted)] text-sm">
                    {formatUtcToLocal(assignment.created)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
