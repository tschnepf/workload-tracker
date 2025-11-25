import React from 'react';
import type {
  EventClickArg,
  EventContentArg,
  EventInput,
  PluginDef,
  CalendarOptions,
  DatesSetArg,
  EventMountArg,
} from '@fullcalendar/core';
import './fullcalendar-theme.css';

type FullCalendarComponent = typeof import('@fullcalendar/react').default;

interface LoadedFullCalendar {
  FullCalendar: FullCalendarComponent;
  plugins: PluginDef[];
}

type PluginKey = 'dayGrid' | 'timeGrid' | 'list';
const ALL_PLUGIN_KEYS: PluginKey[] = ['dayGrid', 'timeGrid', 'list'];
const TOOLBAR_IGNORE = new Set(['prev', 'next', 'today', 'title']);

const pluginLoaders: Record<PluginKey, () => Promise<{ default: PluginDef }>> = {
  dayGrid: () => import('@fullcalendar/daygrid'),
  timeGrid: () => import('@fullcalendar/timegrid'),
  list: () => import('@fullcalendar/list'),
};

let fullCalendarReactPromise: Promise<FullCalendarComponent> | null = null;
const pluginPromiseCache = new Map<PluginKey, Promise<PluginDef>>();

export type ResponsiveViewConfig = {
  mobile?: CalendarOptions['initialView'];
  desktop?: CalendarOptions['initialView'];
};

type HeaderToolbarInput = NonNullable<CalendarOptions['headerToolbar']>;

export interface FullCalendarWrapperProps {
  events: EventInput[];
  initialDate?: string | Date;
  initialView?: CalendarOptions['initialView'];
  responsiveViews?: ResponsiveViewConfig;
  toolbar?: HeaderToolbarInput;
  height?: CalendarOptions['height'];
  validRange?: CalendarOptions['validRange'];
  views?: CalendarOptions['views'];
  loading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
  eventContent?: (arg: EventContentArg) => React.ReactNode;
  onEventClick?: (arg: EventClickArg) => void;
  onDatesSet?: (arg: DatesSetArg) => void;
  testId?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  dayMaxEvents?: CalendarOptions['dayMaxEvents'];
  dayMaxEventRows?: CalendarOptions['dayMaxEventRows'];
  eventOrder?: CalendarOptions['eventOrder'];
}

const DEFAULT_TOOLBAR: HeaderToolbarInput = {
  left: 'prev,next today',
  center: 'title',
  right: 'dayGridMonth,timeGridWeek,listWeek',
};

const DEFAULT_RESPONSIVE_VIEWS: ResponsiveViewConfig = {
  mobile: 'listWeek',
  desktop: 'timeGridWeek',
};

function importFullCalendarReact(): Promise<FullCalendarComponent> {
  if (!fullCalendarReactPromise) {
    fullCalendarReactPromise = import('@fullcalendar/react').then((mod) => mod.default);
  }
  return fullCalendarReactPromise;
}

function importPlugin(key: PluginKey): Promise<PluginDef> {
  if (!pluginPromiseCache.has(key)) {
    pluginPromiseCache.set(
      key,
      pluginLoaders[key]().then((mod) => mod.default)
    );
  }
  return pluginPromiseCache.get(key)!;
}

function loadFullCalendar(required: PluginKey[]): Promise<LoadedFullCalendar> {
  const unique = Array.from(new Set(required.length ? required : ALL_PLUGIN_KEYS));
  return Promise.all([importFullCalendarReact(), ...unique.map(importPlugin)]).then(([FullCalendar, ...plugins]) => ({
    FullCalendar,
    plugins,
  }));
}

function useFullCalendar(requiredPluginKeys: PluginKey[]): LoadedFullCalendar | null {
  const [module, setModule] = React.useState<LoadedFullCalendar | null>(null);
  const pluginSignature = requiredPluginKeys.join(',');
  React.useEffect(() => {
    let cancelled = false;
    loadFullCalendar(requiredPluginKeys)
      .then((mod) => {
        if (!cancelled) setModule(mod);
      })
      .catch((err) => {
        console.error('Failed to load FullCalendar', err);
      });
    return () => {
      cancelled = true;
    };
  }, [pluginSignature, requiredPluginKeys]);
  return module;
}

