import React, { useEffect, useState } from 'react';
import { darkTheme } from '../../../theme/tokens';
import { peopleApi } from '../../../services/api';
import UtilizationBadge from '../../ui/UtilizationBadge';

interface Props { onClose: () => void }

const FindAvailableTool: React.FC<Props> = () => {
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const page = await peopleApi.list({ page: 1, page_size: 100 });
        setPeople(page.results || []);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: darkTheme.spacing.md }}>
      <div style={{ borderRight: `1px solid ${darkTheme.colors.border.secondary}`, paddingRight: darkTheme.spacing.md }}>
        <div style={{ color: darkTheme.colors.text.secondary, marginBottom: darkTheme.spacing.sm }}>Filters</div>
        <div style={{ fontSize: darkTheme.typography.fontSize.sm, color: darkTheme.colors.text.muted }}>
          Use skills/department filters on dashboard or implement here later.
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
                    Weekly capacity: {p.weeklyCapacity}
                  </div>
                </div>
                <UtilizationBadge percentage={0} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FindAvailableTool;
