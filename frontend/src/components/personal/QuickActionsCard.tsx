import React from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type Props = {
  onOpenAssignments: () => void;
  onOpenCalendar: () => void;
  onCompleteDueToday: () => void;
  className?: string;
};

const QuickActionsCard: React.FC<Props> = ({ onOpenAssignments, onOpenCalendar, onCompleteDueToday, className }) => {
  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--text)]">Quick Actions</h3>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" onClick={onOpenAssignments}>Open Assignments (me)</Button>
          <Button size="sm" onClick={onOpenCalendar}>Open Calendar (mine)</Button>
          <Button size="sm" onClick={onCompleteDueToday}>Complete due‑today pre‑items</Button>
        </div>
      </div>
    </Card>
  );
};

export default QuickActionsCard;

