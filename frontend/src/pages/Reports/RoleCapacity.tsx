import React from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { rolesApi } from '@/services/api';
import { getRoleCapacityTimeline } from '@/services/analyticsApi';
import MultiRoleCapacityChart from '@/components/charts/MultiRoleCapacityChart';

const WEEK_OPTIONS = [4, 8, 12, 16, 20] as const;

const RoleCapacityReport: React.FC = () => {
  const { state: deptState } = useDepartmentFilter();
  const departmentId = deptState.selectedDepartmentId ? Number(deptState.selectedDepartmentId) : null;
  const [weeks, setWeeks] = React.useState<number>(12);
  const [roles, setRoles] = React.useState<Array<{ id: number; name: string }>>([]);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try { const list = await rolesApi.listAll(); if (mounted) setRoles(list || []); } catch { if (mounted) setRoles([]); }
    })();
    return () => { mounted = false; };
  }, []);
  const [selectedRoleIds, setSelectedRoleIds] = React.useState<Set<number>>(new Set());

  const [weekKeys, setWeekKeys] = React.useState<string[]>([]);
  const [series, setSeries] = React.useState<Array<{ roleId: number; roleName: string; assigned: number[]; capacity: number[] }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canQuery = departmentId != null;

  const refresh = React.useCallback(async () => {
    if (departmentId == null) return;
    setLoading(true);
    setError(null);
    try {
      const roleIdsCsv = Array.from(selectedRoleIds).join(',') || undefined;
      const res = await getRoleCapacityTimeline({ department: departmentId, weeks, roleIdsCsv });
      setWeekKeys(res.weekKeys || []);
      setSeries(res.series || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load role capacity timeline');
      setWeekKeys([]);
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }, [departmentId, weeks, selectedRoleIds]);

  React.useEffect(() => {
    if (canQuery) refresh();
  }, [canQuery, refresh]);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-end gap-4">
          <div>
            <div className="text-[var(--muted)] text-xs">Department</div>
            {/* Department is controlled globally via GlobalDepartmentFilter in header */}
            <div className="text-[var(--text)] text-sm">{departmentId ?? 'Select in header'}</div>
          </div>
          <div>
            <div className="text-[var(--muted)] text-xs">Timeframe (weeks)</div>
            <div className="flex gap-2">
              {WEEK_OPTIONS.map((w) => (
                <button key={w} onClick={() => setWeeks(w)}
                  className={`px-2 py-0.5 rounded border text-xs transition-colors ${weeks===w? 'bg-[var(--primary)] border-[var(--primary)] text-white':'bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'}`}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[var(--muted)] text-xs mb-1">Select Roles</div>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => {
                const selected = selectedRoleIds.has(r.id);
                return (
                  <button key={r.id} onClick={() => {
                    setSelectedRoleIds((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; });
                  }}
                    className={`px-2 py-0.5 rounded border text-xs ${selected ? 'bg-[var(--primary)] border-[var(--primary)] text-white':'bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)]'}`}>
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <button onClick={() => refresh()} disabled={!canQuery || loading}
              className="px-3 py-1 rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] disabled:opacity-50">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        <Card className="bg-[var(--card)] border-[var(--border)]">
          <div className="p-4">
            <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Capacity vs Assigned by Role</h2>
            {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
            {!error && (
              <MultiRoleCapacityChart weekKeys={weekKeys} series={series as any} />
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default RoleCapacityReport;
