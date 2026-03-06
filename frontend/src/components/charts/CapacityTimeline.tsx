import React, { useMemo, useRef, useState } from 'react';
import { WorkloadForecastItem } from '@/types/models';

type Scale = 'week' | 'month' | 'quarter' | 'year';

export interface CapacityTimelineProps {
  weeklyData: WorkloadForecastItem[]; // Always weekly from API
  scale: Scale;
  seriesVisibility?: {
    utilization?: boolean; // filled area (utilized hours)
    capacity?: boolean; // blue line
    allocated?: boolean; // green line
    available?: boolean; // purple line
  };
}

type AggregatedPoint = {
  label: string; // x label
  totalCapacity: number;
  totalAllocated: number;
  available: number;
  utilized: number; // same as allocated, explicit for clarity
};

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function quarterKey(d: Date) {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

function yearKey(d: Date) {
  return `${d.getUTCFullYear()}`;
}

// Aggregate weekly API data into month/quarter/year buckets
function aggregate(data: WorkloadForecastItem[], scale: Scale): AggregatedPoint[] {
  if (!data?.length) return [];
  if (scale === 'week') {
    return data.map((w) => {
      const available = Math.max(0, (w.totalCapacity || 0) - (w.totalAllocated || 0));
      return {
        label: w.weekStart.slice(5),
        totalCapacity: w.totalCapacity || 0,
        totalAllocated: w.totalAllocated || 0,
        available,
        utilized: w.totalAllocated || 0,
      };
    });
  }

  const buckets = new Map<string, AggregatedPoint>();
  const keyer = scale === 'month' ? monthKey : scale === 'quarter' ? quarterKey : yearKey;
  for (const w of data) {
    const d = new Date(w.weekStart + 'T00:00:00Z');
    const key = keyer(d);
    const bp = buckets.get(key) || {
      label: key,
      totalCapacity: 0,
      totalAllocated: 0,
      available: 0,
      utilized: 0,
    };
    bp.totalCapacity += w.totalCapacity || 0;
    bp.totalAllocated += w.totalAllocated || 0;
    buckets.set(key, bp);
  }
  // compute derived fields and sort by natural order of label occurrence in source
  const orderedKeys = Array.from(buckets.keys());
  const points = orderedKeys.map((k) => {
    const bp = buckets.get(k)!;
    const available = Math.max(0, bp.totalCapacity - bp.totalAllocated);
    return { ...bp, available, utilized: bp.totalAllocated };
  });
  return points;
}

// Simple, dependency-free SVG chart matching the requested look
export const CapacityTimeline: React.FC<CapacityTimelineProps> = ({ weeklyData, scale, seriesVisibility }) => {
  const vis = { utilization: true, capacity: true, allocated: true, available: true, ...(seriesVisibility || {}) };
  const palette = {
    axis: 'var(--color-border)',
    grid: 'var(--color-border-subtle)',
    tick: 'var(--color-text-secondary)',
    utilization: 'var(--color-state-warning)',
    capacity: 'var(--chart-accent-a)',
    allocated: 'var(--chart-accent-b)',
    available: 'var(--chart-neutral)',
    tooltipBg: 'var(--color-surface-elevated)',
    tooltipBorder: 'var(--color-border)',
    tooltipText: 'var(--color-text-primary)',
    tooltipMuted: 'var(--color-text-secondary)',
  } as const;

  const data = useMemo(() => aggregate(weeklyData, scale), [weeklyData, scale]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{
    show: boolean;
    left: number;
    top: number;
    index: number;
    series: 'capacity' | 'allocated' | 'available';
  }>({ show: false, left: 0, top: 0, index: 0, series: 'allocated' });

  if (!data.length) return <div className="text-[var(--color-text-secondary)]">No data</div>;

  const pad = 36;
  const step = 44; // horizontal spacing per point
  const width = Math.max(720, pad * 2 + (data.length - 1) * step);
  const height = 280;

  const maxY = Math.max(
    10,
    ...data.map((d) => Math.max(d.totalCapacity, d.totalAllocated, d.available, d.utilized))
  ) * 1.1;

  const x = (i: number) => pad + i * step;
  const y = (v: number) => height - pad - (v * (height - 2 * pad)) / maxY;

  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${y(v)}`).join(' ');

  const caps = data.map((d) => d.totalCapacity);
  const alloc = data.map((d) => d.totalAllocated);
  const avail = data.map((d) => d.available);

  const capPath = linePath(caps);
  const allocPath = linePath(alloc);
  const availPath = linePath(avail);

  const utilAreaPath = (() => {
    const top = alloc.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${y(v)}`).join(' ');
    const bottom = `L ${x(data.length - 1)},${y(0)} L ${x(0)},${y(0)} Z`;
    return top + ' ' + bottom;
  })();

  const ticks = 4;
  const yTicks = new Array(ticks + 1).fill(0).map((_, i) => Math.round((maxY * i) / ticks));

  const handleEnter = (series: 'capacity' | 'allocated' | 'available', idx: number, e: React.MouseEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const left = (e.clientX - (rect?.left || 0)) + 12; // small offset
    const top = (e.clientY - (rect?.top || 0)) - 12;
    setTip({ show: true, left, top, index: idx, series });
  };
  const handleMove = (e: React.MouseEvent) => {
    if (!tip.show) return;
    const rect = wrapperRef.current?.getBoundingClientRect();
    const left = (e.clientX - (rect?.left || 0)) + 12;
    const top = (e.clientY - (rect?.top || 0)) - 12;
    setTip((t) => ({ ...t, left, top }));
  };
  const handleLeave = () => setTip((t) => ({ ...t, show: false }));

  const fmtH = (v: number) => `${Math.round(v)}h`;
  const tipData = data[tip.index] || data[0];
  const utilPct = tipData?.totalCapacity ? Math.round((tipData.utilized / tipData.totalCapacity) * 100) : 0;

  return (
    <div style={{ overflowX: 'auto', position: 'relative' }} ref={wrapperRef}>
      <svg width={width} height={height} role="img" aria-label="Capacity timeline chart" onMouseMove={handleMove}>
        {/* Axes */}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke={palette.axis} strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke={palette.axis} strokeWidth={1} />

        {/* Y ticks */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad - 4} y1={y(t)} x2={width - pad} y2={y(t)} stroke={palette.grid} strokeDasharray="2,4" />
            <text x={8} y={y(t) + 4} fontSize={10} fill={palette.tick}>{t}</text>
          </g>
        ))}

        {/* Utilization area */}
        {vis.utilization && (
          <path d={utilAreaPath} fill={palette.utilization} fillOpacity={0.28} stroke="none" />
        )}

        {/* Lines */}
        {vis.capacity && <path d={capPath} fill="none" stroke={palette.capacity} strokeWidth={2} />}
        {vis.allocated && <path d={allocPath} fill="none" stroke={palette.allocated} strokeWidth={2} />}
        {vis.available && <path d={availPath} fill="none" stroke={palette.available} strokeWidth={2} />}

        {/* Data point dots with hover tooltips */}
        {vis.capacity && caps.map((v, i) => (
          <circle key={`cap-${i}`} cx={x(i)} cy={y(v)} r={3}
            fill={palette.capacity} stroke="var(--color-bg)" strokeWidth={1}
            onMouseEnter={(e) => handleEnter('capacity', i, e)} onMouseLeave={handleLeave} />
        ))}
        {vis.allocated && alloc.map((v, i) => (
          <circle key={`alloc-${i}`} cx={x(i)} cy={y(v)} r={3}
            fill={palette.allocated} stroke="var(--color-bg)" strokeWidth={1}
            onMouseEnter={(e) => handleEnter('allocated', i, e)} onMouseLeave={handleLeave} />
        ))}
        {vis.available && avail.map((v, i) => (
          <circle key={`avail-${i}`} cx={x(i)} cy={y(v)} r={3}
            fill={palette.available} stroke="var(--color-bg)" strokeWidth={1}
            onMouseEnter={(e) => handleEnter('available', i, e)} onMouseLeave={handleLeave} />
        ))}

        {/* X labels */}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={height - pad + 14} fontSize={10} fill={palette.tick} textAnchor="middle">
            {d.label}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tip.show && tipData && (
        <div
          role="tooltip"
          className="rounded-sm border p-2 text-xs shadow-lg"
          style={{
            position: 'absolute',
            left: tip.left,
            top: tip.top,
            pointerEvents: 'none',
            background: palette.tooltipBg,
            color: palette.tooltipText,
            borderColor: palette.tooltipBorder,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{scale === 'week' ? `Week ${weeklyData[tip.index]?.weekStart}` : tipData.label}</div>
          <div style={{ color: palette.tooltipMuted }}>Capacity: <span style={{ color: palette.capacity }}>{fmtH(tipData.totalCapacity)}</span></div>
          <div style={{ color: palette.tooltipMuted }}>Allocated: <span style={{ color: palette.allocated }}>{fmtH(tipData.utilized)}</span></div>
          <div style={{ color: palette.tooltipMuted }}>Available: <span style={{ color: palette.available }}>{fmtH(tipData.available)}</span></div>
          <div style={{ color: palette.tooltipMuted }}>Utilization: <span style={{ color: palette.utilization }}>{utilPct}%</span></div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2">
        <LegendDot color={palette.capacity} label="Total Capacity" />
        <LegendDot color={palette.allocated} label="Allocated Hours" />
        <LegendDot color={palette.available} label="Available Hours" />
        <LegendDot color={palette.utilization} label="Utilization (area)" box />
      </div>
    </div>
  );
};

const LegendDot: React.FC<{ color: string; label: string; box?: boolean }> = ({ color, label, box }) => (
  <div className="flex items-center gap-2 text-xs text-[var(--color-text-primary)]">
    <span
      style={{ background: color, width: 12, height: 6, display: 'inline-block', borderRadius: box ? 2 : 999 }}
      aria-hidden
    />
    {label}
  </div>
);

export const CapacityTimelineCompact: React.FC<CapacityTimelineProps> = ({ weeklyData, scale }) => {
  const data = useMemo(() => aggregate(weeklyData, scale), [weeklyData, scale]);

  if (!data.length) return <div className="text-[var(--color-text-secondary)]">No data</div>;

  const maxCapacity = Math.max(10, ...data.map((d) => d.totalCapacity));
  const maxBarHeight = 40;

  return (
    <div className="flex gap-3 overflow-x-auto py-2">
      {data.map((point, idx) => {
        const ratio = point.totalCapacity ? point.utilized / point.totalCapacity : 0;
        const barHeight = Math.max(
          4,
          Math.min(maxBarHeight, Math.round((point.utilized / maxCapacity) * maxBarHeight))
        );
        const utilizationPct = Math.round(ratio * 100);
        return (
          <div key={idx} className="flex flex-col items-center min-w-[48px]">
            <div className="flex h-10 w-3 items-end justify-center rounded-full bg-[var(--color-border)]">
              <div
                className="w-full rounded-full bg-[var(--chart-accent-b)]"
                style={{ height: `${barHeight}px` }}
                aria-hidden
              />
            </div>
            <div className="mt-1 max-w-[56px] truncate text-center text-[10px] text-[var(--color-text-secondary)]">
              {point.label}
            </div>
            <div className="text-[10px] text-[var(--color-text-secondary)]">
              {utilizationPct}%
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CapacityTimeline;
