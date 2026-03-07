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
          <div className="text-xs text-[#94a3b8]">Week {summary.currentWeekKey}</div>
        </div>
        <div className={`grid ${metricsGridClass} gap-4 text-sm`}>
          <div className="text-[var(--text)]"><div className="text-[#94a3b8]">Utilization</div>{summary.utilizationPercent}%</div>
          <div className="text-[var(--text)]"><div className="text-[#94a3b8]">Allocated</div>{summary.allocatedHours}h</div>
          <div className="text-[var(--text)]"><div className="text-[#94a3b8]">Available</div>{summary.availableHours}h</div>
          <div className="text-[var(--text)]"><div className="text-[#94a3b8]">Overdue Pre-Items</div>{alerts.overduePreItems}</div>
        </div>
        <div className="mt-3 space-y-1 text-xs text-[#94a3b8]">
          {alerts.overallocatedNextWeek && <div>Heads up: next week looks overallocated.</div>}
          {alerts.underutilizedNext4Weeks && <div>Opportunity: underutilized over the next 4 weeks.</div>}
        </div>
      </div>
    </Card>
  );
};

export default MySummaryCard;
