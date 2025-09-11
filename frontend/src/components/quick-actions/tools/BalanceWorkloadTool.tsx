import React, { useEffect, useState } from 'react';
import { darkTheme } from '../../../theme/tokens';
import { assignmentsApi } from '../../../services/api';

interface Props { onClose: () => void }

const BalanceWorkloadTool: React.FC<Props> = () => {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        // Directly fetch suggestions without bulk warming
        const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/assignments/rebalance_suggestions/`);
        const json = await resp.json();
        setSuggestions(json);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: darkTheme.spacing.md }}>
      <div style={{ borderRight: `1px solid ${darkTheme.colors.border.secondary}`, paddingRight: darkTheme.spacing.md }}>
        <div style={{ color: darkTheme.colors.text.secondary, marginBottom: darkTheme.spacing.sm }}>Parameters</div>
        <div style={{ fontSize: darkTheme.typography.fontSize.sm, color: darkTheme.colors.text.muted }}>
          Horizon: 12 weeks (default). Future controls TBD.
        </div>
      </div>
      <div>
        {loading ? (
          <div style={{ color: darkTheme.colors.text.muted }}>Loading suggestions…</div>
        ) : (
          <div style={{ display: 'grid', gap: darkTheme.spacing.sm }}>
            {suggestions.length === 0 ? (
              <div style={{ color: darkTheme.colors.text.muted }}>No suggestions</div>
            ) : suggestions.map((s: any) => (
              <div key={s.id} style={{
                padding: darkTheme.spacing.sm,
                background: darkTheme.colors.background.tertiary,
                borderRadius: darkTheme.borderRadius.md,
                border: `1px solid ${darkTheme.colors.border.secondary}`
              }}>
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                <div style={{ color: darkTheme.colors.text.secondary }}>{s.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BalanceWorkloadTool;
