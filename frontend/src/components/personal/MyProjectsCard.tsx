import React from 'react';
import Card from '@/components/ui/Card';
import { Link } from 'react-router';
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

  return (
    <Card className={`bg-[#2d2d30] border-[#3e3e42] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[#cccccc]">My Projects</h3>
          <div className="text-xs text-[#94a3b8]">{filtered.length}</div>
        </div>
        {/* Status filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          {allStatusOptions.map((s) => (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={`px-2 py-0.5 rounded text-xs border ${selected.includes(s) ? 'bg-[#3e3e42] border-[#3e3e42]' : 'bg-transparent border-[#3e3e42]'} ${getStatusColor(s)}`}
              aria-pressed={selected.includes(s)}
              title={`Filter by ${formatStatus(s)}`}
            >
              {formatStatus(s)}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="text-[#969696] text-sm">No projects match the selected status</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {filtered.map(p => (
              <li key={p.id} className="grid grid-cols-[minmax(140px,200px)_1fr_auto] gap-4 items-center">
                <div className="text-[#94a3b8] whitespace-nowrap overflow-hidden text-ellipsis">{p.client || '—'}</div>
                <div className="text-[#cccccc]"><Link to={`/projects/${p.id}/edit`} className="hover:underline">{p.name || `Project ${p.id}`}</Link></div>
                <div className={`text-xs ${getStatusColor(p.status || '')}`}>{formatStatus(p.status || '')}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default MyProjectsCard;

