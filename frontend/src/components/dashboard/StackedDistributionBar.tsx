import React from 'react';

export interface DistributionSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  range?: string;
}

interface StackedDistributionBarProps {
  segments: DistributionSegment[];
  total: number;
  leftValue?: string | number;
  rightValue?: string | number;
}

const StackedDistributionBar: React.FC<StackedDistributionBarProps> = ({ segments, total, leftValue, rightValue }) => {
  const safeTotal = Math.max(0, total);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-[var(--muted)]">
        <span>{leftValue ?? ''}</span>
        <span>{rightValue ?? ''}</span>
      </div>
      <div className="overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex h-3 w-full">
          {segments.map((segment) => {
            const pct = safeTotal > 0 ? (segment.value / safeTotal) * 100 : 0;
            return (
              <div
                key={segment.key}
                className="h-full"
                style={{ width: `${pct}%`, backgroundColor: segment.color }}
                aria-label={`${segment.label}: ${segment.value}`}
              />
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-[var(--muted)] sm:grid-cols-4">
        {segments.map((segment) => (
          <div key={`label-${segment.key}`} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
            <div>
              <div className="text-[var(--text)] font-medium">{segment.label}</div>
              <div>{segment.range ? `${segment.range} / ${segment.value}` : `${segment.value}`}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StackedDistributionBar;
