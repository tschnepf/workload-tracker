import React from 'react';
import Card from '@/components/ui/Card';
import { Link } from 'react-router';
import { useProjectQuickViewPopover } from '@/components/projects/quickview';
import { useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/services/api';
import { allStatusOptions, formatStatus, getStatusColor } from '@/components/projects/status.utils';

export type ProjectItem = { id: number; name: string | null; client?: string | null; status?: string | null; nextDeliverableDate?: string | null };

const MyProjectsCard: React.FC<{ projects: ProjectItem[]; className?: string }> = ({ projects, className }) => {
  // Status filter (default: Active + Active CA)
  const [selected, setSelected] = React.useState<string[]>(['active', 'active_ca']);
  const toggle = (s: string) => setSelected(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  // Sort alphabetically by client name (nulls last), then by project name
  const sorted = [...projects].sort((a, b) => {
    const ca = (a.client || '').toLowerCase();
    const cb = (b.client || '').toLowerCase();
    if (ca && !cb) return -1;
    if (!ca && cb) return 1;
    if (ca !== cb) return ca.localeCompare(cb, undefined, { sensitivity: 'base' });
    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
  });

  const filtered = selected.length > 0
    ? sorted.filter(p => selected.includes((p.status || '').toLowerCase()))
    : sorted;

  const groupedByClient = React.useMemo(() => {
    const m = new Map<string, ProjectItem[]>();
    for (const project of filtered) {
      const key = (project.client || 'Unassigned Client').trim() || 'Unassigned Client';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(project);
    }
    return m;
  }, [filtered]);

  const { open } = useProjectQuickViewPopover();
  const queryClient = useQueryClient();
  const prefetchTimerRef = React.useRef<number | null>(null);

  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--text)]">My Projects</h3>
          <div className="text-xs text-[#94a3b8]">{filtered.length}</div>
        </div>
        {/* Status filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={() => setSelected([])}
            className={`px-2 py-0.5 rounded text-xs border ${selected.length === 0 ? 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)]' : 'bg-transparent border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface)]/50'}`}
            title="Show all projects"
            aria-pressed={selected.length === 0}
          >
            Show All
          </button>
          {allStatusOptions.map((s) => (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={`px-2 py-0.5 rounded text-xs border ${selected.includes(s) ? 'bg-[var(--surface)] border-[var(--border)]' : 'bg-transparent border-[var(--border)]'} ${getStatusColor(s)}`}
              aria-pressed={selected.includes(s)}
              title={`Filter by ${formatStatus(s)}`}
            >
              {formatStatus(s)}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="text-[var(--muted)] text-sm">No projects match the selected status</div>
        ) : (
          <ul className="space-y-4 text-sm">
            {Array.from(groupedByClient.entries()).map(([clientName, clientProjects]) => (
              <li key={clientName} className="space-y-2">
                <div className="text-xs font-semibold uppercase text-[#94a3b8] tracking-wide">{clientName}</div>
                <ul className="space-y-1">
                  {clientProjects.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 pl-4">
                      <div className="text-[var(--text)] min-w-0 flex-1">
                        {p.id ? (
                          <button
                            type="button"
                            className="hover:underline truncate"
                            onClick={(e) => { e.preventDefault(); open(p.id!, e.currentTarget as HTMLElement, { placement: 'center' }); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p.id!, e.currentTarget as HTMLElement, { placement: 'center' }); } }}
                            onMouseEnter={() => {
                              if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
                              prefetchTimerRef.current = window.setTimeout(() => {
                                queryClient.ensureQueryData({ queryKey: ['projects', p.id!], queryFn: () => projectsApi.get(p.id!) });
                              }, 150);
                            }}
                            onMouseLeave={() => { if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current); }}
                            onFocus={() => {
                              if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
                              prefetchTimerRef.current = window.setTimeout(() => {
                                queryClient.ensureQueryData({ queryKey: ['projects', p.id!], queryFn: () => projectsApi.get(p.id!) });
                              }, 150);
                            }}
                            onBlur={() => { if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current); }}
                          >
                            {p.name || `Project ${p.id}`}
                          </button>
                        ) : (
                          <span className="truncate">{p.name || `Project ${p.id}`}</span>
                        )}
                      </div>
                      <div className={`text-xs whitespace-nowrap ${getStatusColor(p.status || '')}`}>{formatStatus(p.status || '')}</div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default MyProjectsCard;
