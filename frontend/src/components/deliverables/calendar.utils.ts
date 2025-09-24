import type { DeliverableCalendarItem } from '@/types/models';

export function fmtDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfWeekSunday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

export const typeColors: Record<string, string> = {
  bulletin: '#3b82f6',
  cd: '#fb923c',
  dd: '#818cf8',
  ifc: '#06b6d4',
  ifp: '#f472b6',
  masterplan: '#a78bfa',
  sd: '#f59e0b',
  milestone: '#64748b',
  pre_deliverable: 'rgba(147, 197, 253, 0.08)',
};

export function classify(item: DeliverableCalendarItem | any): string {
  const t = (item.title || '').toLowerCase();
  if (/(\b)bulletin(\b)/.test(t)) return 'bulletin';
  if (/(\b)cd(\b)/.test(t)) return 'cd';
  if (/(\b)dd(\b)/.test(t)) return 'dd';
  if (/(\b)ifc(\b)/.test(t)) return 'ifc';
  if (/(\b)ifp(\b)/.test(t)) return 'ifp';
  if (/(master ?plan)/.test(t)) return 'masterplan';
  if (/(\b)sd(\b)/.test(t)) return 'sd';
  return 'milestone';
}

export function buildEventLabel(ev: DeliverableCalendarItem | any): string {
  const base = (ev.title || '').trim();
  const client = (ev.projectClient || '').trim();
  const proj = (ev.projectName || `Project ${ev.project}` || '').trim();
  const extras = [client, proj].filter(Boolean).join(' ');
  return extras ? `${base} - ${extras}` : base;
}

export function buildPreLabel(it: any): string {
  const client = (it.projectClient || '').trim();
  const proj = (it.projectName || '').trim();
  const type = (it.preDeliverableType || '').trim();
  const parts = [client, proj, type].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Pre-Deliverable';
}

export function isPre(item: any): boolean {
  return (item as any).itemType === 'pre_deliverable';
}

