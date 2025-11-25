import type { EventInput } from '@fullcalendar/core';
import type { DeliverableCalendarItem, PersonCapacityHeatmapItem } from '@/types/models';
import type { PersonalWorkPayload } from '@/hooks/usePersonalWork';
import { classify as classifyDeliverableType } from '@/components/deliverables/calendar.utils';

export type DeliverableCalendarUnion = (DeliverableCalendarItem & { itemType?: 'deliverable' }) | PreDeliverableCalendarItem;

export interface PreDeliverableCalendarItem {
  itemType: 'pre_deliverable';
  id: number;
  parentDeliverableId?: number | null;
  project?: number | null;
  projectName?: string | null;
  projectClient?: string | null;
  preDeliverableType?: string | null;
  title: string;
  date: string | null;
  isCompleted: boolean;
  isOverdue?: boolean;
}

export interface DeliverableEventMeta {
  kind: 'deliverable' | 'pre_deliverable' | 'pre_deliverable_group';
  deliverableId?: number;
  parentDeliverableId?: number | null;
  projectId?: number | null;
  projectName?: string | null;
  projectClient?: string | null;
  isCompleted?: boolean;
  isOverdue?: boolean;
  preDeliverableType?: string | null;
  description?: string | null;
  stageCode?: string | null;
  percentage?: number | null;
  preDeliverableTitles?: string[];
  sortPriority?: number;
  highlightGroupIds?: string[];
  hiddenByFilter?: boolean;
}

export interface CapacityHeatmapEventMeta {
  kind: 'capacity-week';
  personId: number;
  personName: string;
  department?: string | null;
  weekKey: string;
  allocatedHours: number;
  weeklyCapacity: number;
  percentUtilized: number;
}

export interface ScheduleEventMeta {
  kind: 'personal-schedule';
  weekKey: string;
  weeklyCapacity: number;
  allocatedHours: number;
}

export type CalendarEventMeta = DeliverableEventMeta | CapacityHeatmapEventMeta | ScheduleEventMeta;

type DeliverableAdapterOptions = {
  includePreDeliverables?: boolean;
  highlightOverdue?: boolean;
};

type HeatmapAdapterOptions = {
  clampWeeks?: number;
};

