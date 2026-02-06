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
  const [range, setRange] = React.useState<CalendarRange>(() => buildCalendarRange(PERSONAL_WEEKS));
  const { data, isLoading, error, refetch } = useDeliverablesCalendar(personId ? range : null, {
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

  const handleDatesSet = React.useCallback((arg: DatesSetArg) => {
    const nextRange = {
      start: toIsoDate(arg.start),
      end: toIsoDate(subtractOneDay(arg.end)),
    };
    setRange((prev) => (prev.start === nextRange.start && prev.end === nextRange.end ? prev : nextRange));
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
    <Card className={className}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3 sticky top-0 bg-[var(--card)] z-10">
        <div>
          <div className="text-[var(--text)] font-semibold">My Calendar</div>
          <p className="text-[var(--muted)] text-sm">Milestones and pre-deliverables synced to your assignments</p>
        </div>
        <label className="text-sm text-[#cbd5e1] inline-flex items-center gap-2">
          <input type="checkbox" checked={showPre} onChange={(e) => setShowPre(e.currentTarget.checked)} />
          Show Pre-Deliverables
        </label>
      </div>

      {!personId ? (
        <div className="text-sm text-[#94a3b8]">Link your account to a Person to view your calendar.</div>
      ) : (
        <FullCalendarWrapper
          className="min-h-[320px]"
          events={events}
          loading={isLoading}
          emptyState={
            error ? (
              <div className="text-sm text-[#fca5a5]">{(error as Error)?.message || 'Failed to load calendar'}</div>
            ) : (
              <div className="text-sm text-[var(--muted)]">No deliverables scheduled for this window.</div>
            )
          }
          initialDate={range.start}
          initialView="personalMultiWeek"
          responsiveViews={{ mobile: 'listWeek', desktop: 'personalMultiWeek' }}
          views={personalViews}
          validRange={{ start: range.start }}
          eventContent={renderEventContent}
          onEventClick={handleEventClick}
          onDatesSet={handleDatesSet}
          dayMaxEvents={false}
          eventOrder={['extendedProps.sortPriority', 'start']}
        />
      )}
    </Card>
  );
};

export default PersonalCalendarWidget;
