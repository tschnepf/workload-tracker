import React from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
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
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useSearchTokens } from '@/hooks/useSearchTokens';
import SearchTokenBar from '@/components/filters/SearchTokenBar';
import { useDeliverablesSearchIndex } from '@/hooks/useDeliverablesSearchIndex';
import type { DatesSetArg, EventContentArg, EventClickArg } from '@fullcalendar/core';
import type { DeliverableEventMeta } from '@/features/fullcalendar';

const DEFAULT_WEEKS = 8;
const WEEK_OPTIONS = [4, 8, 12];

export const DeliverablesCalendarContent: React.FC = () => {
  const [weeks, setWeeks] = React.useState(DEFAULT_WEEKS);
  const [range, setRange] = React.useState<CalendarRange>(() => buildCalendarRange(DEFAULT_WEEKS));
  const [showPre, setShowPre] = React.useState(false);
  const {
    searchInput,
    setSearchInput,
    searchTokens,
    searchOp,
    activeTokenId,
    setActiveTokenId,
    normalizedSearchTokens,
    removeSearchToken,
    handleSearchOpChange,
    handleSearchKeyDown,
    matchesTokensText,
  } = useSearchTokens();
  const { open } = useProjectQuickViewPopover();
  const { state: verticalState } = useVerticalFilter();

  const calendarQuery = useDeliverablesCalendar(range, { mineOnly: false, vertical: verticalState.selectedVerticalId ?? undefined });
  const { data, isLoading, error, refetch } = calendarQuery;
  const searchTokensActive = normalizedSearchTokens.length > 0;
  const searchIndexQuery = useDeliverablesSearchIndex(data ?? [], {
    enabled: searchTokensActive,
    vertical: verticalState.selectedVerticalId ?? undefined,
  });
  const searchIndex = searchIndexQuery.data;

  React.useEffect(() => {
    const unsub = subscribeGridRefresh((payload) => {
      if ((payload?.reason || '').toLowerCase().includes('deliverable')) {
        refetch();
      }
    });
    return unsub;
  }, [refetch]);

  const filteredItems = React.useMemo(() => {
    const items = data ?? [];
    if (!searchTokensActive) return items;
    return items.filter((item) => {
      const projectId = (item as any)?.project as number | undefined;
      const people = projectId != null ? Array.from(searchIndex?.projectPeople.get(projectId) ?? []) : [];
      const departments = projectId != null ? Array.from(searchIndex?.projectDepartments.get(projectId) ?? []) : [];
      const haystack = [
        (item as any)?.title,
        (item as any)?.projectName,
        (item as any)?.projectClient,
        (item as any)?.preDeliverableType,
        ...people,
        ...departments,
      ]
        .filter(Boolean)
        .join(' ');
      return matchesTokensText(haystack);
    });
  }, [
    data,
    searchTokensActive,
    searchIndex?.projectPeople,
    searchIndex?.projectDepartments,
    matchesTokensText,
  ]);

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
            <div className="w-full sm:w-auto min-w-[280px]">
              <SearchTokenBar
                id="deliverables-calendar-search"
                label="Search deliverables"
                placeholder={searchTokens.length ? 'Add another filter...' : 'Search people, projects, clients, or departments (Enter)'}
                tokens={searchTokens}
                activeTokenId={activeTokenId}
                searchOp={searchOp}
                searchInput={searchInput}
                onInputChange={(value) => { setSearchInput(value); setActiveTokenId(null); }}
                onInputKeyDown={handleSearchKeyDown}
                onTokenSelect={setActiveTokenId}
                onTokenRemove={removeSearchToken}
                onSearchOpChange={handleSearchOpChange}
              />
              {searchTokensActive && searchIndexQuery.isLoading ? (
                <div className="text-[10px] text-[var(--muted)] mt-1">Loading search data…</div>
              ) : null}
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
