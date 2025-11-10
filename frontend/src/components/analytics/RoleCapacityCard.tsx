import React from 'react';
import Card from '@/components/ui/Card';
import MultiRoleCapacityChart, { type ChartMode, roleColorForId } from '@/components/charts/MultiRoleCapacityChart';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { rolesApi, departmentsApi } from '@/services/api';
import { getRoleCapacityTimeline } from '@/services/analyticsApi';
import type { Department } from '@/types/models';

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
  const initializedSelection = React.useRef(false);
  const [departments, setDepartments] = React.useState<Department[]>([]);
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

  // Load departments once (for name display)
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const page = await departmentsApi.list({ page: 1, page_size: 500 });
        if (mounted) setDepartments((page.results || []) as Department[]);
      } catch {
        if (mounted) setDepartments([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Initialize selection to all roles (or provided initial ids) once roles load
  React.useEffect(() => {
    if (initializedSelection.current) return;
    if (!roles.length) return;
    initializedSelection.current = true;
    const ids = (initialSelectedRoleIds && initialSelectedRoleIds.length > 0)
      ? initialSelectedRoleIds
      : roles.map(r => r.id);
    setSelectedRoleIds(new Set(ids));
  }, [roles, initialSelectedRoleIds]);

  const canQuery = true; // Allow querying across all departments when no selection
  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const roleIdsCsv = (selectedRoleIds && selectedRoleIds.size > 0) ? Array.from(selectedRoleIds).join(',') : undefined;
      const res = await getRoleCapacityTimeline({ department: effectiveDeptId != null ? Number(effectiveDeptId) : undefined, weeks, roleIdsCsv });
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

  const displayedSeries = React.useMemo(() => {
    if (!series?.length) return series;
    // Filter to selected roles for immediate visual feedback; backend still filters on refresh
    return series.filter((s) => selectedRoleIds.has(s.roleId));
  }, [series, selectedRoleIds]);

  // Grow chart height with number of roles so legend fits visually
  const dynamicHeight = React.useMemo(() => {
    const min = 300; // baseline chart height
    const perRole = 34; // approximate per-chip vertical space
    const header = 40; // spacing for axis labels/legend header
    return Math.max(min, header + roles.length * perRole);
  }, [roles.length]);

  return (
    <Card className={className ?? 'bg-[var(--card)] border-[var(--border)]'}>
      <div className="p-4 space-y-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="min-w-[120px]">
            <div className="text-[var(--muted)] text-xs">Department</div>
            <div className="text-[var(--text)] text-sm">
              {(() => {
                if (effectiveDeptId == null) return 'All Departments';
                const dep = departments.find(d => d.id === Number(effectiveDeptId));
                return dep?.name ?? `#${effectiveDeptId}`;
              })()}
            </div>
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
          {/* Roles selection moved to combined legend below chart */}
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
              className="px-2 py-0.5 rounded border text-xs bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] disabled:opacity-50">
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-2">{title}</h2>
          {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              {!error && (
                <MultiRoleCapacityChart
                  weekKeys={weekKeys}
                  series={displayedSeries as any}
                  mode={mode}
                  tension={tension}
                  hideLegend
                  height={dynamicHeight}
                />
              )}
            </div>
            {/* Combined legend + role selector (vertical, right side) */}
            <div className="w-64 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[var(--muted)] text-xs">Roles</div>
                <button
                  onClick={() => setSelectedRoleIds(new Set())}
                  disabled={selectedRoleIds.size === 0}
                  className="px-2 py-0.5 rounded border text-[10px] bg-[var(--card)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--cardHover)] disabled:opacity-50"
                >
                  Clear Selection
                </button>
              </div>
              <div className="flex flex-col gap-2 pr-1">
                {roles.map((r) => {
                  const selected = selectedRoleIds.has(r.id);
                  const color = roleColorForId(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoleIds((prev) => {
                        const n = new Set(prev);
                        if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
                        return n;
                      })}
                      className={`flex items-center justify-start gap-2 px-2 py-1 rounded border text-xs text-left transition-colors ${selected ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)]'}`}
                      aria-pressed={selected}
                    >
                      <span style={{ background: color, width: 18, height: 3, display: 'inline-block' }} />
                      <span className="truncate">{r.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default RoleCapacityCard;
