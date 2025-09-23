import React from 'react';
import Card from '@/components/ui/Card';
import { Link } from 'react-router';

export type ProjectItem = { id: number; name: string | null; client?: string | null; nextDeliverableDate?: string | null };

const MyProjectsCard: React.FC<{ projects: ProjectItem[]; className?: string }> = ({ projects, className }) => {
  const top = projects.slice(0, 5);
  return (
    <Card className={`bg-[#2d2d30] border-[#3e3e42] ${className || ''}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[#cccccc]">My Projects</h3>
          <div className="text-xs text-[#94a3b8]">{projects.length}</div>
        </div>
        {top.length === 0 ? (
          <div className="text-[#969696] text-sm">No active projects</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {top.map(p => (
              <li key={p.id} className="flex items-center justify-between">
                <div className="text-[#cccccc]"><Link to={`/projects/${p.id}/edit`} className="hover:underline">{p.name || `Project ${p.id}`}</Link>{p.client ? <span className="text-[#94a3b8]"> · {p.client}</span> : null}</div>
                <div className="text-[#94a3b8]">{p.nextDeliverableDate || '—'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};

export default MyProjectsCard;

