import type { Assignment, Project } from '@/types/models';

export type ProjectWithAssignments = Project & { assignments: Assignment[]; isExpanded: boolean };

export type DeliverableMarker = {
  type: string;
  percentage?: number;
  dates?: string[];
  description?: string | null;
  note?: string | null;
};
