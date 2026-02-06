import React from 'react';
import Card from '@/components/ui/Card';
import { Link } from 'react-router';

export type AlertTone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

const toneClasses: Record<AlertTone, string> = {
  danger: 'bg-red-500/15 text-red-300 border-red-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  info: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  neutral: 'bg-[var(--surface)] text-[var(--muted)] border-[var(--border)]',
};

export interface PersonAlertItem {
  id: number | string;
  name: string;
  role?: string | null;
  statusLabel: string;
  tone: AlertTone;
  utilizationPercent?: number;
  assigned?: number;
  capacity?: number;
}

export interface PersonAlertFilter {
  key: string;
  label: string;
  predicate: (item: PersonAlertItem) => boolean;
}

interface PersonAlertListProps {
  title: string;
  items: PersonAlertItem[];
  viewAllHref?: string;
  maxItems?: number;
  filters?: PersonAlertFilter[];
  defaultFilterKey?: string;
  loading?: boolean;
  emptyLabel?: string;
  className?: string;
}

const PersonAlertList: React.FC<PersonAlertListProps> = ({
  title,
  items,
  viewAllHref,
  maxItems = 6,
  filters = [],
  defaultFilterKey,
  loading = false,
  emptyLabel = 'No matching team members.',
  className,
}) => {
  const initialFilter = defaultFilterKey ?? filters[0]?.key;
  const [activeFilter, setActiveFilter] = React.useState(initialFilter);

  const filteredItems = React.useMemo(() => {
    if (!filters.length || !activeFilter) return items;
    const rule = filters.find((filter) => filter.key === activeFilter);
    return rule ? items.filter(rule.predicate) : items;
  }, [items, filters, activeFilter]);

  const visibleItems = filteredItems.slice(0, maxItems);

  return (
    <Card className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.25)] ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
        <div className="flex items-center gap-2">
          {filters.length > 0 ? (
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
            >
              {filters.map((filter) => (
                <option key={filter.key} value={filter.key}>
                  {filter.label}
                </option>
              ))}
            </select>
          ) : null}
          {viewAllHref ? (
            <Link to={viewAllHref} className="text-xs text-[var(--primary)] hover:underline">
              View all
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="text-sm text-[var(--muted)]">Loading...</div>
        ) : visibleItems.length === 0 ? (
          <div className="text-sm text-[var(--muted)]">{emptyLabel}</div>
        ) : (
          visibleItems.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--text)]">{item.name}</div>
                {item.role ? <div className="text-xs text-[var(--muted)] truncate">{item.role}</div> : null}
                {item.assigned != null && item.capacity != null ? (
                  <div className="text-xs text-[var(--muted)]">
                    {Math.round(item.assigned)}h / {Math.round(item.capacity)}h
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${toneClasses[item.tone]}`}>
                  {item.statusLabel}
                </span>
                {typeof item.utilizationPercent === 'number' ? (
                  <span className="text-xs text-[var(--muted)]">{item.utilizationPercent}%</span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};

export default PersonAlertList;
