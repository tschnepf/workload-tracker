import type { Person } from '@/types/models';

export interface AddAssignmentState {
  personSearch: string;
  selectedPerson: Person | null;
  roleOnProjectId?: number | null;
  roleOnProject: string;
  roleSearch: string;
  weeklyHours: { [key: string]: number };
}
