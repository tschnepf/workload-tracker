import React from 'react';
import Card from '@/components/ui/Card';
import { Link } from 'react-router';

export type ProjectItem = { id: number; name: string | null; client?: string | null; nextDeliverableDate?: string | null };

const MyProjectsCard: React.FC<{ projects: ProjectItem[]; className?: string }> = ({ projects, className }) => {
  // Sort alphabetically by client name (nulls last), then by project name
  const sorted = [...projects].sort((a, b) => {
    const ca = (a.client || '').toLowerCase();
    const cb = (b.client || '').toLowerCase();
    if (ca && !cb) return -1;
    if (!ca && cb) return 1;
    if (ca !== cb) return ca.localeCompare(cb, undefined, { sensitivity: 'base' });
    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
  });
  return (
    <Card className={`bg-[#2d2d30] border-[#3e3e42] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[#cccccc]">My Projects</h3>
          <div className="text-xs text-[#94a3b8]">{projects.length}</div>
        </div>
        {sorted.length === 0 ? (
          <div className="text-[#969696] text-sm">No active projects</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {sorted.map(p => (
              <li key={p.id} className="grid grid-cols-[minmax(140px,200px)_1fr] gap-4 items-center">
                <div className="text-[#94a3b8] whitespace-nowrap overflow-hidden text-ellipsis">
                  {p.client || '—'}
                </div>
                <div className="text-[#cccccc]">
                  <Link to={`/projects/${p.id}/edit`} className="hover:underline">
                    {p.name || `Project ${p.id}`}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default MyProjectsCard;
