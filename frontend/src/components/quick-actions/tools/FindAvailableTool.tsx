import React, { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { peopleApi } from '../../../services/api';
import UtilizationBadge from '../../ui/UtilizationBadge';
import Input from '@/components/ui/Input';
import PanelHeader from '@/components/ui/PanelHeader';
import InlineAlert from '@/components/ui/InlineAlert';

interface Props { onClose: () => void }

const FindAvailableTool: React.FC<Props> = () => {
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<string>('');
  const [minAvail, setMinAvail] = useState<number>(0);

  useAuthenticatedEffect(() => {
    const run = async () => {
      try {
        // Compute current Monday (canonical week)
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const week = monday.toISOString().split('T')[0];
        const items = await peopleApi.findAvailable(
          skills.trim() ? skills.split(',').map(s => s.trim()) : undefined,
          { week, limit: 100, minAvailableHours: minAvail }
        );
        setPeople(items || []);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [skills, minAvail]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_2fr]">
      <div className="space-y-3 border-b border-[var(--color-border)] pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <PanelHeader title="Filters" />
        <div className="grid gap-2">
          <Input
            label="Skills (comma-separated)"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="e.g., lighting, hvac"
          />
          <Input
            label="Min available hours"
            type="number"
            min={0}
            step={1}
            value={minAvail}
            onChange={(e) => setMinAvail(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      <div>
        {loading ? (
          <InlineAlert tone="info">Loading people...</InlineAlert>
        ) : (
          <div className="grid gap-3">
            {people.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div>
                  <div className="font-semibold text-[var(--color-text-primary)]">{p.name}</div>
                  <div className="text-sm text-[var(--color-text-secondary)]">
                    Available: {(p.availableHours ?? 0)}h · Utilization: {(p.utilizationPercent ?? 0)}%
                  </div>
                </div>
                <UtilizationBadge percentage={p.utilizationPercent ?? 0} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FindAvailableTool;
