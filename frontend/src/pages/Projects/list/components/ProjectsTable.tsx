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
  prevDeliverables?: Map<number, Deliverable | null>;
  onChangeStatus?: (projectId: number, newStatus: string) => void;
  isMobileList?: boolean;
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
  prevDeliverables,
  onChangeStatus,
  isMobileList = false,
}) => {
  const enableVirtual = !isMobileList && getFlag('VIRTUALIZED_GRID', false) && projects.length > 200;
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
  const { parentRef, items, totalSize } = useVirtualRows({ count: projects.length, estimateSize: isMobileList ? 116 : 44, overscan: 6, enableVirtual });
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

  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const toggleExpanded = (projectId?: number | null) => {
    if (!projectId) return;
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const header = (
    <div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-xs text-[var(--muted)] font-medium border-b border-[var(--border)] bg-[var(--card)]">
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
      <div className="col-span-2 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('lastDue')}>
        LAST DELIVERABLE<SortIcon column="lastDue" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-2 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('nextDue')}>
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
        const prevDeliverable = (project.id != null && typeof project.id === 'number' && prevDeliverables)
          ? prevDeliverables.get(project.id)
          : null;
        const nextTopRaw = nextDeliverable ? `${nextDeliverable.percentage != null ? `${nextDeliverable.percentage}% ` : ''}${nextDeliverable.description || ''}`.trim() : '';
        const nextTop = nextTopRaw || '-';
        const parseLocal = (s: string) => new Date((s || '').slice(0,10) + 'T00:00:00');
        const nextDate = nextDeliverable?.date ? parseLocal(nextDeliverable.date) : null;
        const nextBottom = nextDate ? nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const soonLimit = new Date(); soonLimit.setHours(0,0,0,0); const soonEnd = new Date(soonLimit.getTime() + 13*24*60*60*1000);
        const isSoonNext = !!(nextDate && nextDate >= soonLimit && nextDate <= soonEnd);
        const nextTopClass = isSoonNext ? 'text-[#b22222] font-semibold leading-tight' : 'text-[var(--text)] font-medium leading-tight';
        const nextBottomClass = isSoonNext ? 'text-[#b22222] text-xs leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
        const prevTopRaw = prevDeliverable ? `${prevDeliverable.percentage != null ? `${prevDeliverable.percentage}% ` : ''}${prevDeliverable.description || ''}`.trim() : '';
        const prevTop = prevTopRaw || '-';
        const prevBottom = prevDeliverable?.date ? parseLocal(prevDeliverable.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const today = new Date(); today.setHours(0,0,0,0);
        const prevDate = prevDeliverable?.date ? parseLocal(prevDeliverable.date) : null;
        const isRecentPrev = !!(prevDate && prevDate <= today && (today.getTime() - prevDate.getTime()) <= 8*24*60*60*1000);
        // Recent last deliverable: chocolate tint (#d2691e), italic, still smaller than next deliverable
        const prevTopClass = isRecentPrev ? 'text-[#d2691e] text-xs font-semibold italic leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
        const prevBottomClass = isRecentPrev ? 'text-[#d2691e] text-xs italic leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
        return (
          <div
            key={project.id}
            onClick={() => onSelect(project, index)}
            className={`grid grid-cols-12 gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-[var(--surfaceHover)] transition-colors focus:outline-none ${
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
            <div className="col-span-2">
              {prevDeliverable ? (
                <>
                  <div className={prevTopClass}>{prevTop}</div>
                  <div className={prevBottomClass}>{prevBottom || ''}</div>
                </>
              ) : (
                <div className="text-[var(--muted)] text-xs">-</div>
              )}
            </div>
            <div className="col-span-2">
              {nextDeliverable ? (
                <>
                  <div className={nextTopClass}>{nextTop}</div>
                  <div className={nextBottomClass}>{nextBottom || ''}</div>
                </>
              ) : (
                <div className="text-[var(--muted)] text-xs">-</div>
              )}
            </div>
            {showRowBottomDivider && (
              <div className={`col-start-3 col-end-13 h-0 border-b ${dividerBorder} pointer-events-none`} />
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
          const prevDeliverable = (project.id != null && typeof project.id === 'number' && prevDeliverables)
            ? prevDeliverables.get(project.id)
            : null;
          const nextTopRaw = nextDeliverable ? `${nextDeliverable.percentage != null ? `${nextDeliverable.percentage}% ` : ''}${nextDeliverable.description || ''}`.trim() : '';
          const nextTop = nextTopRaw || '-';
          const parseLocal = (s: string) => new Date((s || '').slice(0,10) + 'T00:00:00');
          const nextDate2 = nextDeliverable?.date ? parseLocal(nextDeliverable.date) : null;
          const nextBottom = nextDate2 ? nextDate2.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const soonLimit2 = new Date(); soonLimit2.setHours(0,0,0,0); const soonEnd2 = new Date(soonLimit2.getTime() + 13*24*60*60*1000);
          const isSoonNext2 = !!(nextDate2 && nextDate2 >= soonLimit2 && nextDate2 <= soonEnd2);
          const nextTopClass2 = isSoonNext2 ? 'text-[#b22222] font-semibold leading-tight' : 'text-[var(--text)] font-medium leading-tight';
          const nextBottomClass2 = isSoonNext2 ? 'text-[#b22222] text-xs leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
          const prevTopRaw = prevDeliverable ? `${prevDeliverable.percentage != null ? `${prevDeliverable.percentage}% ` : ''}${prevDeliverable.description || ''}`.trim() : '';
          const prevTop = prevTopRaw || '-';
          const prevBottom = prevDeliverable?.date ? parseLocal(prevDeliverable.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const today2 = new Date(); today2.setHours(0,0,0,0);
          const prevDate2 = prevDeliverable?.date ? parseLocal(prevDeliverable.date) : null;
          const isRecentPrev2 = !!(prevDate2 && prevDate2 <= today2 && (today2.getTime() - prevDate2.getTime()) <= 8*24*60*60*1000);
          const prevTopClass2 = isRecentPrev2 ? 'text-[#d2691e] text-xs font-semibold italic leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
          const prevBottomClass2 = isRecentPrev2 ? 'text-[#d2691e] text-xs italic leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
          return (
            <div
              key={project.id}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
              onClick={() => onSelect(project, v.index)}
              className={`grid grid-cols-12 gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-[var(--surfaceHover)] transition-colors focus:outline-none ${
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
              <div className="col-span-2">
                {prevDeliverable ? (
                  <>
                    <div className={prevTopClass2}>{prevTop}</div>
                    <div className={prevBottomClass2}>{prevBottom || ''}</div>
                  </>
                ) : (
                  <div className="text-[var(--muted)] text-xs">-</div>
                )}
              </div>
              <div className="col-span-2">
                {nextDeliverable ? (
                  <>
                    <div className={nextTopClass2}>{nextTop}</div>
                    <div className={nextBottomClass2}>{nextBottom || ''}</div>
                  </>
                ) : (
                  <div className="text-[var(--muted)] text-xs">-</div>
                )}
              </div>
              {(!groupClients || (projects[v.index + 1] && (projects[v.index + 1].client || '') === (project.client || ''))) && (
                <div className={`col-start-3 col-end-13 h-0 border-b ${selectedProjectId === project.id ? 'border-[var(--primary)]' : 'border-[var(--border)]'} pointer-events-none`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderMobileCard = (project: Project, index: number) => {
    const nextDeliverable = project.id != null && nextDeliverables ? nextDeliverables.get(project.id) : null;
    const prevDeliverable = project.id != null && prevDeliverables ? prevDeliverables.get(project.id) : null;
    const formatDate = (dateStr?: string | null) =>
      dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const isExpanded = project.id != null && expandedCards.has(project.id);
    return (
      <div
        key={project.id ?? index}
        className={`p-4 border-b border-[var(--border)] bg-[var(--surface)] ${
          selectedProjectId === project.id ? 'bg-[var(--surfaceOverlay)]' : ''
        }`}
      >
        <button
          type="button"
          className="w-full text-left"
          onClick={() => onSelect(project, index)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                {project.client || 'No Client'}
              </div>
              <div className="text-base font-semibold text-[var(--text)] truncate">
                {project.name}
              </div>
              <div className="text-xs text-[var(--muted)]">{project.projectNumber || '—'}</div>
            </div>
            <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
              <StatusBadge status={(project.status as any) || 'active'} />
              <button
                type="button"
                className="text-[var(--primary)] text-xs font-medium"
                onClick={() => toggleExpanded(project.id)}
              >
                {isExpanded ? 'Hide details' : 'Show details'}
              </button>
            </div>
          </div>
        </button>
        {isExpanded && (
          <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
            <div>
              <div className="font-semibold text-[var(--text)]">Next Deliverable</div>
              <div>{nextDeliverable?.description || '—'}</div>
              <div>{formatDate(nextDeliverable?.date)}</div>
            </div>
            <div>
              <div className="font-semibold text-[var(--text)]">Last Deliverable</div>
              <div>{prevDeliverable?.description || '—'}</div>
              <div>{formatDate(prevDeliverable?.date)}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isMobileList) {
    return (
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
        {projects.map((project, index) => renderMobileCard(project, index))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      {header}
      {loading ? (
        <div className="p-3" />
      ) : enableVirtual ? virtualBody : nonVirtualBody}
    </div>
  );
};

const SortIcon: React.FC<{ column: string; sortBy: string; sortDirection: 'asc' | 'desc' }> = ({ column, sortBy, sortDirection }) => {
  if (sortBy !== column) return null;
  return <span className="ml-1 text-[var(--primary)]">{sortDirection === 'asc' ? '^' : 'v'}</span>;
};

export default ProjectsTable;
