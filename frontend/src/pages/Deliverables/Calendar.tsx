import React from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import { assignmentsApi, deliverableAssignmentsApi, peopleApi } from '@/services/api';
import { subscribeGridRefresh } from '@/lib/gridRefreshBus';
import { FullCalendarWrapper, mapDeliverableCalendarToEvents, formatDeliverableInlineLabel } from '@/features/fullcalendar';
import {
  buildCalendarRange,
  clampWeeks,
  subtractOneDay,
  toIsoDate,
  useDeliverablesCalendar,
} from '@/hooks/useDeliverablesCalendar';
import type { CalendarRange } from '@/hooks/useDeliverablesCalendar';
import { useProjectQuickViewPopover } from '@/components/projects/quickview';
import type { DatesSetArg, EventContentArg, EventClickArg } from '@fullcalendar/core';
import type { DeliverableEventMeta } from '@/features/fullcalendar';

const DEFAULT_WEEKS = 8;
const WEEK_OPTIONS = [4, 8, 12];

export const DeliverablesCalendarContent: React.FC = () => {
  const [weeks, setWeeks] = React.useState(DEFAULT_WEEKS);
  const [range, setRange] = React.useState<CalendarRange>(() => buildCalendarRange(DEFAULT_WEEKS));
  const [showPre, setShowPre] = React.useState(false);
  const [personQuery, setPersonQuery] = React.useState('');
  const [personResults, setPersonResults] = React.useState<Array<{ id: number; name: string }>>([]);
  const [selectedPersonIndex, setSelectedPersonIndex] = React.useState(-1);
  const [selectedPerson, setSelectedPerson] = React.useState<{ id: number; name: string } | null>(null);
  const [allowedDeliverableIds, setAllowedDeliverableIds] = React.useState<Set<number> | null>(null);
  const [allowedProjectIds, setAllowedProjectIds] = React.useState<Set<number> | null>(null);
  const [filterLoading, setFilterLoading] = React.useState(false);
  const { open } = useProjectQuickViewPopover();

  const calendarQuery = useDeliverablesCalendar(range, { mineOnly: false });
  const { data, isLoading, error, refetch } = calendarQuery;

  React.useEffect(() => {
    const unsub = subscribeGridRefresh((payload) => {
      if ((payload?.reason || '').toLowerCase().includes('deliverable')) {
        refetch();
      }
    });
    return unsub;
  }, [refetch]);

  useAuthenticatedEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!selectedPerson) {
          setAllowedDeliverableIds(null);
          setAllowedProjectIds(null);
          return;
        }
        setFilterLoading(true);
        const [links, projects] = await Promise.all([
          (async () => {
            try {
              return await deliverableAssignmentsApi.byPerson(selectedPerson.id);
            } catch {
              return [] as any[];
            }
          })(),
          (async () => {
            try {
              return await assignmentsApi.byPerson(selectedPerson.id);
            } catch {
              return [] as any[];
            }
          })(),
        ]);
        if (!active) return;
        const deliverableSet = new Set<number>(
          (links as any[]).map((l: any) => l.deliverable).filter((id: any) => Number.isFinite(id))
        );
        const projectSet = new Set<number>(
          (projects as any[]).map((p: any) => p.project).filter((id: any) => Number.isFinite(id))
        );
        setAllowedDeliverableIds(deliverableSet.size ? deliverableSet : null);
        setAllowedProjectIds(projectSet.size ? projectSet : null);
      } finally {
        if (active) setFilterLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedPerson]);

  const filteredItems = React.useMemo(() => {
    const items = data ?? [];
    if (!selectedPerson) return items;
    if (!allowedDeliverableIds && !allowedProjectIds) return [];
    return items.filter((item) => {
      const projectId = (item as any).project as number | undefined;
      const deliverableId = (item as any).id as number | undefined;
      if (item.itemType === 'pre_deliverable') {
        const parentId = (item as any).parentDeliverableId as number | undefined;
        return (
          (parentId != null && allowedDeliverableIds?.has(parentId)) ||
          (projectId != null && allowedProjectIds?.has(projectId))
        );
      }
      return (
        (deliverableId != null && allowedDeliverableIds?.has(deliverableId)) ||
        (projectId != null && allowedProjectIds?.has(projectId))
      );
    });
  }, [data, selectedPerson, allowedDeliverableIds, allowedProjectIds]);

  const events = React.useMemo(
    () => mapDeliverableCalendarToEvents(filteredItems, { includePreDeliverables: showPre }),
    [filteredItems, showPre]
  );

  const multiWeekView = React.useMemo(
    () => ({
      deliverablesMultiWeek: {
        type: 'dayGrid',
        duration: { weeks: clampWeeks(weeks) },
      },
    }),
    [weeks]
  );

  const handleDatesSet = React.useCallback((arg: DatesSetArg) => {
    const nextRange = {
      start: toIsoDate(arg.start),
      end: toIsoDate(subtractOneDay(arg.end)),
    };
    setRange((prev) => (prev.start === nextRange.start && prev.end === nextRange.end ? prev : nextRange));
  }, []);

  const handleWeeksChange = React.useCallback((value: number) => {
    setWeeks(value);
    setRange((prev) => buildCalendarRange(value, new Date(prev.start)));
  }, []);

  const renderEventContent = React.useCallback((arg: EventContentArg) => {
    const meta = arg.event.extendedProps as DeliverableEventMeta;
    if (meta?.kind === 'pre_deliverable_group') {
      const titles = meta.preDeliverableTitles ?? [];
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-semibold truncate">{meta.projectName || meta.projectClient || arg.event.title}</span>
          <ul className="list-disc pl-4 text-[var(--muted)] space-y-0.5">
            {titles.map((label, idx) => (
              <li key={`${arg.event.id}-group-${idx}`} className="truncate">
                {label}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (meta?.kind === 'pre_deliverable') {
      const subtitle = meta.projectClient || meta.projectName;
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-semibold truncate">{arg.event.title}</span>
          {subtitle ? <span className="text-[var(--muted)] truncate">{subtitle}</span> : null}
        </div>
      );
    }
    const label = formatDeliverableInlineLabel(meta, arg.event.title);
    return (
      <span className="fc-deliverable-line" title={label}>
        {label}
      </span>
    );
  }, []);

  const handleEventClick = React.useCallback(
    (arg: EventClickArg) => {
      const meta = arg.event.extendedProps as any;
      const projectId = meta?.projectId ?? meta?.project ?? null;
      if (projectId) {
        open(projectId, arg.el as HTMLElement, { placement: 'center' });
      }
    },
    [open]
  );

  return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#cccccc]">{`Deliverables Calendar (${weeks} Weeks)`}</h1>
            <p className="text-[#969696] mt-1">Milestones and pre-deliverables with list view on mobile.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <label className="text-sm text-[var(--muted)] whitespace-nowrap">Person Filter</label>
              <div className="relative">
                {selectedPerson ? (
                  <div className="flex items-center gap-2 border rounded px-2 py-1 text-sm bg-[var(--card)] border-[var(--border)] text-[var(--text)]">
                    <span>{selectedPerson.name}</span>
                    <button
                      className="text-[var(--muted)] hover:text-[var(--text)]"
                      onClick={() => {
                        setSelectedPerson(null);
                        setPersonQuery('');
                        setPersonResults([]);
                        setSelectedPersonIndex(-1);
                      }}
                      title="Clear person filter"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      className="w-56 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-sm px-2 py-1"
                      placeholder="Type a name…"
                      value={personQuery}
                      onChange={async (e) => {
                        const q = e.currentTarget.value;
                        setPersonQuery(q);
                        if (!q || q.trim().length === 0) {
                          setPersonResults([]);
                          setSelectedPersonIndex(-1);
                          return;
                        }
                        try {
                          const res = await peopleApi.autocomplete(q, 20);
                          setPersonResults(res || []);
                          setSelectedPersonIndex(res && res.length > 0 ? 0 : -1);
                        } catch {
                          setPersonResults([]);
                          setSelectedPersonIndex(-1);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSelectedPersonIndex((idx) => Math.min(idx + 1, personResults.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSelectedPersonIndex((idx) => Math.max(idx - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          const pick = selectedPersonIndex >= 0 ? personResults[selectedPersonIndex] : null;
                          if (pick) {
                            setSelectedPerson(pick);
                            setPersonResults([]);
                          }
                        }
                      }}
                    />
                    {personResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-56 max-h-64 overflow-auto border border-[var(--border)] bg-[var(--card)] rounded shadow">
                        {personResults.map((p, idx) => (
                          <div
                            key={p.id}
                            className={`px-2 py-1 text-sm cursor-pointer ${
                              idx === selectedPersonIndex
                                ? 'bg-[var(--cardHover)] text-[var(--text)]'
                                : 'text-[var(--muted)] hover:bg-[var(--cardHover)] hover:text-[var(--text)]'
                            }`}
                            onMouseEnter={() => setSelectedPersonIndex(idx)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedPerson(p);
                              setPersonResults([]);
                            }}
                          >
                            {p.name}
                          </div>
                        ))}
                        {filterLoading && <div className="px-2 py-1 text-xs text-[var(--muted)]">Loading…</div>}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
              <input type="checkbox" checked={showPre} onChange={(e) => setShowPre(e.currentTarget.checked)} />
              Show Pre-Deliverables
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--muted)]">Weeks:</span>
              {WEEK_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => handleWeeksChange(option)}
                  className={`px-2 py-0.5 rounded ${
                    weeks === option
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                  aria-pressed={weeks === option}
                >
                  {option}w
                </button>
              ))}
            </div>
          </div>
        </div>

        <Card className="bg-[var(--card)] border-[var(--border)] p-4">
          <FullCalendarWrapper
            className="min-h-[640px]"
            events={events}
            loading={isLoading}
            emptyState={
              error ? (
                <div className="text-sm text-[#fca5a5]">{(error as Error)?.message || 'Failed to load calendar'}</div>
              ) : (
                <div className="text-sm text-[var(--muted)]">No milestones scheduled for this window.</div>
              )
            }
            initialDate={range.start}
            initialView="deliverablesMultiWeek"
            responsiveViews={{ mobile: 'listWeek', desktop: 'deliverablesMultiWeek' }}
            views={multiWeekView}
            eventContent={renderEventContent}
            onEventClick={handleEventClick}
            onDatesSet={handleDatesSet}
            dayMaxEvents={false}
            eventOrder={['extendedProps.sortPriority', 'start']}
          />
        </Card>
      </div>
  );
};

const DeliverablesCalendarPage: React.FC = () => (
  <Layout>
    <DeliverablesCalendarContent />
  </Layout>
);

export default DeliverablesCalendarPage;
