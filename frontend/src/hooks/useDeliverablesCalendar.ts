import { useQuery } from '@tanstack/react-query';
import { apiClient, authHeaders } from '@/api/client';
import { deliverablesApi, deliverableAssignmentsApi } from '@/services/api';
import type { DeliverableCalendarItem } from '@/types/models';
import type { DeliverableCalendarUnion } from '@/features/fullcalendar/eventAdapters';
import { resolveApiBase } from '@/utils/apiBase';

export type CalendarRange = { start: string; end: string };
export type DeliverablesCalendarMeta = {
  source: 'bundle' | 'legacy' | 'fallback';
  notesRequested: boolean;
  projectLeadsRequested: boolean;
  truncated?: boolean;
  truncatedDetails?: unknown;
};
export type DeliverablesCalendarWithMeta = DeliverableCalendarUnion[] & {
  __meta?: DeliverablesCalendarMeta;
};
const API_BASE_URL = resolveApiBase((import.meta as any)?.env?.VITE_API_URL as string | undefined);

const MAX_WEEKS = 12;

export function clampWeeks(weeks: number): number {
  return Math.max(1, Math.min(MAX_WEEKS, weeks));
}

export function toIsoDate(date: Date | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function subtractOneDay(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d;
}

export function buildCalendarRange(weeks: number, anchor?: Date): CalendarRange {
  const safeWeeks = clampWeeks(weeks);
  const startDate = startOfWeekSunday(anchor ?? new Date());
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + safeWeeks * 7 - 1);
  return { start: toIsoDate(startDate), end: toIsoDate(endDate) };
}

type Options = {
  mineOnly?: boolean;
  personId?: number | null;
  typeId?: number | null;
  vertical?: number | null;
  includeNotes?: 'preview' | 'full' | 'none';
  includeProjectLeads?: boolean;
  refetchIntervalMs?: number;
  refetchIntervalInBackground?: boolean;
  staleTimeMs?: number;
  refetchOnWindowFocus?: boolean;
  forceRefetchOnMount?: boolean;
};

export function useDeliverablesCalendar(range: CalendarRange | null, options?: Options) {
  const mineOnly = options?.mineOnly ?? false;
  const personId = options?.personId ?? null;
  const vertical = options?.vertical ?? null;
  const refetchIntervalMs = options?.refetchIntervalMs ?? 0;

  return useQuery<DeliverablesCalendarWithMeta, Error>({
    queryKey: [
      'deliverables-calendar',
      mineOnly ? personId : 'all',
      range?.start,
      range?.end,
      mineOnly ? 1 : 0,
      options?.typeId ?? 'all',
      vertical ?? 'all',
      options?.includeNotes ?? 'none',
      options?.includeProjectLeads ? 1 : 0,
    ],
    enabled: Boolean(range?.start && range?.end && (!mineOnly || !!personId)),
    queryFn: () =>
      fetchDeliverableCalendar(range!, {
        mineOnly,
        personId,
        typeId: options?.typeId,
        vertical,
        includeNotes: options?.includeNotes,
        includeProjectLeads: options?.includeProjectLeads,
      }),
    staleTime: options?.staleTimeMs ?? (1000 * 60 * 5),
    refetchInterval: refetchIntervalMs > 0 ? refetchIntervalMs : false,
    refetchIntervalInBackground: refetchIntervalMs > 0 ? (options?.refetchIntervalInBackground ?? true) : false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnMount: options?.forceRefetchOnMount ? 'always' : true,
    retry: 2,
  });
}