function useMediaQuery(query: string): boolean {
  const getInitial = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  };
  const [matches, setMatches] = React.useState<boolean>(getInitial);
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(query);
    const handler = (evt: MediaQueryListEvent) => setMatches(evt.matches);
    mq.addEventListener('change', handler);
    setMatches(mq.matches);
    return () => {
      mq.removeEventListener('change', handler);
    };
  }, [query]);
  return matches;
}

function pluginKeyFromType(type?: string | null): PluginKey | null {
  if (!type) return null;
  if (type.includes('dayGrid')) return 'dayGrid';
  if (type.includes('timeGrid')) return 'timeGrid';
  if (type.includes('list')) return 'list';
  return null;
}

function collectToolbarViews(section?: string | string[] | null): string[] {
  if (!section) return [];
  const tokens: string[] = [];
  const pushToken = (token: string) => {
    if (!token || TOOLBAR_IGNORE.has(token)) return;
    tokens.push(token);
  };
  if (Array.isArray(section)) {
    section.forEach((token) => pushToken(token));
  } else {
    section
      .split(/[,\s]+/)
      .map((token) => token.trim())
      .forEach((token) => pushToken(token));
  }
  return tokens;
}

function deriveRequiredPlugins(
  initialView?: string,
  responsiveViews?: ResponsiveViewConfig,
  toolbar?: HeaderToolbarInput | false,
  views?: CalendarOptions['views']
): PluginKey[] {
  const normalizedToolbar = typeof toolbar === 'object' && toolbar ? toolbar : undefined;
  const candidateViews = new Set<string>();
  if (initialView) candidateViews.add(initialView);
  if (responsiveViews?.mobile) candidateViews.add(responsiveViews.mobile);
  if (responsiveViews?.desktop) candidateViews.add(responsiveViews.desktop);
  collectToolbarViews(normalizedToolbar?.left ?? null).forEach((view) => candidateViews.add(view));
  collectToolbarViews(normalizedToolbar?.center ?? null).forEach((view) => candidateViews.add(view));
  collectToolbarViews(normalizedToolbar?.right ?? null).forEach((view) => candidateViews.add(view));
  Object.keys(views ?? {}).forEach((view) => candidateViews.add(view));

  const pluginKeys = new Set<PluginKey>();
  candidateViews.forEach((viewName) => {
    const config = views?.[viewName];
    const plugin =
      pluginKeyFromType(typeof config?.type === 'string' ? config.type : viewName) ?? pluginKeyFromType(viewName);
    if (plugin) pluginKeys.add(plugin);
  });

  if (!pluginKeys.size) return ALL_PLUGIN_KEYS;
  return Array.from(pluginKeys).sort();
}

