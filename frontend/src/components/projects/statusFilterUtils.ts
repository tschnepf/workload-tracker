import type { Deliverable, Project, ProjectFilterMetadataResponse } from '@/types/models';

export type FutureDeliverableLookup = (projectId: number | null | undefined) => boolean;

const alwaysFalseLookup: FutureDeliverableLookup = () => false;

const buildLookupFromSet = (ids: Iterable<number>): FutureDeliverableLookup => {
  const set = new Set<number>();
  for (const id of ids) {
    if (typeof id === 'number' && Number.isFinite(id)) {
      set.add(id);
    }
  }
  if (set.size === 0) return alwaysFalseLookup;
  return (projectId) => (projectId != null ? set.has(projectId) : false);
};

export const buildFutureDeliverableLookupFromDeliverables = (
  deliverables: Deliverable[] | undefined | null,
  referenceDate: Date = new Date()
): FutureDeliverableLookup => {
  if (!deliverables || deliverables.length === 0) return alwaysFalseLookup;
  const now = referenceDate.getTime();
  const ids = new Set<number>();
  for (const deliverable of deliverables) {
    const projectId = (deliverable as any)?.project;
    const date = (deliverable as any)?.date;
    if (!projectId || !date) continue;
    const ts = new Date(date).getTime();
    if (!Number.isNaN(ts) && ts >= now) {
      ids.add(projectId);
    }
  }
  return buildLookupFromSet(ids);
};

export const buildFutureDeliverableLookupFromRecord = (
  record: Record<string, boolean> | null | undefined
): FutureDeliverableLookup => {
  if (!record) return alwaysFalseLookup;
  const ids = Object.entries(record)
    .filter(([, hasFuture]) => Boolean(hasFuture))
    .map(([pid]) => Number(pid))
    .filter((pid) => Number.isFinite(pid));
  return buildLookupFromSet(ids);
};

export const buildFutureDeliverableLookupFromSet = (
  ids: Iterable<number> | null | undefined
): FutureDeliverableLookup => {
  if (!ids) return alwaysFalseLookup;
  return buildLookupFromSet(ids);
};

export const buildFutureDeliverableLookupFromMetadata = (
  metadata: ProjectFilterMetadataResponse | null | undefined
): FutureDeliverableLookup => {
  if (!metadata?.projectFilters) return alwaysFalseLookup;
  const ids: number[] = [];
  for (const [pid, meta] of Object.entries(metadata.projectFilters)) {
    if (meta?.hasFutureDeliverables) {
      const idNum = Number(pid);
      if (Number.isFinite(idNum)) ids.push(idNum);
    }
  }
  return buildLookupFromSet(ids);
};

export const projectMatchesActiveWithDates = (
  project: Project | null | undefined,
  lookup: FutureDeliverableLookup = alwaysFalseLookup
): boolean => {
  if (!project || (project.status || '').toLowerCase() !== 'active') return false;
  if (project.id == null) return false;
  return lookup(project.id);
};

export const projectMatchesActiveWithoutDates = (
  project: Project | null | undefined,
  lookup: FutureDeliverableLookup = alwaysFalseLookup
): boolean => {
  if (!project || (project.status || '').toLowerCase() !== 'active') return false;
  if (project.id == null) return false;
  return !lookup(project.id);
};

