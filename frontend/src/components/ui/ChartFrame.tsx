import React from 'react';
import EmptyState from '@/components/ui/EmptyState';
import InlineAlert from '@/components/ui/InlineAlert';
import Skeleton from '@/components/ui/Skeleton';

interface ChartFrameProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  legend?: React.ReactNode;
  rightSlot?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  className?: string;
  children: React.ReactNode;
}

const ChartFrame: React.FC<ChartFrameProps> = ({
  title,
  subtitle,
  legend,
  rightSlot,
  loading = false,
  error = null,
  empty = false,
  emptyTitle = 'No data available',
  emptyMessage,
  className = '',
  children,
}) => {
  return (
    <section className={`rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          {subtitle ? <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{subtitle}</div> : null}
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
      {legend ? <div className="mb-3">{legend}</div> : null}

      {loading ? <Skeleton rows={5} className="h-4 mb-3" /> : null}
      {!loading && error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {!loading && !error && empty ? <EmptyState title={emptyTitle} message={emptyMessage} className="min-h-[160px]" /> : null}
      {!loading && !error && !empty ? children : null}
    </section>
  );
};

export default ChartFrame;
