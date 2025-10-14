import React, { useEffect, useMemo, useState } from 'react';
import type { Project, Deliverable } from '@/types/models';
import StatusBadge, { formatStatus, editableStatusOptions, getStatusColor } from '@/components/projects/StatusBadge';
import { getFlag } from '@/lib/flags';
import { useVirtualRows } from '../hooks/useVirtualRows';

interface Props {
  projects: Project[];
  selectedProjectId: number | null;
  onSelect: (p: Project, index: number) => void;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  loading?: boolean;
  nextDeliverables?: Map<number, Deliverable | null>;
  onChangeStatus?: (projectId: number, newStatus: string) => void;
}

const ProjectsTable: React.FC<Props> = ({
  projects,
  selectedProjectId,
  onSelect,
  sortBy,
  sortDirection,
  onSort,
  loading,
  nextDeliverables,
  onChangeStatus,
}) => {
  const enableVirtual = getFlag('VIRTUALIZED_GRID', false) && projects.length > 200;
  const { parentRef, items, totalSize } = useVirtualRows({ count: projects.length, estimateSize: 44, overscan: 6, enableVirtual });
  const groupClients = sortBy === 'client';
  const [openStatusFor, setOpenStatusFor] = useState<number | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('.status-dropdown-container')) return;
      if (openStatusFor != null) setOpenStatusFor(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openStatusFor]);

  const header = (
    <div className="grid grid-cols-11 gap-2 px-2 py-1.5 text-xs text-[var(--muted)] font-medium border-b border-[var(--border)] bg-[var(--card)]">
      <div className="col-span-2 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('client')}>
        CLIENT<SortIcon column="client" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-3 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('name')}>
        PROJECT<SortIcon column="name" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-1 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('number')}>
        NUMBER<SortIcon column="number" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-2 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('status')}>
        STATUS<SortIcon column="status" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-3 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('nextDue')}>
        NEXT DELIVERABLE<SortIcon column="nextDue" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
    </div>
  );

  const nonVirtualBody = (
    <div className="overflow-y-auto h-full">
      {projects.map((project, index) => {
        const prev = index > 0 ? projects[index - 1] : null;
        const next = index < projects.length - 1 ? projects[index + 1] : null;
        const sameClientAsPrev = groupClients && prev && (prev.client || '') === (project.client || '');
        const sameClientAsNext = groupClients && next && (next.client || '') === (project.client || '');
        const isGroupStart = groupClients && !sameClientAsPrev && index !== 0;
        const showRowBottomDivider = !groupClients || sameClientAsNext; // hide at end of client group
        const dividerBorder = selectedProjectId === project.id ? 'border-[var(--primary)]' : 'border-[var(--border)]';
        const nextDeliverable = (project.id != null && typeof project.id === 'number' && nextDeliverables)
          ? nextDeliverables.get(project.id)
          : null;
        const nextTop = nextDeliverable ? `${nextDeliverable.percentage != null ? `${nextDeliverable.percentage}% ` : ''}${nextDeliverable.description || ''}`.trim() : '';
        const nextBottom = nextDeliverable?.date ? new Date(nextDeliverable.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        return (
          <div
            key={project.id}
            onClick={() => onSelect(project, index)}
            className={`grid grid-cols-11 gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-[var(--surfaceHover)] transition-colors focus:outline-none ${
              selectedProjectId === project.id ? 'bg-[var(--surfaceOverlay)]' : ''
            } ${isGroupStart ? 'border-t border-[var(--border)]' : ''}`}
            tabIndex={0}
          >
            <div className="col-span-2 text-[var(--muted)] text-xs">
              {sameClientAsPrev ? '' : (project.client || 'No Client')}
            </div>
            <div className="col-span-3">
              <div className="text-[var(--text)] font-medium leading-tight">{project.name}</div>
            </div>
            <div className="col-span-1 text-[var(--muted)] text-xs">{project.projectNumber ?? ''}</div>
            <div className="col-span-2 relative status-dropdown-container" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`${getStatusColor(project.status || '')} hover:bg-[var(--surfaceHover)] px-1 py-0.5 rounded text-xs transition-colors cursor-pointer flex items-center gap-1`}
                onClick={() => setOpenStatusFor(openStatusFor === project.id ? null : (project.id as number))}
              >
                {formatStatus(project.status || '')}
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6,9 12,15 18,9" />
                </svg>
              </button>
              {openStatusFor === project.id && (
                <div className="absolute top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg z-50 min-w-[140px]">
                  {editableStatusOptions.map((status) => (
                    <button
                      key={status}
                      onClick={(e) => { e.stopPropagation(); onChangeStatus?.(project.id!, status); setOpenStatusFor(null); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--cardHover)] transition-colors first:rounded-t last:rounded-b ${
                        project.status === status ? 'bg-[var(--surfaceOverlay)]' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <StatusBadge status={status} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="col-span-3">
              {nextDeliverable ? (
                <>
                  <div className="text-[var(--text)] font-medium leading-tight">{nextTop || '—'}</div>
                  <div className="text-[var(--muted)] text-xs leading-tight">{nextBottom || ''}</div>
                </>
              ) : (
                <div className="text-[var(--muted)] text-xs">—</div>
              )}
            </div>
            {/* Row divider shifted to exclude client column */}
            {showRowBottomDivider && (
              <div className={`col-start-3 col-end-12 h-0 border-b ${dividerBorder} pointer-events-none`} />
            )}
          </div>
        );
      })}
    </div>
  );

  const virtualBody = (
    <div ref={parentRef} className="overflow-y-auto h-full relative">
      <div style={{ height: totalSize, position: 'relative' }}>
        {items.map((v) => {
          const project = projects[v.index];
          if (!project) return null;
          const prev = v.index > 0 ? projects[v.index - 1] : null;
          const sameClientAsPrev = groupClients && prev && (prev.client || '') === (project.client || '');
          const nextDeliverable = (project.id != null && typeof project.id === 'number' && nextDeliverables)
            ? nextDeliverables.get(project.id)
            : null;
          const nextTop = nextDeliverable ? `${nextDeliverable.percentage != null ? `${nextDeliverable.percentage}% ` : ''}${nextDeliverable.description || ''}`.trim() : '';
          const nextBottom = nextDeliverable?.date ? new Date(nextDeliverable.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          return (
            <div
              key={project.id}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
              onClick={() => onSelect(project, v.index)}
              className={`grid grid-cols-11 gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-[var(--surfaceHover)] transition-colors focus:outline-none ${
                selectedProjectId === project.id ? 'bg-[var(--surfaceOverlay)]' : ''
              } ${groupClients && v.index !== 0 && (!prev || (prev.client || '') !== (project.client || '')) ? 'border-t border-[var(--border)]' : ''}`}
              tabIndex={0}
            >
              <div className="col-span-2 text-[var(--muted)] text-xs">{sameClientAsPrev ? '' : (project.client || 'No Client')}</div>
              <div className="col-span-3">
                <div className="text-[var(--text)] font-medium leading-tight">{project.name}</div>
              </div>
              <div className="col-span-1 text-[var(--muted)] text-xs">{project.projectNumber ?? ''}</div>
              <div className="col-span-2 relative status-dropdown-container" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`${getStatusColor(project.status || '')} hover:bg-[var(--surfaceHover)] px-1 py-0.5 rounded text-xs transition-colors cursor-pointer flex items-center gap-1`}
                  onClick={() => setOpenStatusFor(openStatusFor === project.id ? null : (project.id as number))}
                >
                  {formatStatus(project.status || '')}
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6,9 12,15 18,9" />
                  </svg>
                </button>
                {openStatusFor === project.id && (
                  <div className="absolute top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg z-50 min-w-[140px]">
                    {editableStatusOptions.map((status) => (
                      <button
                        key={status}
                        onClick={(e) => { e.stopPropagation(); onChangeStatus?.(project.id!, status); setOpenStatusFor(null); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--cardHover)] transition-colors first:rounded-t last:rounded-b ${
                          project.status === status ? 'bg-[var(--surfaceOverlay)]' : ''
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <StatusBadge status={status} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-3">
                {nextDeliverable ? (
                  <>
                    <div className="text-[var(--text)] font-medium leading-tight">{nextTop || '—'}</div>
                    <div className="text-[var(--muted)] text-xs leading-tight">{nextBottom || ''}</div>
                  </>
                ) : (
                  <div className="text-[var(--muted)] text-xs">—</div>
                )}
              </div>
              {(!groupClients || (projects[v.index + 1] && (projects[v.index + 1].client || '') === (project.client || ''))) && (
                <div className={`col-start-3 col-end-12 h-0 border-b ${selectedProjectId === project.id ? 'border-[var(--primary)]' : 'border-[var(--border)]'} pointer-events-none`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-hidden">
      {header}
      {loading ? (
        <div className="p-3">
          {/* consumer provides skeletons; keep minimal here */}
        </div>
      ) : enableVirtual ? virtualBody : nonVirtualBody}
    </div>
  );
};

const SortIcon: React.FC<{ column: string; sortBy: string; sortDirection: 'asc' | 'desc' }> = ({ column, sortBy, sortDirection }) => {
  if (sortBy !== column) return null;
  return <span className="ml-1 text-[var(--primary)]">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
};

export default ProjectsTable;
