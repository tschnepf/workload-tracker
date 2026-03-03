import type { DeliverablePhaseMappingSettings } from '@/types/models';

export const DEFAULT_AUTO_HOURS_PHASES = ['sd', 'dd', 'ifp', 'ifc'] as const;

export const DEFAULT_PHASE_MAPPING: DeliverablePhaseMappingSettings = {
  useDescriptionMatch: true,
  phases: [
    { key: 'sd', label: 'SD', descriptionTokens: ['sd', 'schematic'], rangeMin: 0, rangeMax: 40, sortOrder: 0 },
    { key: 'dd', label: 'DD', descriptionTokens: ['dd', 'design development'], rangeMin: 41, rangeMax: 89, sortOrder: 1 },
    { key: 'ifp', label: 'IFP', descriptionTokens: ['ifp'], rangeMin: 90, rangeMax: 99, sortOrder: 2 },
    { key: 'ifc', label: 'IFC', descriptionTokens: ['ifc'], rangeMin: 100, rangeMax: 100, sortOrder: 3 },
  ],
};

export const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export const roundHours = (value: number) => (Number.isFinite(value) ? Math.ceil(value) : 0);

export const getCurrentSundayIso = () => {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  return sunday.toISOString().slice(0, 10);
};

export const isDateInWeek = (dateStr: string, weekStartStr: string) => {
  try {
    const deliverableDate = new Date(dateStr);
    const weekStartDate = new Date(weekStartStr);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    return deliverableDate >= weekStartDate && deliverableDate <= weekEndDate;
  } catch {
    return false;
  }
};
