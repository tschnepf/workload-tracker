import React from 'react';
import type { Person } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { defaultUtilizationScheme, getUtilizationPill, type UtilizationScheme } from '@/util/utilization';

type PersonWithHours = Person & { assignments?: any[]; isExpanded?: boolean; matchReason?: 'person_name' | 'assignment' | 'both' };

type Props = {
  people: PersonWithHours[];
  weeks: WeekHeader[];
  hoursByPerson: Record<number, Record<string, number>>;
  assignmentCountByPerson?: Record<string, number> | Record<number, number>;
  hasMoreAssignmentsByPerson?: Record<number, boolean>;
  loadingMoreByPerson?: Set<number>;
  onLoadMoreAssignments?: (personId: number) => void;
  onExpand?: (personId: number) => void;
  onAssignmentPress?: (personId: number, assignmentId: number) => void;
  onRemoveAssignment?: (personId: number, assignmentId: number) => void;
  canEditAssignments?: boolean;
  onAddAssignment?: (personId: number) => void;
  activeAddPersonId?: number | null;
  scheme?: UtilizationScheme;
};

const MAX_WEEKS_IN_SPARK = 6;

const MobilePersonAccordions: React.FC<Props> = ({
  people,
  weeks,
  hoursByPerson,
  assignmentCountByPerson,
  hasMoreAssignmentsByPerson,
  loadingMoreByPerson,
  onLoadMoreAssignments,
  onExpand,
  onAssignmentPress,
  onRemoveAssignment,
  canEditAssignments = true,
  onAddAssignment,
  activeAddPersonId,
  scheme,
}) => {
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [openDeleteId, setOpenDeleteId] = React.useState<number | null>(null);
  const sparkWeeks = React.useMemo(() => weeks.slice(0, MAX_WEEKS_IN_SPARK), [weeks]);
  const { data: schemeData } = useUtilizationScheme({ enabled: !scheme });
  const resolvedScheme = scheme || schemeData || defaultUtilizationScheme;
  const touchRef = React.useRef<{ id: number; startX: number; startY: number } | null>(null);
  const recentSwipeRef = React.useRef<number>(0);

  const toggle = (personId: number) => {
    setExpanded((prev) => (prev === personId ? null : personId));
    if (expanded !== personId) onExpand?.(personId);
  };

  const handleTouchStart = (assignmentId: number, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { id: assignmentId, startX: touch.clientX, startY: touch.clientY };
  };

  const handleTouchEnd = (assignmentId: number, e: React.TouchEvent) => {
    const state = touchRef.current;
    touchRef.current = null;
    if (!state || state.id !== assignmentId) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 40) return;
    if (dx < 0) {
      setOpenDeleteId(assignmentId);
    } else {
      setOpenDeleteId(null);
    }
    recentSwipeRef.current = Date.now();
  };

  const handleAssignmentPress = (personId: number, assignmentId: number) => {
    if (openDeleteId === assignmentId) {
      setOpenDeleteId(null);
      return;
    }
    if (Date.now() - recentSwipeRef.current < 350) return;
    onAssignmentPress?.(personId, assignmentId);
  };

  return (
    <div className="space-y-3">
      {people.map((person) => {
        if (!person?.id) return null;
        const isOpen = expanded === person.id;
        const weekHours = sparkWeeks.map((week) => hoursByPerson?.[person.id!]?.[week.date] ?? 0);
        const maxHour = Math.max(...weekHours, person.weeklyCapacity || 0, 1);
        const assignments = person.assignments || [];
        const totalCount = assignmentCountByPerson
          ? (assignmentCountByPerson[person.id] ?? assignmentCountByPerson[String(person.id)])
          : undefined;
        const hasMore = typeof hasMoreAssignmentsByPerson?.[person.id!] === 'boolean'
          ? hasMoreAssignmentsByPerson?.[person.id!]
          : (typeof totalCount === 'number' ? assignments.length < totalCount : false);
        const isLoadingMore = loadingMoreByPerson?.has(person.id!) ?? false;
        return (
          <div key={person.id} className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3"
              onClick={() => toggle(person.id!)}
              aria-expanded={isOpen}
            >
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-[var(--text)]">{person.name}</div>
                  {person.matchReason === 'person_name' ? (
                    <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted)] bg-[var(--surface)]">
                      Matched by name
                    </span>
                  ) : null}
                </div>
                {person.weeklyCapacity ? (
                  <div className="text-xs text-[var(--muted)]">Capacity {person.weeklyCapacity}h</div>
                ) : null}
              </div>
              <div className="flex items-end gap-1">
                {weekHours.map((value, idx) => {
                  const height = Math.max(6, Math.round((value / maxHour) * 36));
                  const pill = getUtilizationPill({
                    hours: value,
                    capacity: person.weeklyCapacity ?? null,
                    scheme: resolvedScheme,
                    output: 'token',
                  });
                  const color = pill.tokens?.bg || 'var(--primary)';
                  return (
                    <div
                      key={`${person.id}-spark-${idx}`}
                      className="w-2 rounded-full transition-all"
                      style={{ height, backgroundColor: color }}
                      title={`${sparkWeeks[idx]?.display || ''}: ${value}h`}
                    />
                  );
                })}
              </div>
            </button>
            {isOpen ? (
              <div className="px-4 pb-4 space-y-3 text-sm text-[var(--text)]">
                {assignments.length === 0 ? (
                  <div className="text-[var(--muted)]">No assignments loaded for this person.</div>
                ) : (
                  <ul className="space-y-2">
                    {assignments.map((assignment) => (
                      <li key={assignment.id}>
                        <div className="relative overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]">
                          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                            <button
                              type="button"
                              className="w-20 h-9 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-500 disabled:opacity-60"
                              onClick={() => onRemoveAssignment?.(person.id!, assignment.id!)}
                              disabled={!canEditAssignments}
                            >
                              Delete
                            </button>
                          </div>
                          <button
                            type="button"
                            className={`w-full text-left flex flex-col rounded border border-transparent p-3 bg-[var(--surface)] transition-transform ${openDeleteId === assignment.id ? '-translate-x-20' : 'translate-x-0'} ${canEditAssignments ? 'hover:border-[var(--primary)]' : 'opacity-60 cursor-not-allowed'}`}
                            onClick={() => canEditAssignments && handleAssignmentPress(person.id!, assignment.id!)}
                            onTouchStart={(e) => handleTouchStart(assignment.id!, e)}
                            onTouchEnd={(e) => handleTouchEnd(assignment.id!, e)}
                            aria-disabled={!canEditAssignments}
                          >
                            <span className="font-medium">{assignment.projectDisplayName || `Project ${assignment.project}`}</span>
                            <span className="text-xs text-[var(--muted)]">
                              Current week: {assignment.weeklyHours?.[weeks[0]?.date] ?? 0}h
                            </span>
                            {!canEditAssignments && (
                              <span className="text-[10px] text-[var(--muted)] mt-1">Editing disabled for your role</span>
                            )}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {hasMore ? (
                  <button
                    type="button"
                    className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:opacity-60"
                    onClick={() => onLoadMoreAssignments?.(person.id!)}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore
                      ? 'Loading...'
                      : (typeof totalCount === 'number'
                        ? `Load more assignments (${assignments.length}/${totalCount})`
                        : 'Load more assignments')}
                  </button>
                ) : null}
                <div className="pt-2">
                  <button
                    type="button"
                    className={`w-full rounded border border-dashed px-3 py-2 text-sm ${
                      canEditAssignments ? 'text-[var(--primary)] hover:bg-[var(--surfaceHover)]' : 'text-[var(--muted)] opacity-60 cursor-not-allowed'
                    }`}
                    onClick={() => canEditAssignments && onAddAssignment?.(person.id!)}
                    disabled={!canEditAssignments}
                  >
                    {activeAddPersonId === person.id ? 'Choose a project...' : 'Add Assignment'}
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

export default MobilePersonAccordions;
