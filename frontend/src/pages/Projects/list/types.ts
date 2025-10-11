import type { Person } from '@/types/models';

export interface AddAssignmentState {
  personSearch: string;
  selectedPerson: Person | null;
  roleOnProject: string;
  roleSearch: string;
  weeklyHours: { [key: string]: number };
}

