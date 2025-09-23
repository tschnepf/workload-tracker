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

const MySummaryCard: React.FC<{ summary: Summary; alerts: Alerts } & { className?: string }> = ({ summary, alerts, className }) => {
  return (
    <Card className={`bg-[#2d2d30] border-[#3e3e42] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[#cccccc]">My Summary</h3>
          <div className="text-xs text-[#94a3b8]">Week {summary.currentWeekKey}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-[#cccccc]"><div className="text-[#94a3b8]">Utilization</div>{summary.utilizationPercent}%</div>
          <div className="text-[#cccccc]"><div className="text-[#94a3b8]">Allocated</div>{summary.allocatedHours}h</div>
          <div className="text-[#cccccc]"><div className="text-[#94a3b8]">Available</div>{summary.availableHours}h</div>
          <div className="text-[#cccccc]"><div className="text-[#94a3b8]">Overdue Pre‑Items</div>{alerts.overduePreItems}</div>
        </div>
        <div className="mt-3 text-xs text-[#94a3b8]">
          {alerts.overallocatedNextWeek && <div>Heads up: next week looks overallocated.</div>}
          {alerts.underutilizedNext4Weeks && <div>Opportunity: underutilized over the next 4 weeks.</div>}
        </div>
      </div>
    </Card>
  );
};

export default MySummaryCard;

