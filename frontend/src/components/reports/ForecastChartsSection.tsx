import React from 'react';
import Card from '@/components/ui/Card';
import { trackPerformanceEvent } from '@/utils/monitoring';
import type {
  ForecastPlannerChartData,
  ForecastPlannerResult,
  ForecastPlannerRoleSeries,
  ForecastPlannerTimeGrain,
  ProjectStatusDefinition,
} from '@/types/models';

type Props = {
  result: ForecastPlannerResult | null;
  statusDefinitions: ProjectStatusDefinition[];
};

type SeriesVisibility = {
  included: boolean;
  excluded: boolean;
  proposed: boolean;
  capacity: boolean;
};

type NormalizeMode = 'hours' | 'percent';

type Point = { x: number; y: number };

const CHART_COLORS = {
  capacity: '#60a5fa',
  included: '#22c55e',
  excluded: '#a78bfa',
  proposed: '#f59e0b',
  total: '#f43f5e',
  threshold: '#fb7185',
  baseline: '#38bdf8',
  confidenceBand: '#2563eb',
  confidenceLine: '#1d4ed8',
};

const DEPT_COLORS = ['#60a5fa', '#22c55e', '#f59e0b', '#f97316', '#a78bfa', '#14b8a6', '#f43f5e', '#84cc16'];

const yTicks = (maxValue: number): number[] => {
  if (maxValue <= 0) return [0, 1];
  const desired = 4;
  const raw = maxValue / desired;
  const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const ratio = raw / pow10;
  let step = 1;
  if (ratio <= 1) step = 1;
  else if (ratio <= 2) step = 2;
  else if (ratio <= 5) step = 5;
  else step = 10;
  step *= pow10;
  const top = Math.ceil(maxValue / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
};

const linePath = (points: Point[]): string => {
  if (!points.length) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) d += ` L ${points[i].x} ${points[i].y}`;
  return d;
};

const areaPath = (top: Point[], baseY: number): string => {
  if (!top.length) return '';
  let d = linePath(top);
  d += ` L ${top[top.length - 1].x} ${baseY}`;
  d += ` L ${top[0].x} ${baseY} Z`;
  return d;
};

const stackedAreaPath = (top: Point[], bottom: Point[]): string => {
  if (!top.length || !bottom.length || top.length !== bottom.length) return '';
  let d = linePath(top);
  for (let i = bottom.length - 1; i >= 0; i -= 1) d += ` L ${bottom[i].x} ${bottom[i].y}`;
  d += ' Z';
  return d;
};

const seriesAt = (series: number[], idx: number | null): number | null => {
  if (idx == null) return null;
  if (idx < 0 || idx >= series.length) return null;
  return Number(series[idx] || 0);
};

const fmtHours = (value: number | null): string => (value == null ? '-' : `${Math.round(value)}h`);
const fmtPct = (value: number | null): string => (value == null ? '-' : `${Math.round(value)}%`);

type TimePlotProps = {
  title: string;
  labels: string[];
  maxY: number;
  hoverIndex: number | null;
  onHoverIndexChange: (idx: number | null) => void;
  children: (ctx: {
    width: number;
    height: number;
    padLeft: number;
    padRight: number;
    padTop: number;
    padBottom: number;
    x: (idx: number) => number;
    y: (value: number) => number;
    innerW: number;
    innerH: number;
  }) => React.ReactNode;
  rightSlot?: React.ReactNode;
  legend?: React.ReactNode;
};

