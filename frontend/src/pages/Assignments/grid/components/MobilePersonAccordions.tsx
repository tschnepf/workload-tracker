import React from 'react';
import type { Person } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { defaultUtilizationScheme, getUtilizationPill, type UtilizationScheme } from '@/util/utilization';

type PersonWithHours = Person & { assignments?: any[]; isExpanded?: boolean };

type Props = {
  people: PersonWithHours[];
  weeks: WeekHeader[];
  hoursByPerson: Record<number, Record<string, number>>;
  onExpand?: (personId: number) => void;
  onAssignmentPress?: (personId: number, assignmentId: number) => void;
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
  onExpand,
  onAssignmentPress,
  canEditAssignments = true,
  onAddAssignment,
  activeAddPersonId,
}) => {
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const sparkWeeks = React.useMemo(() => weeks.slice(0, MAX_WEEKS_IN_SPARK), [weeks]);
  const { data: schemeData } = useUtilizationScheme({ enabled: !scheme });
  const resolvedScheme = scheme || schemeData || defaultUtilizationScheme;

  const toggle = (personId: number) => {
    setExpanded((prev) => (prev === personId ? null : personId));
    if (expanded !== personId) onExpand?.(personId);
  };

  return (
    <div className="space-y-3">
      {people.map((person) => {
        if (!person?.id) return null;
        const isOpen = expanded === person.id;
        const weekHours = sparkWeeks.map((week) => hoursByPerson?.[person.id!]?.[week.date] ?? 0);
        const maxHour = Math.max(...weekHours, person.weeklyCapacity || 0, 1);
        return (
          <div key={person.id} className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3"
              onClick={() => toggle(person.id!)}
              aria-expanded={isOpen}
            >
              <div className="text-left">
                <div className="text-base font-semibold text-[var(--text)]">{person.name}</div>
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
                {(person.assignments || []).length === 0 ? (
                  <div className="text-[var(--muted)]">No assignments loaded for this person.</div>
                ) : (
                  <ul className="space-y-2">
                    {person.assignments!.map((assignment) => (
                      <li key={assignment.id}>
                        <button
                          type="button"
                          className={`w-full text-left flex flex-col rounded border border-[var(--border)] p-3 bg-[var(--surface)] transition-colors ${canEditAssignments ? 'hover:border-[var(--primary)]' : 'opacity-60 cursor-not-allowed'}`}
                          onClick={() => canEditAssignments && onAssignmentPress?.(person.id!, assignment.id!)}
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
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pt-2">
                  <button
                    type="button"
                    className={`w-full rounded border border-dashed px-3 py-2 text-sm ${
                      canEditAssignments ? 'text-[var(--primary)] hover:bg-[var(--surfaceHover)]' : 'text-[var(--muted)] opacity-60 cursor-not-allowed'
                    }`}
                    onClick={() => canEditAssignments && onAddAssignment?.(person.id!)}
                    disabled={!canEditAssignments}
                  >
                    {activeAddPersonId === person.id ? 'Choose a project…' : 'Add Assignment'}
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
