import React from 'react';
import Card from '@/components/ui/Card';

export type Summary = {
  personId: number;
  currentWeekKey: string;
  utilizationPercent: number;
  allocatedHours: number;
  availableHours: number;
};

export type Alerts = {
  overallocatedNextWeek: boolean;
  underutilizedNext4Weeks: boolean;
  overduePreItems: number;
};

type Props = {
  summary: Summary;
  alerts: Alerts;
  className?: string;
  compact?: boolean;
};

const MySummaryCard: React.FC<Props> = ({ summary, alerts, className, compact = false }) => {
  const metricsGridClass = compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4';
  const headingClass = compact ? 'text-base' : 'text-lg';

  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] ${className || ''}`}>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className={`${headingClass} font-semibold text-[var(--text)]`}>My Summary</h3>
          <div className="text-xs text-[var(--chart-neutral)]">Week {summary.currentWeekKey}</div>
        </div>
        <div className={`grid ${metricsGridClass} gap-4 text-sm`}>
          <div className="text-[var(--text)]"><div className="text-[var(--chart-neutral)]">Utilization</div>{summary.utilizationPercent}%</div>
          <div className="text-[var(--text)]"><div className="text-[var(--chart-neutral)]">Allocated</div>{summary.allocatedHours}h</div>
          <div className="text-[var(--text)]"><div className="text-[var(--chart-neutral)]">Available</div>{summary.availableHours}h</div>
          <div className="text-[var(--text)]"><div className="text-[var(--chart-neutral)]">Overdue Pre-Items</div>{alerts.overduePreItems}</div>
        </div>
        <div className="mt-3 space-y-1 text-xs text-[var(--chart-neutral)]">
          {alerts.overallocatedNextWeek && <div>Heads up: next week looks overallocated.</div>}
          {alerts.underutilizedNext4Weeks && <div>Opportunity: underutilized over the next 4 weeks.</div>}
        </div>
      </div>
    </Card>
  );
};

export default MySummaryCard;