export function mapDeliverableCalendarToEvents(
  items: DeliverableCalendarUnion[],
  options?: DeliverableAdapterOptions
): EventInput[] {
  if (!Array.isArray(items) || !items.length) return [];
  const includePre = options?.includePreDeliverables !== false;
  const hidePreByDefault = !includePre;
  const events: EventInput[] = [];
  const preGroups = new Map<string, {
    date: string;
    projectId: number | null;
    projectName: string | null;
    projectClient: string | null;
    parentDeliverableId: number | null;
    items: PreDeliverableCalendarItem[];
  }>();

  const buildDeliverableGroupId = (deliverableId: number | null | undefined) => (deliverableId != null ? `deliv-${deliverableId}` : null);
  const slugifyProject = (value: string | null | undefined) => {
    if (!value) return null;
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null;
  };
  const buildProjectGroupIds = (projectId: number | null, projectName?: string | null, projectClient?: string | null) => {
    const ids = new Set<string>();
    if (projectId != null) ids.add(`proj-id-${projectId}`);
    const slug = slugifyProject(projectName) || slugifyProject(projectClient);
    if (slug) ids.add(`proj-slug-${slug}`);
    if (!ids.size) ids.add('proj-slug-unknown');
    return Array.from(ids);
  };

  const pushDeliverable = (item: DeliverableCalendarItem) => {
    const date = normalizeDate(item.date!);
    const deliverableType = classifyDeliverableType(item);
    const stageCode = deliverableType ? deliverableType.toUpperCase() : null;
    const percentageValue = typeof (item as any).percentage === 'number' ? Number((item as any).percentage) : null;
    const overdue = Boolean((item as any).isOverdue);
    const completed = Boolean((item as any).isCompleted);
    const projectId = (item as any).project ?? null;
    const deliverableGroupId = buildDeliverableGroupId(item.id);
    const projectGroupIds = buildProjectGroupIds(projectId, item.projectName, (item as any).projectClient ?? null);
    const highlightGroupIds = new Set<string>();
    projectGroupIds.forEach((id) => highlightGroupIds.add(id));
    if (deliverableGroupId) highlightGroupIds.add(deliverableGroupId);
    const classNames: string[] = ['fc-event-deliverable', `fc-event-type-${deliverableType}`];
    if (completed) classNames.push('fc-event-complete');
    if (overdue && (options?.highlightOverdue ?? true)) classNames.push('fc-event-overdue');
    events.push({
      id: `deliv-${item.id}`,
      title: buildDeliverableTitle(item),
      start: date,
      end: date,
      allDay: true,
      display: 'block',
      classNames,
      extendedProps: {
        kind: 'deliverable',
        deliverableId: item.id,
        parentDeliverableId: item.id,
        projectId: (item as any).project ?? null,
        projectName: item.projectName ?? null,
        projectClient: (item as any).projectClient ?? null,
        isCompleted: completed,
        isOverdue: overdue,
        preDeliverableType: null,
        description: item.title ?? null,
        stageCode,
        percentage: percentageValue,
        sortPriority: 0,
        highlightGroupIds: Array.from(highlightGroupIds),
        hiddenByFilter: false,
      } satisfies DeliverableEventMeta,
    });
  };

  const pushSinglePre = (item: PreDeliverableCalendarItem) => {
    const date = normalizeDate(item.date!);
    const overdue = Boolean((item as any).isOverdue);
    const completed = Boolean((item as any).isCompleted);
    const classNames: string[] = ['fc-event-deliverable', 'fc-event-type-pre_deliverable', 'fc-event-pre'];
    if (completed) classNames.push('fc-event-complete');
    if (overdue && (options?.highlightOverdue ?? true)) classNames.push('fc-event-overdue');
    if (hidePreByDefault) classNames.push('fc-event-pre-hidden');
    const projectId = (item as any).project ?? null;
    const highlightGroupIds = new Set<string>();
    const projectGroupIds = buildProjectGroupIds(projectId, item.projectName ?? null, item.projectClient ?? null);
    projectGroupIds.forEach((id) => highlightGroupIds.add(id));
    if (item.parentDeliverableId != null) {
      const deliverableGroupId = buildDeliverableGroupId(item.parentDeliverableId);
      if (deliverableGroupId) highlightGroupIds.add(deliverableGroupId);
    }
    events.push({
      id: `pre-${item.id}`,
      title: buildDeliverableTitle(item),
      start: date,
      end: date,
      allDay: true,
      display: 'block',
      classNames,
      extendedProps: {
        kind: 'pre_deliverable',
        parentDeliverableId: item.parentDeliverableId ?? null,
        projectId: (item as any).project ?? null,
        projectName: item.projectName ?? null,
        projectClient: item.projectClient ?? null,
        isCompleted: completed,
        isOverdue: overdue,
        preDeliverableType: item.preDeliverableType ?? null,
        description: item.title ?? null,
        stageCode: item.preDeliverableType || 'PRE',
        sortPriority: 2,
        highlightGroupIds: Array.from(highlightGroupIds),
        hiddenByFilter: hidePreByDefault,
      } satisfies DeliverableEventMeta,
    });
  };

  const pushPreGroup = (group: { date: string; projectId: number | null; projectName: string | null; projectClient: string | null; parentDeliverableId: number | null; items: PreDeliverableCalendarItem[]; }) => {
    const classNames = ['fc-event-deliverable', 'fc-event-pre', 'fc-event-pre-group', 'fc-event-type-pre_deliverable'];
    if (hidePreByDefault) classNames.push('fc-event-pre-hidden');
    const highlightGroupIds = new Set<string>();
    const projectGroupIds = buildProjectGroupIds(group.projectId, group.projectName, group.projectClient);
    projectGroupIds.forEach((id) => highlightGroupIds.add(id));
    if (group.parentDeliverableId != null) {
      const deliverableGroupId = buildDeliverableGroupId(group.parentDeliverableId);
      if (deliverableGroupId) highlightGroupIds.add(deliverableGroupId);
    }
    events.push({
      id: `pregrp-${group.projectId ?? 'none'}-${group.parentDeliverableId ?? 'none'}-${group.date}`,
      title: group.projectName || group.projectClient || 'Pre-Deliverables',
      start: group.date,
      end: group.date,
      allDay: true,
      display: 'block',
      classNames,
      extendedProps: {
        kind: 'pre_deliverable_group',
        parentDeliverableId: group.parentDeliverableId,
        projectId: group.projectId,
        projectName: group.projectName,
        projectClient: group.projectClient,
        preDeliverableTitles: group.items.map((it) => it.title || it.preDeliverableType || 'Pre-Deliverable'),
        sortPriority: 1,
        highlightGroupIds: Array.from(highlightGroupIds),
        hiddenByFilter: hidePreByDefault,
      } satisfies DeliverableEventMeta,
    });
  };

  for (const raw of items) {
    if (!raw?.date) continue;
    if (raw.itemType === 'pre_deliverable') {
      const item = raw as PreDeliverableCalendarItem;
      const date = normalizeDate(item.date!);
      const projectId = (item as any).project ?? null;
      const parentDeliverableId = item.parentDeliverableId ?? null;
      const key = `${projectId ?? 'none'}|${parentDeliverableId ?? 'none'}|${date}`;
      const existing = preGroups.get(key) ?? {
        date,
        projectId,
        projectName: item.projectName ?? null,
        projectClient: item.projectClient ?? null,
        parentDeliverableId,
        items: [],
      };
      existing.items.push(item);
      preGroups.set(key, existing);
    } else {
      pushDeliverable(raw as DeliverableCalendarItem);
    }
  }

  preGroups.forEach((group) => {
    if (group.items.length <= 1) {
      pushSinglePre(group.items[0]);
    } else {
      pushPreGroup(group);
    }
  });

  const priority = (kind?: DeliverableEventMeta['kind']): number => {
    if (kind === 'deliverable') return 0;
    if (kind === 'pre_deliverable_group') return 1;
    if (kind === 'pre_deliverable') return 2;
    return 3;
  };

  return events.sort((a, b) => {
    const kindA = (a.extendedProps as DeliverableEventMeta | undefined)?.kind;
    const kindB = (b.extendedProps as DeliverableEventMeta | undefined)?.kind;
    return priority(kindA) - priority(kindB);
  });
}

