import React, { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { resolveApiBase } from '@/utils/apiBase';
import { getAccessToken } from '@/utils/auth';

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
      const base = resolveApiBase((import.meta as any)?.env?.VITE_API_URL as string | undefined);
      const resp = await fetch(`${base}/deliverables/personal_pre_deliverables/?days_ahead=14`, { headers: { 'Authorization': `Bearer ${getAccessToken()}` } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setItems(data || []);
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
      const base = resolveApiBase((import.meta as any)?.env?.VITE_API_URL as string | undefined);
      const resp = await fetch(`${base}/deliverables/pre_deliverable_items/${id}/complete/`, { method: 'POST', headers: { 'Authorization': `Bearer ${getAccessToken()}` } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to complete');
    }
  };

  return (
    <Card className={`bg-[#2d2d30] border-[#3e3e42] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[#cccccc] font-semibold">My Upcoming Pre-Deliverables</div>
          <div className="text-xs text-[#94a3b8]">{items.length}</div>
        </div>
        {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
        {loading ? (
          <div className="text-[#969696]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-[#969696]">No upcoming items</div>
        ) : (
          <div className="space-y-2">
            {items.map(it => (
              <div key={it.id} className={`flex items-center justify-between px-3 py-2 rounded ${it.isOverdue ? 'bg-red-500/10 border border-red-500/30' : 'bg-[#1f1f24] border border-[#3e3e42]'}`}>
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

