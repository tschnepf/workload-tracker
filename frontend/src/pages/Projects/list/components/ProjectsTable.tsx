import React, { useEffect, useState } from 'react';
import type { Project, Deliverable } from '@/types/models';
import StatusBadge, { getStatusColor, formatStatus } from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useDropdownManager } from '@/components/projects/useDropdownManager';
import { useProjectStatus } from '@/components/projects/useProjectStatus';
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
  const statusDropdown = useDropdownManager<string>();
  const projectStatus = useProjectStatus({
    onSuccess: (pid, newStatus) => {
      onChangeStatus?.(pid, newStatus);
    },
    getCurrentStatus: (pid) => {
      const p = projects.find(x => x.id === pid);
      return (p?.status as any) || 'active';
    }
  });
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
        const showRowBottomDivider = !groupClients || sameClientAsNext;
        const dividerBorder = selectedProjectId === project.id ? 'border-[var(--primary)]' : 'border-[var(--border)]';
        const nextDeliverable = (project.id != null && typeof project.id === 'number' && nextDeliverables)
          ? nextDeliverables.get(project.id)
          : null;
        const nextTopRaw = nextDeliverable ? `${nextDeliverable.percentage != null ? `${nextDeliverable.percentage}% ` : ''}${nextDeliverable.description || ''}`.trim() : '';
        const nextTop = nextTopRaw || '-';
        const parseLocal = (s: string) => new Date((s || '').slice(0,10) + 'T00:00:00');
        const nextBottom = nextDeliverable?.date ? parseLocal(nextDeliverable.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
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
            <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
              <div className="relative" data-dropdown>
                <button
                  type="button"
                  className={`${getStatusColor(project.status || '')} whitespace-nowrap text-xs inline-flex items-center gap-1 px-1 py-0.5 rounded hover:text-[var(--text)]`}
                  onClick={() => project.id && statusDropdown.toggle(String(project.id))}
                  aria-haspopup="listbox"
                  aria-expanded={statusDropdown.isOpen(String(project.id))}
                >
                  {formatStatus(project.status || '')}
                  <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {project.id && (
                  <StatusDropdown
                    currentStatus={(project.status as any) || 'active'}
                    isOpen={statusDropdown.isOpen(String(project.id))}
                    onSelect={async (newStatus) => {
                      if (!project.id) return;
                      try {
                        await projectStatus.updateStatus(project.id, newStatus);
                        statusDropdown.close();
                      } catch {}
                    }}
                    onClose={statusDropdown.close}
                    projectId={project.id}
                    disabled={projectStatus.isUpdating(project.id)}
                    closeOnSelect={false}
                  />
                )}
              </div>
            </div>
            <div className="col-span-3">
              {nextDeliverable ? (
                <>
                  <div className="text-[var(--text)] font-medium leading-tight">{nextTop}</div>
                  <div className="text-[var(--muted)] text-xs leading-tight">{nextBottom || ''}</div>
                </>
              ) : (
                <div className="text-[var(--muted)] text-xs">-</div>
              )}
            </div>
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
          const nextTopRaw = nextDeliverable ? `${nextDeliverable.percentage != null ? `${nextDeliverable.percentage}% ` : ''}${nextDeliverable.description || ''}`.trim() : '';
          const nextTop = nextTopRaw || '-';
          const parseLocal = (s: string) => new Date((s || '').slice(0,10) + 'T00:00:00');
          const nextBottom = nextDeliverable?.date ? parseLocal(nextDeliverable.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
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
              <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
                <div className="relative" data-dropdown>
                  <button
                    type="button"
                    className={`${getStatusColor(project.status || '')} whitespace-nowrap text-xs inline-flex items-center gap-1 px-1 py-0.5 rounded hover:text-[var(--text)]`}
                    onClick={() => project.id && statusDropdown.toggle(String(project.id))}
                    aria-haspopup="listbox"
                    aria-expanded={statusDropdown.isOpen(String(project.id))}
                  >
                    {formatStatus(project.status || '')}
                    <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {project.id && (
                    <StatusDropdown
                      currentStatus={(project.status as any) || 'active'}
                      isOpen={statusDropdown.isOpen(String(project.id))}
                      onSelect={async (newStatus) => {
                        if (!project.id) return;
                        try {
                          await projectStatus.updateStatus(project.id, newStatus);
                          statusDropdown.close();
                        } catch {}
                      }}
                      onClose={statusDropdown.close}
                      projectId={project.id}
                      disabled={projectStatus.isUpdating(project.id)}
                      closeOnSelect={false}
                    />
                  )}
                </div>
              </div>
              <div className="col-span-3">
                {nextDeliverable ? (
                  <>
                    <div className="text-[var(--text)] font-medium leading-tight">{nextTop}</div>
                    <div className="text-[var(--muted)] text-xs leading-tight">{nextBottom || ''}</div>
                  </>
                ) : (
                  <div className="text-[var(--muted)] text-xs">-</div>
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
  return <span className="ml-1 text-[var(--primary)]">{sortDirection === 'asc' ? '^' : 'v'}</span>;
};

export default ProjectsTable;
