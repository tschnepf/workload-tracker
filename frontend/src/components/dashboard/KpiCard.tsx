import React from 'react';
import Card from '@/components/ui/Card';

export type KpiAccent = 'green' | 'blue' | 'amber' | 'red' | 'neutral';

const accentStyles: Record<KpiAccent, { ring: string; text: string; dot: string }> = {
  green: { ring: 'border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  blue: { ring: 'border-blue-500/30', text: 'text-blue-300', dot: 'bg-blue-400' },
  amber: { ring: 'border-amber-500/30', text: 'text-amber-300', dot: 'bg-amber-400' },
  red: { ring: 'border-red-500/30', text: 'text-red-300', dot: 'bg-red-400' },
  neutral: { ring: 'border-[var(--border)]', text: 'text-[var(--text)]', dot: 'bg-[var(--muted)]' },
};

interface KpiDelta {
  value: string;
  direction: 'up' | 'down' | 'flat';
}

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  accent?: KpiAccent;
  subtext?: string;
  delta?: KpiDelta;
  className?: string;
}

const deltaStyles: Record<KpiDelta['direction'], string> = {
  up: 'text-emerald-300',
  down: 'text-red-300',
  flat: 'text-[var(--muted)]',
};

const KpiCard: React.FC<KpiCardProps> = ({ label, value, accent = 'neutral', subtext, delta, className }) => {
  const accentStyle = accentStyles[accent];
  return (
    <Card
      className={`rounded-2xl border ${accentStyle.ring} bg-[var(--card)] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.25)] ${className ?? ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
        {delta ? (
          <div className={`text-xs font-semibold ${deltaStyles[delta.direction]}`}>{delta.value}</div>
        ) : null}
      </div>
      <div className={`mt-3 flex items-baseline gap-2 text-3xl font-semibold ${accentStyle.text}`}>
        <span>{value}</span>
      </div>
      {subtext ? <div className="mt-2 text-xs text-[var(--muted)]">{subtext}</div> : null}
      <div className="mt-4 h-1 w-10 rounded-full" role="presentation">
        <div className={`h-full w-full rounded-full ${accentStyle.dot}`} />
      </div>
    </Card>
  );
};

export default KpiCard;