export function formatDeliverableInlineLabel(meta: DeliverableEventMeta, fallbackTitle?: string): string {
  const parts: string[] = [];
  const percent = typeof meta?.percentage === 'number' && !Number.isNaN(meta.percentage)
    ? `${Math.round(meta.percentage)}%`
    : null;
  if (percent) parts.push(percent);
  let description = (meta.description || '').trim();
  if (!description && meta.stageCode) description = meta.stageCode.trim();
  if (!description && fallbackTitle) description = fallbackTitle.trim();
  if (description) parts.push(description);
  const client = (meta.projectClient || '').trim();
  if (client) parts.push(client);
  const project = (meta.projectName || '').trim();
  if (project && project !== client) parts.push(project);
  return parts.join(' · ');
}

export function mapPersonalScheduleToEvents(schedule: PersonalWorkPayload['schedule'] | null | undefined): EventInput[] {
  if (!schedule || !schedule.weekKeys?.length) return [];
  const { weekKeys, weeklyCapacity, weekTotals } = schedule;
  return weekKeys.map<EventInput>((weekKey) => {
    const start = normalizeDate(weekKey);
    const end = addDays(start, 6);
    const hours = weekTotals?.[weekKey] ?? 0;
    const percent = weeklyCapacity ? Math.min(100, Math.round((hours / weeklyCapacity) * 100)) : 0;
    return {
      id: `schedule-${weekKey}`,
      title: `${Math.round(hours)}h / ${weeklyCapacity}h`,
      start,
      end,
      allDay: true,
      display: 'background',
      classNames: ['fc-event-schedule'],
      extendedProps: {
        kind: 'personal-schedule',
        weekKey,
        weeklyCapacity,
        allocatedHours: hours,
      } satisfies ScheduleEventMeta,
      backgroundColor: percentToBackground(percent),
      borderColor: 'transparent',
    };
  });
}

export function mapCapacityHeatmapToEvents(
  rows: PersonCapacityHeatmapItem[] | undefined,
  options?: HeatmapAdapterOptions
): EventInput[] {
  if (!rows?.length) return [];
  const events: EventInput[] = [];
  for (const row of rows) {
    const limit = options?.clampWeeks;
    const weekKeys = (row.weekKeys ?? []).slice(0, typeof limit === 'number' ? limit : undefined);
    for (const key of weekKeys) {
      const start = normalizeDate(key);
      const end = addDays(start, 6);
      const hours = row.weekTotals?.[key] ?? 0;
      const percent = row.weeklyCapacity ? Math.round((hours / row.weeklyCapacity) * 100) : 0;
      events.push({
        id: `heat-${row.id}-${key}`,
        title: `${row.name} – ${Math.round(hours)}h`,
        start,
        end,
        allDay: true,
        classNames: ['fc-event-heatmap'],
        extendedProps: {
          kind: 'capacity-week',
          personId: row.id,
          personName: row.name,
          department: row.department,
          weekKey: key,
          allocatedHours: hours,
          weeklyCapacity: row.weeklyCapacity,
          percentUtilized: percent,
        } satisfies CapacityHeatmapEventMeta,
        backgroundColor: percentToBackground(percent),
        borderColor: 'transparent',
      });
    }
  }
  return events;
}

function buildDeliverableTitle(item: DeliverableCalendarUnion): string {
  if (item.itemType === 'pre_deliverable') {
    const base = item.preDeliverableType || item.title || 'Pre-Deliverable';
    const project = item.projectClient || item.projectName;
    return project ? `${base} · ${project}` : base;
  }
  const deliverable = item as DeliverableCalendarItem;
  const project = deliverable.projectClient || deliverable.projectName;
  return project ? `${deliverable.title} · ${project}` : deliverable.title || 'Deliverable';
}

function normalizeDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const d = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateString;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function percentToBackground(percent: number): string {
  if (!Number.isFinite(percent)) return 'var(--heatmap-unknown, #475569)';
  if (percent >= 110) return 'var(--heatmap-burn, #be123c)';
  if (percent >= 95) return 'var(--heatmap-high, #f97316)';
  if (percent >= 70) return 'var(--heatmap-nominal, #22c55e)';
  if (percent >= 40) return 'var(--heatmap-low, #0ea5e9)';
  return 'var(--heatmap-idle, #6366f1)';
}