const TimePlot: React.FC<TimePlotProps> = ({
  title,
  labels,
  maxY,
  hoverIndex,
  onHoverIndexChange,
  children,
  rightSlot,
  legend,
}) => {
  const padLeft = 46;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 30;
  const width = Math.max(760, labels.length * 40);
  const height = 260;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const x = (idx: number): number => {
    if (labels.length <= 1) return padLeft + innerW / 2;
    return padLeft + (idx * innerW) / (labels.length - 1);
  };
  const y = (value: number): number => padTop + innerH - (Math.max(0, value) / Math.max(1, maxY)) * innerH;
  const ticks = yTicks(maxY);
  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    if (labels.length <= 1) {
      onHoverIndexChange(0);
      return;
    }
    const idx = Math.round(((px - padLeft) / innerW) * (labels.length - 1));
    onHoverIndexChange(Math.max(0, Math.min(labels.length - 1, idx)));
  };

  return (
    <Card className="ux-panel">
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
          {rightSlot}
        </div>
        <div className="overflow-x-auto">
          <svg width={width} height={height} role="img" aria-label={title}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={padLeft} x2={width - padRight} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeOpacity={0.45} />
                <text x={padLeft - 6} y={y(tick) + 4} textAnchor="end" fill="var(--muted)" fontSize={10}>
                  {Math.round(tick)}
                </text>
              </g>
            ))}
            {children({ width, height, padLeft, padRight, padTop, padBottom, x, y, innerW, innerH })}
            {hoverIndex != null && hoverIndex >= 0 && hoverIndex < labels.length ? (
              <line
                x1={x(hoverIndex)}
                x2={x(hoverIndex)}
                y1={padTop}
                y2={height - padBottom}
                stroke="#94a3b8"
                strokeDasharray="3,3"
                opacity={0.7}
              />
            ) : null}
            <rect
              x={padLeft}
              y={padTop}
              width={innerW}
              height={innerH}
              fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={() => onHoverIndexChange(null)}
            />
            {labels.map((label, idx) => {
              const sparse = labels.length <= 12 || idx % 2 === 0 || idx === labels.length - 1;
              if (!sparse) return null;
              return (
                <text key={`${label}-${idx}`} x={x(idx)} y={height - 8} textAnchor="middle" fill="var(--muted)" fontSize={10}>
                  {label}
                </text>
              );
            })}
          </svg>
        </div>
        {legend ? <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--muted)]">{legend}</div> : null}
      </div>
    </Card>
  );
};

const LegendToken: React.FC<{
  label: string;
  color: string;
  kind?: 'line' | 'dashed' | 'area' | 'bar' | 'band';
}> = ({ label, color, kind = 'line' }) => {
  const swatch = (() => {
    if (kind === 'area') {
      return <span className="inline-block h-3 w-4 rounded-sm border" style={{ backgroundColor: color, borderColor: color, opacity: 0.35 }} />;
    }
    if (kind === 'bar') {
      return <span className="inline-block h-3 w-2 rounded-sm" style={{ backgroundColor: color }} />;
    }
    if (kind === 'band') {
      return <span className="inline-block h-3 w-4 rounded-sm" style={{ backgroundColor: color, opacity: 0.25 }} />;
    }
    if (kind === 'dashed') {
      return <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: color }} />;
    }
    return <span className="inline-block h-0 w-4 border-t-2" style={{ borderColor: color }} />;
  })();
  return (
    <span className="inline-flex items-center gap-2">
      {swatch}
      <span>{label}</span>
    </span>
  );
};

const statusColorMap = (defs: ProjectStatusDefinition[]): Record<string, string> => {
  const out: Record<string, string> = {};
  defs.forEach((def) => {
    out[def.key] = def.colorHex || '#64748b';
  });
  return out;
};

