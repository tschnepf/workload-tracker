import React from 'react';
import { apiClient, authHeaders } from '@/api/client';
import { deliverablesApi } from '@/services/api';
import ProjectPreDeliverableSettings from '@/components/projects/ProjectPreDeliverableSettings';

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

const PreDeliverablesSectionEmbedded: React.FC<{ projectId: number; onChanged?: () => void }>
  = ({ projectId, onChanged }) => {
  const [items, setItems] = React.useState<Item[]>([]);
  const [nextDeliverableId, setNextDeliverableId] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // 1) Determine next deliverable for the project (earliest upcoming by date, prefer not completed)
      try {
        const page = await deliverablesApi.list(projectId, { page_size: 200 } as any);
        const list = (page?.results || []) as any[];
        const today = new Date(); today.setHours(0,0,0,0);
        const withDates = list.filter(d => !!d.date).map(d => ({ id: d.id as number, date: new Date(String(d.date).replace(/-/g,'/')) as Date, isCompleted: !!d.isCompleted }));
        const upcoming = withDates.filter(d => d.date >= today && !d.isCompleted).sort((a,b) => a.date.getTime() - b.date.getTime());
        const fallback = withDates.sort((a,b) => a.date.getTime() - b.date.getTime());
        const chosen = (upcoming[0] || fallback[0]) || null;
        setNextDeliverableId(chosen ? chosen.id : null);
      } catch (e) {
        // If deliverables fail, continue and show no pre-deliverables
        setNextDeliverableId(null);
      }

      // 2) Fetch project-scoped pre-deliverable items with a safe page size
      const res = await apiClient.GET('/deliverables/pre_deliverable_items/' as any, {
        params: { query: { project: projectId as any, page_size: 200 } },
        headers: authHeaders(),
      });
      if ((res as any).error) throw (res as any).error;
      const payload: any = (res as any).data;
      const list: any[] = Array.isArray(payload) ? payload : ((payload && payload.results) || []);
      const data = list.map((it: any) => ({ ...it, preDeliverableType: it.preDeliverableType ?? it.typeName }));
      // Filter by next deliverable id (only those associated with the next deliverable)
      const filtered = nextDeliverableId ? data.filter(d => (d.parentDeliverable && d.parentDeliverable.id === nextDeliverableId)) : [];
      setItems(filtered);
    } catch (e: any) {
      setError(e?.message || 'Failed to load pre-deliverables');
    } finally {
      setLoading(false);
      try { onChanged?.(); } catch {}
    }
  }, [projectId, nextDeliverableId]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-[var(--text)]">Pre-Deliverables</h3>
        <div className="text-xs text-[var(--muted)]">{items.length}</div>
      </div>
      {error && (
        <div className="mb-2 p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs">{error}</div>
      )}
      {loading ? (
        <div className="text-[var(--muted)] text-sm">Loading pre-deliverables...</div>
      ) : items.length === 0 ? (
        <div className="text-[var(--muted)] text-sm">No pre-deliverables for the next deliverable</div>
      ) : (
        <div className="space-y-2">
          {items.map(it => (
            <div key={it.id} className={"px-3 py-2 rounded border bg-[var(--surface)] border-[var(--border)]"}>
              <div className="text-sm text-[var(--text)]">
                <span className="font-medium">{it.preDeliverableType || 'Pre-Deliverable'}</span>
                {it.parentDeliverable?.description ? (
                  <span className="text-[var(--muted)]"> — {it.parentDeliverable.description}</span>
                ) : null}
              </div>
              <div className="text-xs text-[var(--muted)]">
                {it.generatedDate ? `Due ${it.generatedDate}` : ''}
              </div>
              {it.notes && (
                <div className="text-xs mt-1 text-[var(--muted)]">{it.notes}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Project pre-deliverable settings */}
      <div className="mt-4">
        <ProjectPreDeliverableSettings projectId={projectId} />
      </div>
    </div>
  );
};

export default PreDeliverablesSectionEmbedded;
