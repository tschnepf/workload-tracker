import React, { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { darkTheme } from '../../../theme/tokens';
import { peopleApi } from '../../../services/api';
import UtilizationBadge from '../../ui/UtilizationBadge';

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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: darkTheme.spacing.md }}>
      <div style={{ borderRight: `1px solid ${darkTheme.colors.border.secondary}`, paddingRight: darkTheme.spacing.md }}>
        <div style={{ color: darkTheme.colors.text.secondary, marginBottom: darkTheme.spacing.sm }}>Filters</div>
        <div style={{ display: 'grid', gap: darkTheme.spacing.xs }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: darkTheme.colors.text.muted }}>
            <span>Skills (comma-separated)</span>
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="e.g., lighting, hvac"
              style={{ padding: '6px 8px', background: darkTheme.colors.background.tertiary, color: darkTheme.colors.text.primary, border: `1px solid ${darkTheme.colors.border.secondary}`, borderRadius: 4 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: darkTheme.colors.text.muted }}>
            <span>Min available hours</span>
            <input
              type="number"
              min={0}
              step={1}
              value={minAvail}
              onChange={(e) => setMinAvail(Number(e.target.value) || 0)}
              style={{ padding: '6px 8px', width: 110, background: darkTheme.colors.background.tertiary, color: darkTheme.colors.text.primary, border: `1px solid ${darkTheme.colors.border.secondary}`, borderRadius: 4 }}
            />
          </label>
        </div>
      </div>
      <div>
        {loading ? (
          <div style={{ color: darkTheme.colors.text.muted }}>Loading people…</div>
        ) : (
          <div style={{ display: 'grid', gap: darkTheme.spacing.sm }}>
            {people.map((p) => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: darkTheme.spacing.sm,
                background: darkTheme.colors.background.tertiary,
                borderRadius: darkTheme.borderRadius.md,
                border: `1px solid ${darkTheme.colors.border.secondary}`
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ color: darkTheme.colors.text.muted, fontSize: darkTheme.typography.fontSize.sm }}>
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