const FullCalendarWrapper: React.FC<FullCalendarWrapperProps> = ({
  events,
  initialDate,
  initialView,
  responsiveViews = DEFAULT_RESPONSIVE_VIEWS,
  toolbar = DEFAULT_TOOLBAR,
  height = 'auto',
  validRange,
  views,
  loading,
  emptyState,
  className,
  eventContent,
  onEventClick,
  onDatesSet,
  testId,
  ariaLabel,
  ariaDescription,
  dayMaxEvents = 3,
  dayMaxEventRows,
  eventOrder,
}) => {
  const toolbarConfig = typeof toolbar === 'object' && toolbar ? toolbar : undefined;
  const toolbarLeft = toolbarConfig?.left ?? null;
  const toolbarCenter = toolbarConfig?.center ?? null;
  const toolbarRight = toolbarConfig?.right ?? null;
  const requiredPluginKeys = React.useMemo(
    () => deriveRequiredPlugins(initialView, responsiveViews, toolbarConfig, views),
    [initialView, responsiveViews, toolbarLeft, toolbarCenter, toolbarRight, views]
  );
  const module = useFullCalendar(requiredPluginKeys);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const generatedDescriptionId = React.useId();
  const descriptionId = ariaDescription ? generatedDescriptionId : undefined;
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const highlightedGroupRef = React.useRef<string | null>(null);
  const clearHighlightTimeoutRef = React.useRef<number | null>(null);
  const politeFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    []
  );
  const cleanupRef = React.useRef(new WeakMap<HTMLElement, () => void>());
  const resolvedView = React.useMemo<CalendarOptions['initialView']>(() => {
    if (isMobile) return responsiveViews.mobile ?? DEFAULT_RESPONSIVE_VIEWS.mobile;
    return initialView ?? responsiveViews.desktop ?? DEFAULT_RESPONSIVE_VIEWS.desktop;
  }, [isMobile, initialView, responsiveViews.desktop, responsiveViews.mobile]);
  const resolvedToolbar = React.useMemo<HeaderToolbarInput | undefined>(() => {
    if (!toolbar) return undefined;
    if (isMobile) {
      return {
        left: toolbar.left ?? 'prev,next',
        center: 'title',
        right: responsiveViews.mobile ? responsiveViews.mobile : 'listWeek',
      };
    }
    return toolbar;
  }, [toolbar, isMobile, responsiveViews.mobile]);

  const isEmpty = !loading && (!events || events.length === 0);

  const getElementGroupIds = (el: HTMLElement | null | undefined): string[] => {
    if (!el) return [];
    const raw = el.dataset?.highlightGroupIds;
    if (!raw) return [];
    return raw.split(',').map((id) => id.trim()).filter(Boolean);
  };

  const applyHighlight = React.useCallback((groupIds: string[] | null) => {
    if (clearHighlightTimeoutRef.current !== null) {
      window.clearTimeout(clearHighlightTimeoutRef.current);
      clearHighlightTimeoutRef.current = null;
    }
    const root = wrapperRef.current;
    if (!root) return;
    const eventEls = root.querySelectorAll<HTMLElement>('.fc-event');
    eventEls.forEach((el) => {
      const hiddenByFilter = el.dataset.hiddenByFilter === 'true';
      const eventGroupIds = el.dataset.highlightGroupIds ? el.dataset.highlightGroupIds.split(',').filter(Boolean) : [];
      const inGroup = groupIds ? groupIds.some((id) => eventGroupIds.includes(id)) : false;
      if (!groupIds || groupIds.length === 0) {
        el.classList.remove('fc-event-dimmed');
        if (hiddenByFilter) {
          el.classList.add('fc-event-pre-hidden');
        }
        return;
      }
      if (inGroup) {
        el.classList.remove('fc-event-dimmed');
        if (hiddenByFilter) {
          el.classList.remove('fc-event-pre-hidden');
        }
      } else {
        el.classList.add('fc-event-dimmed');
        if (hiddenByFilter) {
          el.classList.add('fc-event-pre-hidden');
        }
      }
    });
    highlightedGroupRef.current = groupIds ? groupIds.join(',') : null;
  }, []);

  const buildEventLabel = React.useCallback(
    (eventTitle: string, start?: Date | null, end?: Date | null, extendedProps?: Record<string, unknown>): string => {
      const parts: string[] = [];
      parts.push(eventTitle || 'Calendar event');
      if (start && end) {
        parts.push(`from ${politeFormatter.format(start)} to ${politeFormatter.format(end)}`);
      } else if (start) {
        parts.push(`on ${politeFormatter.format(start)}`);
      }
      if (extendedProps) {
        const client = typeof extendedProps.client_name === 'string' ? extendedProps.client_name : undefined;
        const project = typeof extendedProps.project_name === 'string' ? extendedProps.project_name : undefined;
        const location = typeof extendedProps.location === 'string' ? extendedProps.location : undefined;
        const status = typeof extendedProps.status === 'string' ? extendedProps.status : undefined;
        const meta = [client, project, location, status].filter(Boolean);
        if (meta.length) parts.push(meta.join(' • '));
      }
      return parts.join(' ');
    },
    [politeFormatter]
  );

  const handleEventDidMount = React.useCallback(
    (arg: EventMountArg) => {
      const element = arg.el as HTMLElement;
      const { event } = arg;
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute(
        'aria-label',
        buildEventLabel(event.title, event.start, event.end, event.extendedProps ?? {})
      );
      element.dataset.interactive = 'true';
      const keyHandler = (evt: KeyboardEvent) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          evt.stopPropagation();
          element.click();
        }
      };
      const highlightGroupIdsRaw = (event.extendedProps as any)?.highlightGroupIds;
      const legacySingle = typeof (event.extendedProps as any)?.highlightGroupId === 'string'
        ? String((event.extendedProps as any).highlightGroupId)
        : null;
      const normalizedGroupIds = Array.isArray(highlightGroupIdsRaw)
        ? highlightGroupIdsRaw.filter((id: any) => typeof id === 'string' && id.trim().length)
        : legacySingle
          ? [legacySingle]
          : [];
      const hiddenByFilter = Boolean((event.extendedProps as any)?.hiddenByFilter);
      element.dataset.hiddenByFilter = hiddenByFilter ? 'true' : 'false';
      if (hiddenByFilter) {
        element.classList.add('fc-event-pre-hidden');
      }
      if (normalizedGroupIds.length) {
        element.dataset.highlightGroupIds = normalizedGroupIds.join(',');
      } else {
        delete element.dataset.highlightGroupIds;
      }
      const handleEnter = () => {
        if (clearHighlightTimeoutRef.current !== null) {
          window.clearTimeout(clearHighlightTimeoutRef.current);
          clearHighlightTimeoutRef.current = null;
        }
        if (normalizedGroupIds.length) applyHighlight(normalizedGroupIds);
      };
      const handleLeave = (evt: MouseEvent | FocusEvent) => {
        if (!normalizedGroupIds.length) return;
        const related = evt.relatedTarget as HTMLElement | null;
        const relatedGroups = getElementGroupIds(related);
        if (relatedGroups.length && normalizedGroupIds.some((id) => relatedGroups.includes(id))) {
          return;
        }
        clearHighlightTimeoutRef.current = window.setTimeout(() => {
          clearHighlightTimeoutRef.current = null;
          applyHighlight(null);
        }, 120);
      };
      element.addEventListener('keydown', keyHandler);
      element.addEventListener('mouseenter', handleEnter);
      element.addEventListener('mouseleave', handleLeave);
      element.addEventListener('focus', handleEnter);
      element.addEventListener('blur', handleLeave);
      cleanupRef.current.set(element, () => {
        element.removeEventListener('keydown', keyHandler);
        element.removeEventListener('mouseenter', handleEnter);
        element.removeEventListener('mouseleave', handleLeave);
        element.removeEventListener('focus', handleEnter);
        element.removeEventListener('blur', handleLeave);
        element.removeAttribute('role');
        element.removeAttribute('tabindex');
        element.removeAttribute('aria-label');
        delete element.dataset.interactive;
        delete element.dataset.hiddenByFilter;
        delete element.dataset.highlightGroupIds;
        if (normalizedGroupIds.length) {
          if (highlightedGroupRef.current && highlightedGroupRef.current.split(',').some((id) => normalizedGroupIds.includes(id))) {
            applyHighlight(null);
          }
        }
      });
    },
    [buildEventLabel, applyHighlight]
  );

  const handleEventWillUnmount = React.useCallback(
    (arg: EventMountArg) => {
      const element = arg.el as HTMLElement;
      const cleanup = cleanupRef.current.get(element);
      if (cleanup) cleanup();
      cleanupRef.current.delete(element);
    },
    []
  );

  return (
    <div
      className={`fullcalendar-wrapper ${className ?? ''}`}
      data-testid={testId}
      role="region"
      aria-label={ariaLabel ?? 'Calendar of events'}
      aria-describedby={descriptionId}
      aria-busy={loading || (!module && !isEmpty)}
      ref={wrapperRef}
    >
      {ariaDescription ? (
        <p id={descriptionId} className="sr-only">
          {ariaDescription}
        </p>
      ) : null}
      {loading && (
        <div role="status" className="fullcalendar-status">
          Loading calendar…
        </div>
      )}
      {!module && !loading ? (
        <div className="fullcalendar-status">Preparing calendar…</div>
      ) : null}
      {module && (
        <module.FullCalendar
          plugins={module.plugins}
          height={height}
          initialView={resolvedView}
          initialDate={initialDate}
          events={events}
          headerToolbar={resolvedToolbar}
          stickyHeaderDates
          expandRows
          slotMinTime="06:00:00"
          slotMaxTime="20:00:00"
          displayEventTime={!isMobile}
          displayEventEnd={!isMobile}
          navLinks
          eventClick={onEventClick}
          eventContent={eventContent ? (arg) => eventContent(arg) : undefined}
          eventClassNames={(arg) => ['fc-event-accessible', ...(arg.event.classNames ?? [])]}
          eventDidMount={handleEventDidMount}
          eventWillUnmount={handleEventWillUnmount}
          dayMaxEvents={dayMaxEvents}
          dayMaxEventRows={dayMaxEventRows}
          eventOrder={eventOrder}
          weekends
          nowIndicator
          views={views}
          validRange={validRange}
          datesSet={onDatesSet}
        />
      )}
      {isEmpty && (emptyState || <div className="fullcalendar-empty">No events found for the selected window.</div>)}
    </div>
  );
};

export default FullCalendarWrapper;
