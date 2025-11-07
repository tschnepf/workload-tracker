import React from 'react';
import Card from '@/components/ui/Card';
import MultiRoleCapacityChart, { type ChartMode } from '@/components/charts/MultiRoleCapacityChart';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { rolesApi } from '@/services/api';
import { getRoleCapacityTimeline } from '@/services/analyticsApi';

type HideControls = {
  timeframe?: boolean;
  roles?: boolean;
  display?: boolean;
};

export interface RoleCapacityCardProps {
  departmentId?: number | null;
  title?: string;
  defaultWeeks?: 4 | 8 | 12 | 16 | 20;
  defaultMode?: ChartMode;
  initialSelectedRoleIds?: number[];
  tension?: number; // 0..1 smoothing
  className?: string;
  hideControls?: HideControls;
}

const WEEK_OPTIONS: ReadonlyArray<4 | 8 | 12 | 16 | 20> = [4, 8, 12, 16, 20];

const RoleCapacityCard: React.FC<RoleCapacityCardProps> = ({
  departmentId,
  title = 'Capacity vs Assigned by Role',
  defaultWeeks = 12,
  defaultMode = 'hours',
  initialSelectedRoleIds,
  tension = 0.75,
  className,
  hideControls,
}) => {
  const { state: globalDept } = useDepartmentFilter();
  const effectiveDeptId = (departmentId ?? globalDept.selectedDepartmentId) ?? null;

  const [weeks, setWeeks] = React.useState<number>(defaultWeeks);
  const [mode, setMode] = React.useState<ChartMode>(defaultMode);
  const [roles, setRoles] = React.useState<Array<{ id: number; name: string }>>([]);
  const [selectedRoleIds, setSelectedRoleIds] = React.useState<Set<number>>(new Set(initialSelectedRoleIds || []));
  const [weekKeys, setWeekKeys] = React.useState<string[]>([]);
  const [series, setSeries] = React.useState<Array<{ roleId: number; roleName: string; assigned: number[]; capacity: number[] }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load roles once
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await rolesApi.listAll();
        if (mounted) setRoles(list || []);
      } catch {
        if (mounted) setRoles([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const canQuery = effectiveDeptId != null;
  const refresh = React.useCallback(async () => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const roleIdsCsv = (selectedRoleIds && selectedRoleIds.size > 0) ? Array.from(selectedRoleIds).join(',') : undefined;
      const res = await getRoleCapacityTimeline({ department: Number(effectiveDeptId), weeks, roleIdsCsv });
      setWeekKeys(res.weekKeys || []);
      setSeries(res.series || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load role capacity timeline');
      setWeekKeys([]);
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }, [canQuery, effectiveDeptId, weeks, selectedRoleIds]);

  React.useEffect(() => { if (canQuery) refresh(); }, [canQuery, refresh]);

  return (
    <Card className={className ?? 'bg-[var(--card)] border-[var(--border)]'}>
      <div className="p-4 space-y-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="min-w-[120px]">
            <div className="text-[var(--muted)] text-xs">Department</div>
            <div className="text-[var(--text)] text-sm">{effectiveDeptId ?? 'Select in header'}</div>
          </div>
          {!hideControls?.timeframe && (
            <div>
              <div className="text-[var(--muted)] text-xs">Timeframe (weeks)</div>
              <div className="flex gap-2">
                {WEEK_OPTIONS.map((w) => (
                  <button key={w} onClick={() => setWeeks(w)}
                    className={`px-2 py-0.5 rounded border text-xs ${weeks===w? 'bg-[var(--primary)] border-[var(--primary)] text-white':'bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'}`}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!hideControls?.roles && (
            <div className="flex-1 min-w-[240px]">
              <div className="text-[var(--muted)] text-xs mb-1">Select Roles</div>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => {
                  const selected = selectedRoleIds.has(r.id);
                  return (
                    <button key={r.id} onClick={() => setSelectedRoleIds((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                      className={`px-2 py-0.5 rounded border text-xs ${selected ? 'bg-[var(--primary)] border-[var(--primary)] text-white':'bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)]'}`}>
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!hideControls?.display && (
            <div>
              <div className="text-[var(--muted)] text-xs mb-1">Display</div>
              <div className="flex gap-2">
                {(['hours','percent'] as ChartMode[]).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`px-2 py-0.5 rounded border text-xs ${mode===m? 'bg-[var(--primary)] border-[var(--primary)] text-white':'bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)]'}`}>
                    {m === 'hours' ? 'Raw hours' : '% of capacity'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <button onClick={() => refresh()} disabled={!canQuery || loading}
              className="px-3 py-1 rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] disabled:opacity-50">
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-2">{title}</h2>
          {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
          {!error && (
            <MultiRoleCapacityChart weekKeys={weekKeys} series={series as any} mode={mode} tension={tension} />
          )}
        </div>
      </div>
    </Card>
  );
};

export default RoleCapacityCard;
