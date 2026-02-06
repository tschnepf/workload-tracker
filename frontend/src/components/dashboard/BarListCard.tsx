import React from 'react';
import Card from '@/components/ui/Card';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useAssignedHoursBreakdownData, type HorizonWeeks } from '@/hooks/useAssignedHoursBreakdownData';

export interface BarListRow {
  key: string;
  label: string;
  percent: number;
  color: string;
  valueLabel?: string;
}

interface BarListCardProps {
  title?: string;
  subtitle?: string;
  initialWeeks?: HorizonWeeks;
  className?: string;
  extraRows?: BarListRow[];
  showSecondaryCategories?: boolean;
}

const WEEK_OPTIONS: HorizonWeeks[] = [4, 8, 12, 16];

const BarListCard: React.FC<BarListCardProps> = ({
  title = 'Assigned Hours',
  subtitle = 'Includes current week',
  initialWeeks = 4,
  className,
  extraRows = [],
  showSecondaryCategories = false,
}) => {
  const [weeks, setWeeks] = React.useState<HorizonWeeks>(initialWeeks);
  const { state: deptState } = useDepartmentFilter();
  const { state: verticalState } = useVerticalFilter();
  const { loading, error, slices, total } = useAssignedHoursBreakdownData({
    weeks,
    departmentId: deptState.selectedDepartmentId ?? null,
    includeChildren: deptState.includeChildren,
    vertical: verticalState.selectedVerticalId ?? null,
  });

  const primarySlice = React.useMemo(() => {
    return slices.find((slice) => slice.key === 'active') ?? slices[0];
  }, [slices]);

  const pct = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  const primaryPercent = primarySlice ? pct(primarySlice.value) : 0;

  const primaryRow: BarListRow | null = primarySlice
    ? {
        key: primarySlice.key,
        label: primarySlice.label,
        percent: primaryPercent,
        color: primarySlice.color,
        valueLabel: total > 0 ? `${Math.round(primarySlice.value)}h` : undefined,
      }
    : null;

  const secondarySlices = slices.filter((slice) => slice.key !== primarySlice?.key);

  return (
    <Card className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.25)] ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
          <div className="text-xs text-[var(--muted)]">{subtitle}</div>
        </div>
        <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)]/60 p-1">
          {WEEK_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeeks(w)}
              className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                weeks === w
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              aria-pressed={weeks === w}
            >
              {w}w
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 text-[var(--muted)] text-sm">Calculating hours…</div>
      ) : error ? (
        <div className="mt-4 text-red-400 text-sm">Error: {error}</div>
      ) : total <= 0 ? (
        <div className="mt-4 text-[var(--muted)] text-sm">No upcoming assigned hours</div>
      ) : (
        <div className="mt-4 space-y-4">
          {primaryRow ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text)] font-medium">{primaryRow.label}</span>
                <span className="text-[var(--text)]">{primaryRow.percent}%</span>
              </div>
              <div className="h-3 w-full rounded-full bg-[var(--surface)]/80">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${primaryRow.percent}%`, backgroundColor: primaryRow.color }}
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {[primaryRow, ...extraRows]
              .filter(Boolean)
              .map((row) => {
                const r = row as BarListRow;
                return (
                  <div key={`row-${r.key}`} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                      <span className="text-[var(--text)]">{r.label}</span>
                      <span>{r.percent}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--surface)]/70">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${r.percent}%`, backgroundColor: r.color }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>

          {showSecondaryCategories && secondarySlices.length > 0 ? (
            <div className="text-xs text-[var(--muted)]">
              {secondarySlices.map((slice, index) => (
                <span key={`secondary-${slice.key}`}>
                  {slice.label}: {pct(slice.value)}%{index < secondarySlices.length - 1 ? ' / ' : ''}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
};

export default BarListCard;
