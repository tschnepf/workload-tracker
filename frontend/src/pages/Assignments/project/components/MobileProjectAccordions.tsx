import React from 'react';
import { Link } from 'react-router';
import type { Assignment, Project } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';
import { useProjectDetailsDrawer } from '@/components/projects/detailsDrawer';

type ProjectWithAssignments = Project & { assignments?: Assignment[]; isExpanded?: boolean };

type Props = {
  projects: ProjectWithAssignments[];
  weeks: WeekHeader[];
  hoursByProject: Record<number, Record<string, number>>;
  onExpand?: (projectId: number) => void;
  onAssignmentPress?: (projectId: number, assignmentId: number) => void;
  onAddAssignment?: (projectId: number) => void;
  activeAddProjectId?: number | null;
  hasMoreAssignmentsByProject?: Record<number, boolean>;
  loadingMoreByProject?: Set<number>;
  onLoadMoreAssignments?: (projectId: number) => void;
  canEditAssignments?: boolean;
  canManageAssignmentLifecycle?: boolean;
};

const MAX_WEEKS_IN_SPARK = 6;

const MobileProjectAccordions: React.FC<Props> = ({
  projects,
  weeks,
  hoursByProject,
  onExpand,
  onAssignmentPress,
  onAddAssignment,
  activeAddProjectId,
  hasMoreAssignmentsByProject,
  loadingMoreByProject,
  onLoadMoreAssignments,
  canEditAssignments = true,
  canManageAssignmentLifecycle = true,
}) => {
  const { open: openProjectDetails } = useProjectDetailsDrawer();
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const sparkWeeks = React.useMemo(() => weeks.slice(0, MAX_WEEKS_IN_SPARK), [weeks]);

  const toggle = (projectId: number) => {
    setExpanded((prev) => (prev === projectId ? null : projectId));
    if (expanded !== projectId) onExpand?.(projectId);
  };

  return (
    <div className="space-y-3">
      {projects.map((project) => {
        if (!project?.id) return null;
        const isOpen = expanded === project.id;
        const weekTotals = sparkWeeks.map((week) => hoursByProject?.[project.id!]?.[week.date] ?? 0);
        const maxHour = Math.max(...weekTotals, 1);
        const assignments = project.assignments || [];
        const hasMore = hasMoreAssignmentsByProject?.[project.id!] ?? false;
        const isLoadingMore = loadingMoreByProject?.has(project.id!) ?? false;
        return (
          <div key={project.id} className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                className="flex-1 min-w-0 flex items-center justify-between"
                onClick={() => toggle(project.id!)}
                aria-expanded={isOpen}
              >
                <div className="text-left min-w-0">
                  <div className="text-base font-semibold text-[var(--text)] truncate">{project.name}</div>
                  {project.client ? (
                    <div className="text-xs text-[var(--muted)] truncate">{project.client}</div>
                  ) : null}
                </div>
                <div className="flex items-end gap-1 pl-2">
                  {weekTotals.map((value, idx) => {
                    const height = Math.max(6, Math.round((value / maxHour) * 36));
                    return (
                      <div
                        key={`${project.id}-spark-${idx}`}
                        className="w-2 rounded-full transition-all bg-[var(--primary)]"
                        style={{ height }}
                        title={`${sparkWeeks[idx]?.display || ''}: ${value}h`}
                      />
                    );
                  })}
                </div>
              </button>
              <button
                type="button"
                className="shrink-0 inline-flex items-center justify-center w-[22px] h-[22px] rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)]"
                onClick={() => openProjectDetails(project.id!)}
                aria-label="Open project details"
                title="Open project details"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
                </svg>
              </button>
              <Link
                to={`/projects/${project.id}/dashboard`}
                className="shrink-0 inline-flex items-center justify-center w-[22px] h-[22px] rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)]"
                aria-label="Open project dashboard"
                title="Open project dashboard"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="3" y="4" width="7" height="7" rx="1.2" />
                  <rect x="14" y="4" width="7" height="7" rx="1.2" />
                  <rect x="3" y="15" width="18" height="5" rx="1.2" />
                </svg>
              </Link>
            </div>
            {isOpen ? (
              <div className="px-4 pb-4 space-y-3 text-sm text-[var(--text)]">
                {assignments.length === 0 ? (
                  <div className="text-[var(--muted)]">No assignments loaded for this project.</div>
                ) : (
                  <ul className="space-y-2">
                    {assignments.map((assignment) => (
                      <li key={assignment.id}>
                        <button
                          type="button"
                          className={`w-full text-left flex flex-col rounded border border-[var(--border)] p-3 bg-[var(--surface)] transition-colors ${canEditAssignments ? 'hover:border-[var(--primary)]' : 'opacity-60 cursor-not-allowed'}`}
                          onClick={() => canEditAssignments && onAssignmentPress?.(project.id!, assignment.id!)}
                          aria-disabled={!canEditAssignments}
                        >
                          <span className="font-medium">{assignment.personName || 'Placeholder'}</span>
                          <span className="text-xs text-[var(--muted)]">
                            {assignment.roleName || 'Unassigned role'}
                          </span>
                          <span className="text-xs text-[var(--muted)]">
                            Current week: {assignment.weeklyHours?.[weeks[0]?.date] ?? 0}h
                          </span>
                          {!canEditAssignments && (
                            <span className="text-[10px] text-[var(--muted)] mt-1">Editing disabled for your role</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {hasMore ? (
                  <button
                    type="button"
                    className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:opacity-60"
                    onClick={() => onLoadMoreAssignments?.(project.id!)}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? 'Loading...' : 'Load more assignments'}
                  </button>
                ) : null}
                <div className="pt-2">
                  <button
                    type="button"
                    className={`w-full rounded border border-dashed px-3 py-2 text-sm ${
                      canManageAssignmentLifecycle ? 'text-[var(--primary)] hover:bg-[var(--surfaceHover)]' : 'text-[var(--muted)] opacity-60 cursor-not-allowed'
                    }`}
                    onClick={() => canManageAssignmentLifecycle && onAddAssignment?.(project.id!)}
                    disabled={!canManageAssignmentLifecycle}
                  >
                    {activeAddProjectId === project.id ? 'Choose a person or role...' : 'Add Assignment'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default MobileProjectAccordions;
