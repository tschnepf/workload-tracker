import React, { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { apiClient, authHeaders } from '@/api/client';
import InlineAlert from '@/components/ui/InlineAlert';
import PanelHeader from '@/components/ui/PanelHeader';

interface Props { onClose: () => void }

const BalanceWorkloadTool: React.FC<Props> = () => {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useAuthenticatedEffect(() => {
    const run = async () => {
      try {
        // Directly fetch suggestions without bulk warming
        const res = await apiClient.GET('/assignments/rebalance_suggestions/' as any, { headers: authHeaders() });
        setSuggestions((res as any).data || []);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_2fr]">
      <div className="space-y-2 border-b border-[var(--color-border)] pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <PanelHeader title="Parameters" />
        <div className="text-sm text-[var(--color-text-secondary)]">
          Horizon: 12 weeks (default). Future controls TBD.
        </div>
      </div>
      <div>
        {loading ? (
          <InlineAlert tone="info">Loading suggestions...</InlineAlert>
        ) : (
          <div className="grid gap-3">
            {suggestions.length === 0 ? (
              <InlineAlert tone="info">No suggestions</InlineAlert>
            ) : suggestions.map((s: any) => (
              <div
                key={s.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div className="font-semibold text-[var(--color-text-primary)]">{s.title}</div>
                <div className="text-[var(--color-text-secondary)]">{s.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BalanceWorkloadTool;