function withMeta(
  items: DeliverableCalendarUnion[],
  meta: DeliverablesCalendarMeta
): DeliverablesCalendarWithMeta {
  try {
    Object.defineProperty(items, '__meta', {
      value: meta,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  } catch {}
  return items as DeliverablesCalendarWithMeta;
}

async function fetchDeliverableCalendar(range: CalendarRange, options: Options): Promise<DeliverablesCalendarWithMeta> {
  const { mineOnly, personId, typeId, vertical, includeNotes, includeProjectLeads } = options;
  const notesRequested = Boolean(includeNotes && includeNotes !== 'none');
  const projectLeadsRequested = Boolean(includeProjectLeads);
  const query = new URLSearchParams();
  query.set('start', range.start);
  query.set('end', range.end);
  if (mineOnly) query.set('mine_only', '1');
  if (typeId != null) query.set('type_id', String(typeId));
  if (vertical != null) query.set('vertical', String(vertical));
  if (includeNotes && includeNotes !== 'none') query.set('include_notes', includeNotes);
  if (includeProjectLeads) query.set('include_project_leads', '1');
  try {
    const base = API_BASE_URL.replace(/\/$/, '');
    const url = `${base}/deliverables/calendar_with_pre_items/?${query.toString()}`;
    const headers = {
      ...(authHeaders() as Record<string, string>),
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) throw new Error(`calendar_with_pre_items failed: ${res.status}`);
    const payload = await res.json();
    if (Array.isArray(payload)) {
      return withMeta(payload as DeliverableCalendarUnion[], {
        source: 'legacy',
        notesRequested,
        projectLeadsRequested,
        truncated: false,
        truncatedDetails: null,
      });
    }
    if (payload && Array.isArray((payload as any).items)) {
      const items = (payload as any).items as DeliverableCalendarUnion[];
      const leadsByProject = (payload as any).departmentLeadsByProject || {};
      const truncatedDetails = (payload as any).truncated ?? null;
      const enriched = items.map((raw: any) => {
        if ((raw?.itemType ?? 'deliverable') !== 'deliverable') return raw;
        const projectId = typeof raw?.project === 'number' ? raw.project : null;
        if (projectId == null) return raw;
        return {
          ...raw,
          departmentLeads: (raw?.departmentLeads && typeof raw.departmentLeads === 'object')
            ? raw.departmentLeads
            : (leadsByProject[String(projectId)] || leadsByProject[projectId] || {}),
        };
      });
      return withMeta(enriched as DeliverableCalendarUnion[], {
        source: 'bundle',
        notesRequested,
        projectLeadsRequested,
        truncated: Boolean(truncatedDetails),
        truncatedDetails,
      });
    }
  } catch {
    // swallow and fall back
  }
  const fallback = await fallbackDeliverableCalendar(range, { mineOnly, personId, vertical });
  return withMeta(fallback, {
    source: 'fallback',
    notesRequested,
    projectLeadsRequested,
    truncated: false,
    truncatedDetails: null,
  });
}

async function fallbackDeliverableCalendar(range: CalendarRange, options: Options): Promise<DeliverableCalendarUnion[]> {
  const { mineOnly, personId, vertical } = options;
  const [legacy, links, projAssignments, preItems] = await Promise.all([
    (async () => {
      try {
        return await deliverablesApi.calendar(range.start, range.end, vertical ?? undefined);
      } catch {
        return [] as DeliverableCalendarItem[];
      }
    })(),
    (async () => {
      if (!mineOnly || !personId) return [] as any[];
      try {
        return await deliverableAssignmentsApi.byPerson(personId);
      } catch {
        return [] as any[];
      }
    })(),
    (async () => {
      if (!mineOnly || !personId) return [] as any[];
      try {
        const query: Record<string, any> = { person_id: personId };
        if (vertical != null) query.vertical = vertical;
        const res = await apiClient.GET('/assignments/by_person/' as any, {
          params: { query },
          headers: authHeaders(),
        });
        return (res as any)?.data ?? [];
      } catch {
        return [] as any[];
      }
    })(),
    (async () => {
      const query: Record<string, any> = { start: range.start, end: range.end, page_size: 100 };
      if (mineOnly) query.mine_only = 1;
      if (vertical != null) query.vertical = vertical;
      try {
        const res = await apiClient.GET('/deliverables/pre_deliverable_items/' as any, {
          params: { query },
          headers: authHeaders(),
        });
        const data = (res as any)?.data;
        if (Array.isArray(data)) return data;
        if (data?.results) return data.results;
        return [];
      } catch {
        return [];
      }
    })(),
  ]);

  const allowedDeliverableIds = mineOnly
    ? new Set<number>(links.map((l: any) => l.deliverable).filter((id: number) => Number.isFinite(id)))
    : null;
  const allowedProjectIds = mineOnly
    ? new Set<number>(projAssignments.map((a: any) => a.project).filter((id: number) => Number.isFinite(id)))
    : null;

  const deliverables: DeliverableCalendarUnion[] = (legacy || [])
    .filter((item) => {
      if (!mineOnly) return true;
      const projectId = (item as any).project as number | undefined;
      const deliverableId = item.id;
      const allowed =
        (projectId != null && allowedProjectIds?.has(projectId)) ||
        (deliverableId != null && allowedDeliverableIds?.has(deliverableId));
      return Boolean(allowed);
    })
    .map((it) => ({ ...it, itemType: 'deliverable' as const }));

  const preDeliverables: DeliverableCalendarUnion[] = (preItems || []).map((pi: any) => ({
    itemType: 'pre_deliverable' as const,
    id: pi.id,
    parentDeliverableId: pi.deliverable ?? null,
    project: pi.parentDeliverable?.project ?? pi.project ?? null,
    projectName: pi.projectName ?? pi.parentDeliverable?.description ?? null,
    projectClient: pi.projectClient ?? null,
    preDeliverableType: pi.typeName ?? pi.preDeliverableType ?? null,
    title: `PRE: ${pi.typeName || pi.preDeliverableType || ''}`.trim(),
    date: pi.generatedDate ?? pi.date ?? null,
    isCompleted: Boolean(pi.isCompleted),
    isOverdue: Boolean(pi.isOverdue),
  }));

  return [...deliverables, ...preDeliverables];
}

function startOfWeekSunday(date: Date): Date {
  const d = new Date(date);
  const diff = d.getDay();
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
