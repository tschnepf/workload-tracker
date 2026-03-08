import React from 'react';
import Card from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { FullCalendarWrapper, mapDeliverableCalendarToEvents, formatDeliverableInlineLabel } from '@/features/fullcalendar';
import type { CalendarRange } from '@/hooks/useDeliverablesCalendar';
import { buildCalendarRange, subtractOneDay, toIsoDate, useDeliverablesCalendar } from '@/hooks/useDeliverablesCalendar';
import { subscribeGridRefresh } from '@/lib/gridRefreshBus';
import { useProjectQuickViewPopover } from '@/components/projects/quickview';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import type { DatesSetArg, EventContentArg, EventClickArg } from '@fullcalendar/core';
import type { DeliverableEventMeta } from '@/features/fullcalendar';

type Props = { className?: string };

const PERSONAL_WEEKS = 8;

const PersonalCalendarWidget: React.FC<Props> = ({ className }) => {
  const auth = useAuth();
  const { state: verticalState } = useVerticalFilter();
  const personId = auth?.person?.id ?? null;
  const [showPre, setShowPre] = React.useState(false);
  const initialRange = React.useMemo<CalendarRange>(() => buildCalendarRange(PERSONAL_WEEKS), []);
  const lastRequestedRangeRef = React.useRef<CalendarRange>(initialRange);
  const [queryRange, setQueryRange] = React.useState<CalendarRange>(initialRange);
  const { data, isLoading, error, refetch } = useDeliverablesCalendar(personId ? queryRange : null, {
    mineOnly: true,
    personId,
    vertical: verticalState.selectedVerticalId ?? undefined,
  });
  const { open } = useProjectQuickViewPopover();

  React.useEffect(() => {
    const unsub = subscribeGridRefresh((payload) => {
      const reason = (payload?.reason || '').toLowerCase();
      if (reason.includes('deliverable') || reason.includes('personal-calendar')) {
        refetch();
      }
    });
    return unsub;
  }, [refetch]);

  const events = React.useMemo(
    () => mapDeliverableCalendarToEvents(data ?? [], { includePreDeliverables: showPre }),
    [data, showPre]
  );
  const personalViews = React.useMemo(
    () => ({
      personalMultiWeek: {
        type: 'dayGrid',
        duration: { weeks: PERSONAL_WEEKS },
      },
    }),
    []
  );
  const responsiveViews = React.useMemo(
    () => ({ mobile: 'listWeek' as const, desktop: 'personalMultiWeek' as const }),
    []
  );
  const eventOrder = React.useMemo(() => ['extendedProps.sortPriority', 'start'], []);

  const handleDatesSet = React.useCallback((arg: DatesSetArg) => {
    const nextRange = {
      start: toIsoDate(arg.start),
      end: toIsoDate(subtractOneDay(arg.end)),
    };
    const prevRange = lastRequestedRangeRef.current;
    if (prevRange.start === nextRange.start && prevRange.end === nextRange.end) {
      return;
    }
    lastRequestedRangeRef.current = nextRange;
    setQueryRange(nextRange);
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
              <li key={`${arg.event.id}-pre-${idx}`} className="truncate">
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
    if (meta?.kind === 'deliverable') {
      const label = formatDeliverableInlineLabel(meta, arg.event.title);
      return (
        <span className="fc-deliverable-line" title={label}>
          {label}
        </span>
      );
    }
    return <span className="text-xs font-semibold truncate">{arg.event.title}</span>;
  }, []);

  const handleEventClick = React.useCallback(
    (evt: EventClickArg) => {
      const meta = evt.event.extendedProps as any;
      const projectId = meta?.projectId ?? meta?.project;
      if (projectId) {
        open(projectId, evt.el as HTMLElement, { placement: 'center' });
      }
    },
    [open]
  );

  return (
    <Card className={`h-full min-h-0 ${className || ''}`}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[var(--text)] font-semibold">My Calendar</div>
            <p className="text-[var(--muted)] text-sm">Milestones and pre-deliverables synced to your assignments</p>
          </div>
          <label className="text-sm text-[var(--color-text-secondary)] inline-flex items-center gap-2">
            <input type="checkbox" checked={showPre} onChange={(e) => setShowPre(e.currentTarget.checked)} />
            Show Pre-Deliverables
          </label>
        </div>

        {!personId ? (
          <div className="text-sm text-[var(--chart-neutral)]">Link your account to a Person to view your calendar.</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <FullCalendarWrapper
              className="h-full min-h-0"
              events={events}
              loading={isLoading}
              emptyState={
                error ? (
                  <div className="text-sm text-[var(--color-state-danger)]">{(error as Error)?.message || 'Failed to load calendar'}</div>
                ) : (
                  <div className="text-sm text-[var(--muted)]">No deliverables scheduled for this window.</div>
                )
              }
              initialDate={initialRange.start}
              initialView="personalMultiWeek"
              responsiveViews={responsiveViews}
              views={personalViews}
              eventContent={renderEventContent}
              onEventClick={handleEventClick}
              onDatesSet={handleDatesSet}
              dayMaxEvents={false}
              eventOrder={eventOrder}
            />
          </div>
        )}
      </div>
    </Card>
  );
};

export default PersonalCalendarWidget;