const ForecastChartsSection: React.FC<Props> = ({ result, statusDefinitions }) => {
  const chartData: ForecastPlannerChartData | undefined = result?.chartData;
  const [timeGrain, setTimeGrain] = React.useState<ForecastPlannerTimeGrain>('weekly');
  const [seriesVisibility, setSeriesVisibility] = React.useState<SeriesVisibility>({
    included: true,
    excluded: true,
    proposed: true,
    capacity: true,
  });
  const [normalizeMode, setNormalizeMode] = React.useState<NormalizeMode>('hours');
  const [statusDetailMode, setStatusDetailMode] = React.useState<boolean>(false);
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const [selectedRoleId, setSelectedRoleId] = React.useState<number | null>(null);
  const [selectedStartRow, setSelectedStartRow] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!chartData) return;
    const start = performance.now();
    const raf = window.requestAnimationFrame(() => {
      trackPerformanceEvent('forecast_planner.chart_pack_render', performance.now() - start, 'ms', {
        grain: timeGrain,
        points: String((timeGrain === 'weekly' ? chartData.timeline.weekKeys : chartData.timeline.monthKeys).length),
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [chartData, timeGrain]);

  React.useEffect(() => {
    if (!chartData) return;
    const topId = chartData.roleSeries.topBottleneckRoleIds?.[0];
    setSelectedRoleId(topId ?? null);
  }, [chartData]);

  if (!chartData) {
    return (
      <Card className="ux-panel">
        <div className="p-4 text-sm text-[var(--muted)]">Chart payload is unavailable for this scenario. Use the timeline table fallback below.</div>
      </Card>
    );
  }

  const grainKey = timeGrain === 'weekly' ? 'weekly' : 'monthly';
  const labels = (timeGrain === 'weekly' ? chartData.timeline.weekKeys : chartData.timeline.monthKeys).map((item) => (
    timeGrain === 'weekly' ? item.slice(5) : item
  ));
  const team = chartData.teamSeries[grainKey];
  const statusSeries = chartData.statusSeries[grainKey];
  const roleSeries = chartData.roleSeries[grainKey];
  const departmentSeries = chartData.departmentSeries[grainKey];
  const unmapped = chartData.unmappedSeries[grainKey];
  const impact = chartData.impactSeries[grainKey];
  const confidence = chartData.confidenceSeries[grainKey];
  const statusColors = statusColorMap(statusDefinitions);

  const normDenominator = team.capacity.map((cap) => Math.max(1, Number(cap || 0)));
  const norm = (values: number[]) => values.map((v, idx) => (Number(v || 0) / normDenominator[idx]) * 100);
  const teamIncluded = normalizeMode === 'hours' ? team.scheduledIncluded : norm(team.scheduledIncluded);
  const teamExcluded = normalizeMode === 'hours' ? team.scheduledExcluded : norm(team.scheduledExcluded);
  const teamProposed = normalizeMode === 'hours' ? team.proposed : norm(team.proposed);
  const teamCapacity = normalizeMode === 'hours' ? team.capacity : team.capacity.map((v) => (v > 0 ? 100 : 0));
  const teamTotal = normalizeMode === 'hours' ? team.totalDemand : norm(team.totalDemand);
  const teamChartMax = Math.max(
    normalizeMode === 'hours' ? 10 : 100,
    ...(seriesVisibility.capacity ? teamCapacity : [0]),
    ...(seriesVisibility.included ? teamIncluded : [0]),
    ...(seriesVisibility.excluded ? teamExcluded : [0]),
    ...(seriesVisibility.proposed ? teamProposed : [0]),
    ...teamTotal,
  ) * 1.15;

  const utilizationMax = Math.max(100, ...team.teamUtilizationPct, team.teamUtilizationThresholdPct + 15);
  const statusGroupedMax = Math.max(10, ...statusSeries.scheduledIncludedByWeek, ...statusSeries.scheduledExcludedByWeek) * 1.15;
  const impactMaxAbs = Math.max(5, ...impact.deltaDemand.map((v) => Math.abs(v)));
  const unmappedThreshold = timeGrain === 'weekly'
    ? chartData.unmappedSeries.thresholdPerWeek
    : Math.max(...chartData.unmappedSeries.thresholdPerMonth, 1);
  const unmappedMax = Math.max(
    unmappedThreshold,
    ...unmapped.baselineUnmapped,
    ...unmapped.proposedUnmapped,
    ...unmapped.totalUnmapped,
    5,
  ) * 1.2;
  const confidenceMax = Math.max(10, ...confidence.highDemandByWeek, ...confidence.expectedDemandByWeek) * 1.15;

  const roleMap = new Map<number, ForecastPlannerRoleSeries>();
  roleSeries.forEach((row) => roleMap.set(row.roleId, row));
  const activeRole = selectedRoleId != null ? roleMap.get(selectedRoleId) : undefined;
  const roleDemand = activeRole?.totalDemand || [];
  const roleCapacity = activeRole?.capacity || [];
  const roleBaseline = activeRole?.baselineDemand || [];
  const roleProposed = activeRole?.proposedDemand || [];
  const roleUtil = activeRole?.utilization || [];
  const roleNorm = (values: number[]) => values.map((v, idx) => (Number(v || 0) / Math.max(1, Number(roleCapacity[idx] || 0))) * 100);
  const roleChartMax = normalizeMode === 'hours'
    ? Math.max(10, ...roleDemand, ...roleCapacity, ...roleBaseline, ...roleProposed) * 1.15
    : Math.max(100, ...roleNorm(roleDemand), ...roleNorm(roleBaseline), ...roleNorm(roleProposed));

  const topDepartments = [...departmentSeries]
    .map((row) => ({ ...row, totalHours: row.total.reduce((acc, cur) => acc + Number(cur || 0), 0) }))
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, 6);
  const deptMaxPerPoint = labels.map((_, idx) => topDepartments.reduce((acc, dept) => acc + Number(dept.total[idx] || 0), 0));
  const deptChartMax = Math.max(10, ...deptMaxPerPoint) * 1.2;

  const statusDetailSeries = {
    included: Object.entries(statusSeries.includedByStatusKey || {}).sort((a, b) => a[0].localeCompare(b[0])),
    excluded: Object.entries(statusSeries.excludedByStatusKey || {}).sort((a, b) => a[0].localeCompare(b[0])),
  };

  const resolveHoverLabel = (): string => {
    if (hoverIndex == null || hoverIndex < 0 || hoverIndex >= labels.length) return '—';
    return labels[hoverIndex];
  };

  return (
    <div className="space-y-6">
      <Card className="ux-panel">
        <div className="p-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <label className="text-xs text-[var(--muted)]">
            Time Grain
            <select
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] p-2 text-sm text-[var(--text)]"
              value={timeGrain}
              onChange={(e) => setTimeGrain(e.target.value as ForecastPlannerTimeGrain)}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Normalize
            <select
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] p-2 text-sm text-[var(--text)]"
              value={normalizeMode}
              onChange={(e) => setNormalizeMode(e.target.value as NormalizeMode)}
            >
              <option value="hours">Hours</option>
              <option value="percent">Percent</option>
            </select>
          </label>
          <div className="text-xs text-[var(--muted)]">
            Series Visibility
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ['included', 'Included'],
                ['excluded', 'Excluded'],
                ['proposed', 'Proposed'],
                ['capacity', 'Capacity'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  className={`rounded border px-2 py-1 text-xs ${seriesVisibility[key] ? 'border-[var(--primary)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
                  onClick={() => setSeriesVisibility((prev) => ({ ...prev, [key]: !prev[key] }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-[var(--muted)]">
            Cursor
            <div className="mt-2 rounded border border-[var(--border)] px-2 py-2 text-sm text-[var(--text)]">{resolveHoverLabel()}</div>
          </div>
        </div>
      </Card>

      <TimePlot
        title="Team Demand vs Capacity Trend"
        labels={labels}
        maxY={teamChartMax}
        hoverIndex={hoverIndex}
        onHoverIndexChange={setHoverIndex}
        rightSlot={<span className="text-xs text-[var(--muted)]">{normalizeMode === 'hours' ? 'Hours' : '% of capacity'}</span>}
        legend={(
          <>
            <LegendToken label="Capacity" color={CHART_COLORS.capacity} kind="line" />
            <LegendToken label="Scheduled Included" color={CHART_COLORS.included} kind="area" />
            <LegendToken label="Scheduled Excluded" color={CHART_COLORS.excluded} kind="area" />
            <LegendToken label="Proposed" color={CHART_COLORS.proposed} kind="area" />
            <LegendToken label="Total Demand" color={CHART_COLORS.total} kind="line" />
          </>
        )}
      >
        {({ x, y, height, padBottom }) => {
          const pointsIncluded = teamIncluded.map((v, i) => ({ x: x(i), y: y(v) }));
          const pointsExcluded = teamExcluded.map((v, i) => ({ x: x(i), y: y(v) }));
          const pointsProposed = teamProposed.map((v, i) => ({ x: x(i), y: y(v) }));
          const pointsTotal = teamTotal.map((v, i) => ({ x: x(i), y: y(v) }));
          const pointsCapacity = teamCapacity.map((v, i) => ({ x: x(i), y: y(v) }));
          return (
            <>
              {seriesVisibility.included ? <path d={areaPath(pointsIncluded, height - padBottom)} fill={CHART_COLORS.included} fillOpacity={0.2} /> : null}
              {seriesVisibility.excluded ? <path d={areaPath(pointsExcluded, height - padBottom)} fill={CHART_COLORS.excluded} fillOpacity={0.16} /> : null}
              {seriesVisibility.proposed ? <path d={areaPath(pointsProposed, height - padBottom)} fill={CHART_COLORS.proposed} fillOpacity={0.12} /> : null}
              {seriesVisibility.capacity ? <path d={linePath(pointsCapacity)} stroke={CHART_COLORS.capacity} strokeWidth={2.2} fill="none" /> : null}
              <path d={linePath(pointsTotal)} stroke={CHART_COLORS.total} strokeWidth={2.4} fill="none" />
            </>
          );
        }}
      </TimePlot>

      <TimePlot
        title="Utilization Trend with Threshold Bands"
        labels={labels}
        maxY={utilizationMax}
        hoverIndex={hoverIndex}
        onHoverIndexChange={setHoverIndex}
        legend={(
          <>
            <LegendToken label="Safe Band" color="#14532d" kind="band" />
            <LegendToken label="Caution Band" color="#854d0e" kind="band" />
            <LegendToken label="No-Go Band" color="#7f1d1d" kind="band" />
            <LegendToken label="Threshold" color={CHART_COLORS.threshold} kind="dashed" />
            <LegendToken label="Team Utilization" color="#f43f5e" kind="line" />
          </>
        )}
      >
        {({ x, y, width, padLeft, padRight, padTop, padBottom, height }) => {
          const thresholdY = y(team.teamUtilizationThresholdPct);
          const cautionY = y(team.teamUtilizationThresholdPct + 10);
          const points = team.teamUtilizationPct.map((v, i) => ({ x: x(i), y: y(v) }));
          return (
            <>
              <rect x={padLeft} y={padTop} width={width - padLeft - padRight} height={Math.max(0, cautionY - padTop)} fill="#14532d" fillOpacity={0.08} />
              <rect x={padLeft} y={cautionY} width={width - padLeft - padRight} height={Math.max(0, thresholdY - cautionY)} fill="#854d0e" fillOpacity={0.09} />
              <rect x={padLeft} y={thresholdY} width={width - padLeft - padRight} height={Math.max(0, height - padBottom - thresholdY)} fill="#7f1d1d" fillOpacity={0.1} />
              <line x1={padLeft} x2={width - padRight} y1={thresholdY} y2={thresholdY} stroke={CHART_COLORS.threshold} strokeDasharray="5,4" strokeWidth={1.5} />
              <path d={linePath(points)} stroke="#f43f5e" strokeWidth={2.4} fill="none" />
            </>
          );
        }}
      </TimePlot>

      <TimePlot
        title="Scheduled Hours by Status"
        labels={labels}
        maxY={statusGroupedMax}
        hoverIndex={hoverIndex}
        onHoverIndexChange={setHoverIndex}
        rightSlot={(
          <button
            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]"
            onClick={() => setStatusDetailMode((prev) => !prev)}
          >
            {statusDetailMode ? 'Group View' : 'Drill by Status'}
          </button>
        )}
        legend={(
          !statusDetailMode ? (
            <>
              <LegendToken label="Included Group" color={CHART_COLORS.included} kind="area" />
              <LegendToken label="Excluded Group" color={CHART_COLORS.excluded} kind="area" />
            </>
          ) : (
            <>
              {statusDetailSeries.included.slice(0, 8).map(([key]) => (
                <LegendToken key={`legend-included-${key}`} label={`Included: ${key}`} color={statusColors[key] || '#64748b'} kind="area" />
              ))}
              {statusDetailSeries.excluded.slice(0, 8).map(([key]) => (
                <LegendToken key={`legend-excluded-${key}`} label={`Excluded: ${key}`} color={statusColors[key] || '#64748b'} kind="dashed" />
              ))}
            </>
          )
        )}
      >
        {({ x, y, height, padBottom }) => {
          if (!statusDetailMode) {
            const includedPts = statusSeries.scheduledIncludedByWeek.map((v, i) => ({ x: x(i), y: y(v) }));
            const excludedPts = statusSeries.scheduledExcludedByWeek.map((v, i) => ({ x: x(i), y: y(v) }));
            return (
              <>
                <path d={areaPath(includedPts, height - padBottom)} fill={CHART_COLORS.included} fillOpacity={0.22} />
                <path d={linePath(includedPts)} stroke={CHART_COLORS.included} strokeWidth={2} fill="none" />
                <path d={areaPath(excludedPts, height - padBottom)} fill={CHART_COLORS.excluded} fillOpacity={0.18} />
                <path d={linePath(excludedPts)} stroke={CHART_COLORS.excluded} strokeWidth={2} fill="none" />
              </>
            );
          }

          const renderStack = (entries: Array<[string, number[]]>, mode: 'included' | 'excluded') => {
            const base = new Array(labels.length).fill(0);
            return entries.map(([key, values]) => {
              const top = values.map((v, idx) => base[idx] + Number(v || 0));
              const topPts = top.map((v, idx) => ({ x: x(idx), y: y(v) }));
              const basePts = base.map((v, idx) => ({ x: x(idx), y: y(v) }));
              base.splice(0, base.length, ...top);
              return (
                <g key={`${mode}-${key}`}>
                  <path d={stackedAreaPath(topPts, basePts)} fill={statusColors[key] || '#64748b'} fillOpacity={mode === 'included' ? 0.22 : 0.14} />
                  <path d={linePath(topPts)} stroke={statusColors[key] || '#64748b'} strokeWidth={1.5} fill="none" />
                </g>
              );
            });
          };
          return (
            <>
              {renderStack(statusDetailSeries.included, 'included')}
              {renderStack(statusDetailSeries.excluded, 'excluded')}
            </>
          );
        }}
      </TimePlot>

      <TimePlot
        title="Scenario Impact Delta"
        labels={labels}
        maxY={impactMaxAbs * 2}
        hoverIndex={hoverIndex}
        onHoverIndexChange={setHoverIndex}
        legend={(
          <>
            <LegendToken label="Positive Delta (added demand)" color="#f59e0b" kind="bar" />
            <LegendToken label="Negative Delta (reduced demand)" color="#38bdf8" kind="bar" />
            <LegendToken label="Zero Baseline" color="#94a3b8" kind="line" />
          </>
        )}
      >
        {({ x, y, padLeft, padRight, width, height, padBottom }) => {
          const zeroY = y(impactMaxAbs);
          const step = labels.length <= 1 ? 20 : (width - padLeft - padRight) / (labels.length - 1);
          return (
            <>
              <line x1={padLeft} x2={width - padRight} y1={zeroY} y2={zeroY} stroke="var(--border)" />
              {impact.deltaDemand.map((value, idx) => {
                const v = Number(value || 0);
                const barHalf = Math.max(4, step * 0.3);
                const top = v >= 0 ? y(impactMaxAbs + v) : zeroY;
                const bottom = v >= 0 ? zeroY : y(impactMaxAbs + v);
                return (
                  <rect
                    key={`impact-${idx}`}
                    x={x(idx) - barHalf}
                    y={Math.min(top, bottom)}
                    width={barHalf * 2}
                    height={Math.max(1, Math.abs(bottom - top))}
                    fill={v >= 0 ? '#f59e0b' : '#38bdf8'}
                    fillOpacity={0.85}
                  />
                );
              })}
              <line x1={padLeft} x2={width - padRight} y1={height - padBottom} y2={height - padBottom} stroke="var(--border)" />
            </>
          );
        }}
      </TimePlot>

      <Card className="ux-panel">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text)]">Role Bottleneck Trends</h3>
            <span className="text-xs text-[var(--muted)]">{activeRole?.roleName || 'No role selected'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(chartData.roleSeries.topBottleneckRoleIds || []).map((roleId) => {
              const role = roleMap.get(roleId);
              return (
                <button
                  key={roleId}
                  className={`rounded border px-2 py-1 text-xs ${selectedRoleId === roleId ? 'border-[var(--primary)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
                  onClick={() => setSelectedRoleId(roleId)}
                >
                  {role?.roleName || `Role ${roleId}`}
                </button>
              );
            })}
          </div>
          {activeRole ? (
            <TimePlot
              title="Selected Role Capacity vs Demand"
              labels={labels}
              maxY={roleChartMax}
              hoverIndex={hoverIndex}
              onHoverIndexChange={setHoverIndex}
              rightSlot={<span className="text-xs text-[var(--muted)]">Peak {fmtPct(Math.max(...(roleUtil || [0])))}</span>}
              legend={(
                <>
                  <LegendToken label="Capacity" color={CHART_COLORS.capacity} kind="line" />
                  <LegendToken label="Baseline" color={CHART_COLORS.baseline} kind="line" />
                  <LegendToken label="Proposed" color={CHART_COLORS.proposed} kind="line" />
                  <LegendToken label="Total Demand" color={CHART_COLORS.total} kind="line" />
                </>
              )}
            >
              {({ x, y }) => {
                const roleCapacityPlot = normalizeMode === 'hours' ? roleCapacity : roleCapacity.map((v) => (v > 0 ? 100 : 0));
                const roleBasePlot = normalizeMode === 'hours' ? roleBaseline : roleNorm(roleBaseline);
                const rolePropPlot = normalizeMode === 'hours' ? roleProposed : roleNorm(roleProposed);
                const roleTotalPlot = normalizeMode === 'hours' ? roleDemand : roleNorm(roleDemand);
                return (
                  <>
                    <path d={linePath(roleCapacityPlot.map((v, i) => ({ x: x(i), y: y(v) })))} stroke={CHART_COLORS.capacity} strokeWidth={2} fill="none" />
                    <path d={linePath(roleBasePlot.map((v, i) => ({ x: x(i), y: y(v) })))} stroke={CHART_COLORS.baseline} strokeWidth={2} fill="none" />
                    <path d={linePath(rolePropPlot.map((v, i) => ({ x: x(i), y: y(v) })))} stroke={CHART_COLORS.proposed} strokeWidth={2} fill="none" />
                    <path d={linePath(roleTotalPlot.map((v, i) => ({ x: x(i), y: y(v) })))} stroke={CHART_COLORS.total} strokeWidth={2.4} fill="none" />
                  </>
                );
              }}
            </TimePlot>
          ) : (
            <div className="text-sm text-[var(--muted)]">No bottleneck role data available for this view.</div>
          )}
        </div>
      </Card>

      <TimePlot
        title="Department Contribution"
        labels={labels}
        maxY={deptChartMax}
        hoverIndex={hoverIndex}
        onHoverIndexChange={setHoverIndex}
        legend={(
          <>
            {topDepartments.map((dept, deptIdx) => (
              <LegendToken
                key={`dept-legend-${dept.departmentId}`}
                label={dept.departmentName}
                color={DEPT_COLORS[deptIdx % DEPT_COLORS.length]}
                kind="bar"
              />
            ))}
          </>
        )}
      >
        {({ x, y, padLeft, padRight, width, height, padBottom }) => {
          const step = labels.length <= 1 ? 28 : (width - padLeft - padRight) / (labels.length - 1);
          return (
            <>
              {labels.map((_, idx) => {
                let running = 0;
                const barWidth = Math.max(8, step * 0.65);
                return (
                  <g key={`dept-stack-${idx}`}>
                    {topDepartments.map((dept, deptIdx) => {
                      const v = Number(dept.total[idx] || 0);
                      const top = running + v;
                      const yTop = y(top);
                      const yBottom = y(running);
                      running = top;
                      if (v <= 0) return null;
                      return (
                        <rect
                          key={`dept-${dept.departmentId}-${idx}`}
                          x={x(idx) - barWidth / 2}
                          y={yTop}
                          width={barWidth}
                          height={Math.max(1, yBottom - yTop)}
                          fill={DEPT_COLORS[deptIdx % DEPT_COLORS.length]}
                          fillOpacity={0.9}
                        />
                      );
                    })}
                  </g>
                );
              })}
              <line x1={padLeft} x2={width - padRight} y1={height - padBottom} y2={height - padBottom} stroke="var(--border)" />
            </>
          );
        }}
      </TimePlot>

      <TimePlot
        title="Unmapped Demand Risk"
        labels={labels}
        maxY={unmappedMax}
        hoverIndex={hoverIndex}
        onHoverIndexChange={setHoverIndex}
        legend={(
          <>
            <LegendToken label="Baseline Unmapped" color={CHART_COLORS.baseline} kind="line" />
            <LegendToken label="Proposed Unmapped" color={CHART_COLORS.proposed} kind="line" />
            <LegendToken label="Total Unmapped" color={CHART_COLORS.total} kind="line" />
            <LegendToken label="Unmapped Threshold" color={CHART_COLORS.threshold} kind="dashed" />
          </>
        )}
      >
        {({ x, y, padLeft, padRight, width }) => {
          const threshold = timeGrain === 'weekly' ? unmappedThreshold : unmappedThreshold;
          return (
            <>
              <path d={linePath(unmapped.baselineUnmapped.map((v, i) => ({ x: x(i), y: y(v) })))} stroke={CHART_COLORS.baseline} strokeWidth={2} fill="none" />
              <path d={linePath(unmapped.proposedUnmapped.map((v, i) => ({ x: x(i), y: y(v) })))} stroke={CHART_COLORS.proposed} strokeWidth={2} fill="none" />
              <path d={linePath(unmapped.totalUnmapped.map((v, i) => ({ x: x(i), y: y(v) })))} stroke={CHART_COLORS.total} strokeWidth={2.4} fill="none" />
              <line x1={padLeft} x2={width - padRight} y1={y(threshold)} y2={y(threshold)} stroke={CHART_COLORS.threshold} strokeDasharray="5,4" />
            </>
          );
        }}
      </TimePlot>

      <Card className="ux-panel">
        <div className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Earliest Feasible Start Windows</h3>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
            <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#94a3b8' }} />Requested Start</span>
            <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />Earliest Feasible Start</span>
            <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />Delay (weeks)</span>
          </div>
          {chartData.feasibleStarts.rows.length === 0 ? (
            <div className="text-sm text-[var(--muted)]">No proposed projects in this scenario.</div>
          ) : (
            <div className="space-y-2">
              {chartData.feasibleStarts.rows.map((row, idx) => (
                <button
                  key={`${row.templateId}-${idx}`}
                  className={`w-full rounded border p-3 text-left ${selectedStartRow === idx ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}
                  onClick={() => setSelectedStartRow(idx)}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--text)]">{row.name}</span>
                    <span className="text-[var(--muted)]">
                      {row.earliestFeasibleStartDate ? `Earliest ${row.earliestFeasibleStartDate}` : 'No feasible start in horizon'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    Requested {row.requestedStartDate || 'N/A'}
                    {row.delayWeeks != null ? ` • Delay ${row.delayWeeks}w` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <TimePlot
        title="Confidence Envelope"
        labels={labels}
        maxY={confidenceMax}
        hoverIndex={hoverIndex}
        onHoverIndexChange={setHoverIndex}
        rightSlot={<span className="text-xs text-[var(--muted)]">{chartData.confidenceSeries.enabled ? 'Probability-weighted' : 'Weighting disabled'}</span>}
        legend={(
          <>
            <LegendToken label="Expected Demand" color={CHART_COLORS.confidenceLine} kind="line" />
            <LegendToken label="Uncertainty Band (Low-High)" color={CHART_COLORS.confidenceBand} kind="band" />
          </>
        )}
      >
        {({ x }) => {
          const lowPts = confidence.lowDemandByWeek.map((v, i) => ({ x: x(i), y: v }));
          const highPts = confidence.highDemandByWeek.map((v, i) => ({ x: x(i), y: v }));
          const expectedPts = confidence.expectedDemandByWeek.map((v, i) => ({ x: x(i), y: v }));
          const padTop = 16;
          const height = 260;
          const padBottom = 30;
          const innerH = height - padTop - padBottom;
          const max = Math.max(1, confidenceMax);
          const toY = (val: number): number => padTop + innerH - (Math.max(0, val) / max) * innerH;
          const highPoints = highPts.map((p) => ({ x: p.x, y: toY(p.y) }));
          const lowPoints = lowPts.map((p) => ({ x: p.x, y: toY(p.y) }));
          const expectedPoints = expectedPts.map((p) => ({ x: p.x, y: toY(p.y) }));
          return (
            <>
              <path d={stackedAreaPath(highPoints, lowPoints)} fill={CHART_COLORS.confidenceBand} fillOpacity={0.18} />
              <path d={linePath(expectedPoints)} stroke={CHART_COLORS.confidenceLine} strokeWidth={2.4} fill="none" />
            </>
          );
        }}
      </TimePlot>

      <Card className="ux-panel">
        <div className="p-4 text-xs text-[var(--muted)] grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div>Included @ cursor: {fmtHours(seriesAt(team.scheduledIncluded, hoverIndex))}</div>
          <div>Excluded @ cursor: {fmtHours(seriesAt(team.scheduledExcluded, hoverIndex))}</div>
          <div>Proposed @ cursor: {fmtHours(seriesAt(team.proposed, hoverIndex))}</div>
          <div>Utilization @ cursor: {fmtPct(seriesAt(team.teamUtilizationPct, hoverIndex))}</div>
        </div>
      </Card>
    </div>
  );
};

export default ForecastChartsSection;
