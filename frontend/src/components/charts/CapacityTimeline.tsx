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

  const data = useMemo(() => aggregate(weeklyData, scale), [weeklyData, scale]);

  if (!data.length) return <div className="text-[var(--muted)]">No data</div>;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{
    show: boolean;
    left: number;
    top: number;
    index: number;
    series: 'capacity' | 'allocated' | 'available';
  }>({ show: false, left: 0, top: 0, index: 0, series: 'allocated' });

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
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#4b5563" strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#4b5563" strokeWidth={1} />

        {/* Y ticks */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad - 4} y1={y(t)} x2={width - pad} y2={y(t)} stroke="#374151" strokeDasharray="2,4" />
            <text x={8} y={y(t) + 4} fontSize={10} fill="#9ca3af">{t}</text>
          </g>
        ))}

        {/* Utilization area */}
        {vis.utilization && (
          <path d={utilAreaPath} fill="#d97706" fillOpacity={0.35} stroke="none" />
        )}

        {/* Lines */}
        {vis.capacity && <path d={capPath} fill="none" stroke="#60a5fa" strokeWidth={2} />}
        {vis.allocated && <path d={allocPath} fill="none" stroke="#22c55e" strokeWidth={2} />}
        {vis.available && <path d={availPath} fill="none" stroke="#a78bfa" strokeWidth={2} />}

        {/* Data point dots with hover tooltips */}
        {vis.capacity && caps.map((v, i) => (
          <circle key={`cap-${i}`} cx={x(i)} cy={y(v)} r={3}
            fill="#60a5fa" stroke="#0b4ea2" strokeWidth={1}
            onMouseEnter={(e) => handleEnter('capacity', i, e)} onMouseLeave={handleLeave} />
        ))}
        {vis.allocated && alloc.map((v, i) => (
          <circle key={`alloc-${i}`} cx={x(i)} cy={y(v)} r={3}
            fill="#22c55e" stroke="#036d2a" strokeWidth={1}
            onMouseEnter={(e) => handleEnter('allocated', i, e)} onMouseLeave={handleLeave} />
        ))}
        {vis.available && avail.map((v, i) => (
          <circle key={`avail-${i}`} cx={x(i)} cy={y(v)} r={3}
            fill="#a78bfa" stroke="#5b21b6" strokeWidth={1}
            onMouseEnter={(e) => handleEnter('available', i, e)} onMouseLeave={handleLeave} />
        ))}

        {/* X labels */}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={height - pad + 14} fontSize={10} fill="#94a3b8" textAnchor="middle">
            {d.label}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tip.show && tipData && (
        <div role="tooltip" style={{ position:'absolute', left: tip.left, top: tip.top, pointerEvents:'none',
          background:'#111827', color:'#e5e7eb', border:'1px solid #374151', borderRadius:6, padding:'8px 10px', fontSize:12, boxShadow:'0 8px 16px rgba(0,0,0,0.4)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{scale === 'week' ? `Week ${weeklyData[tip.index]?.weekStart}` : tipData.label}</div>
          <div>Capacity: <span style={{ color:'#60a5fa' }}>{fmtH(tipData.totalCapacity)}</span></div>
          <div>Allocated: <span style={{ color:'#22c55e' }}>{fmtH(tipData.utilized)}</span></div>
          <div>Available: <span style={{ color:'#a78bfa' }}>{fmtH(tipData.available)}</span></div>
          <div>Utilization: <span style={{ color:'#f59e0b' }}>{utilPct}%</span></div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2">
        <LegendDot color="#60a5fa" label="Total Capacity" />
        <LegendDot color="#22c55e" label="Allocated Hours" />
        <LegendDot color="#a78bfa" label="Available Hours" />
        <LegendDot color="#d97706" label="Utilization (area)" box />
      </div>
    </div>
  );
};

const LegendDot: React.FC<{ color: string; label: string; box?: boolean }> = ({ color, label, box }) => (
  <div className="flex items-center gap-2 text-[var(--text)] text-xs">
    <span
      style={{ background: color, width: 12, height: 6, display: 'inline-block', borderRadius: box ? 2 : 999 }}
      aria-hidden
    />
    {label}
  </div>
);

export default CapacityTimeline;
