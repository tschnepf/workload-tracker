import React from 'react';
import type { Project } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';
import StatusBadge from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import ProjectNameQuickViewButton from '@/pages/Assignments/projectAssignments/components/ProjectNameQuickViewButton';
import type { DeliverableMarker, ProjectWithAssignments } from '@/pages/Assignments/projectAssignments/types';

const EMPTY_MARKERS: DeliverableMarker[] = [];

type ProjectTotalsCellProps = {
  hours: number;
  entries: DeliverableMarker[];
  typeColors: Record<string, string>;
  tooltip?: string;
};

const ProjectTotalsCell: React.FC<ProjectTotalsCellProps> = React.memo(({ hours, entries, typeColors, tooltip }) => {
  return (
    <div
      className="relative py-2 flex items-center justify-center text-[var(--text)] text-xs font-medium border-l border-[var(--border)]"
      title={tooltip}
    >
      {hours > 0 ? hours : ''}
      {entries.length > 0 && (
        <div className="absolute right-0 top-1 bottom-1 flex items-stretch gap-0.5 pr-[2px]">
          {entries.slice(0, 3).map((e, idx) => (
            <div key={idx} className="w-[3px] rounded" style={{ background: typeColors[e.type] || 'var(--primary)' }} />
          ))}
        </div>
      )}
    </div>
  );
});

ProjectTotalsCell.displayName = 'ProjectTotalsCell';

export type ProjectSummaryRowProps = {
  project: ProjectWithAssignments;
  weeks: WeekHeader[];
  gridTemplate: string;
  hoursByWeek: Record<string, number>;
  deliverablesByWeek: Record<string, DeliverableMarker[]>;
  deliverableTooltipsByWeek: Record<string, string>;
  typeColors: Record<string, string>;
  isStatusDropdownOpen: boolean;
  onToggleStatusDropdown: (projectId: number) => void;
  onCloseStatusDropdown: () => void;
  onStatusSelect: (projectId: number, status: Project['status']) => void;
  isUpdating: boolean;
  onToggleExpanded: (project: ProjectWithAssignments) => void;
  onAddPersonClick: (projectId: number) => void;
};

const ProjectSummaryRow: React.FC<ProjectSummaryRowProps> = React.memo(({
  project,
  weeks,
  gridTemplate,
  hoursByWeek,
  deliverablesByWeek,
  deliverableTooltipsByWeek,
  typeColors,
  isStatusDropdownOpen,
  onToggleStatusDropdown,
  onCloseStatusDropdown,
  onStatusSelect,
  isUpdating,
  onToggleExpanded,
  onAddPersonClick,
}) => {
  return (
    <div
      className="grid items-stretch gap-px p-2 hover:bg-[var(--surfaceHover)] transition-colors cursor-pointer"
      style={{ gridTemplateColumns: gridTemplate }}
      onClick={(e) => {
        e.preventDefault();
        void onToggleExpanded(project);
      }}
      role="button"
      aria-expanded={project.isExpanded}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
          e.preventDefault();
          void onToggleExpanded(project);
        }
      }}
    >
      <div className="pl-4 pr-2 py-2 text-[var(--text)] text-sm flex items-center gap-2 truncate" title={project.client || ''}>
        <svg
          className={`w-3 h-3 transition-transform ${project.isExpanded ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"
        >
          <path d="M8 5l8 7-8 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="truncate">{project.client || ''}</span>
      </div>
      <div className="pr-2 py-2 text-[var(--text)] text-sm flex items-center" title={project.name}>
        <div className="min-w-0 truncate">
          {project.id ? (
            <ProjectNameQuickViewButton projectId={project.id}>{project.name}</ProjectNameQuickViewButton>
          ) : (
            <span className="truncate">{project.name}</span>
          )}
        </div>
        <div className="relative ml-auto" data-dropdown onClick={(e) => e.stopPropagation()}>
          <StatusBadge
            status={(project.status as any) || 'active'}
            variant="editable"
            onClick={() => project.id && onToggleStatusDropdown(project.id)}
            isUpdating={isUpdating}
          />
          {project.id && (
            <StatusDropdown
              currentStatus={(project.status as any) || 'active'}
              isOpen={isStatusDropdownOpen}
              onSelect={(newStatus) => onStatusSelect(project.id!, newStatus)}
              onClose={onCloseStatusDropdown}
              projectId={project.id}
              disabled={isUpdating}
              closeOnSelect={false}
            />
          )}
        </div>
      </div>
      <div className="py-2 flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          className="w-7 h-7 flex items-center justify-center text-[var(--text)] hover:text-[var(--text)] hover:bg-[var(--cardHover)] rounded"
          onClick={() => { if (project.id) onAddPersonClick(project.id); }}
          title="Add assignment"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {weeks.map((w) => {
        const hours = hoursByWeek[w.date] || 0;
        const entries = deliverablesByWeek[w.date] ?? EMPTY_MARKERS;
        const tooltip = deliverableTooltipsByWeek[w.date];
        return (
          <ProjectTotalsCell
            key={w.date}
            hours={hours}
            entries={entries}
            typeColors={typeColors}
            tooltip={tooltip}
          />
        );
      })}
    </div>
  );
});

ProjectSummaryRow.displayName = 'ProjectSummaryRow';

export default ProjectSummaryRow;
