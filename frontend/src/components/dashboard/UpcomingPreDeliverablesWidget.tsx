import React, { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { authHeaders, apiClient } from '@/api/client';
import { showToast } from '@/lib/toastBus';

type Item = {
  id: number;
  generatedDate: string;
  preDeliverableType?: string;
  parentDeliverable?: { id: number; description?: string | null; date?: string | null };
  project?: number;
  projectName?: string | null;
  projectClient?: string | null;
  isCompleted: boolean;
  isOverdue?: boolean;
  notes?: string | null;
};

const UpcomingPreDeliverablesWidget: React.FC<{ className?: string }> = ({ className }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const today = new Date();
      const end = new Date();
      end.setDate(today.getDate() + 14);
      const startStr = today.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const res = await apiClient.GET('/deliverables/pre_deliverable_items/' as any, {
        params: { query: { mine_only: 1, start: startStr, end: endStr, page_size: 100 } },
        headers: authHeaders(),
      });
      if ((res as any).error) throw (res as any).error;
      const payload: any = (res as any).data;
      const list: any[] = Array.isArray(payload) ? payload : ((payload && payload.results) || []);
      const data = list.map((it: any) => ({
        ...it,
        preDeliverableType: it.preDeliverableType ?? it.typeName,
      }));
      setItems(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load pre-deliverables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const markComplete = async (id: number) => {
    try {
      const res = await apiClient.POST('/deliverables/pre_deliverable_items/{id}/complete/' as any, {
        params: { path: { id } },
        headers: authHeaders(),
      });
      if ((res as any).error) throw (res as any).error;
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to complete', 'error');
    }
  };

  return (
    <Card className={`bg-[var(--color-surface-elevated)] border-[var(--color-border)] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[var(--color-text-primary)] font-semibold">My Upcoming Pre-Deliverables</div>
          <div className="text-xs text-[#94a3b8]">{items.length}</div>
        </div>
        {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
        {loading ? (
          <div className="text-[var(--color-text-secondary)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-[var(--color-text-secondary)]">No upcoming items</div>
        ) : (
          <div className="space-y-2">
            {items.map(it => (
              <div key={it.id} className={`flex items-center justify-between px-3 py-2 rounded ${it.isOverdue ? 'bg-red-500/10 border border-red-500/30' : 'bg-[#1f1f24] border border-[var(--color-border)]'}`}>
                <div className="text-sm text-[#e5e7eb]">
                  <div className="font-medium">{it.preDeliverableType || 'Pre-Deliverable'}{it.parentDeliverable?.description ? ` – ${it.parentDeliverable.description}` : ''}</div>
                  <div className="text-[#94a3b8] text-xs">Due {it.generatedDate}{it.projectName ? ` • ${it.projectName}` : ''}{it.projectClient ? ` • ${it.projectClient}` : ''}</div>
                </div>
                {!it.isCompleted && (
                  <Button onClick={() => markComplete(it.id)} size="sm">Complete</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default UpcomingPreDeliverablesWidget;
