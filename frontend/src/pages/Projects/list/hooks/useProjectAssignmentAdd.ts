import { useCallback, useState } from 'react';
import type { AddAssignmentState } from '@/pages/Projects/list/types';
import { assignmentsApi } from '@/services/api';

interface Params {
  projectId: number | undefined | null;
  invalidateFilterMeta: () => Promise<void>;
  reloadAssignments: (projectId: number) => Promise<void>;
  checkAssignmentConflicts: (personId: number, projectId: number, weekKey: string, newHours: number) => Promise<string[]>;
}

const initialState: AddAssignmentState = {
  personSearch: '',
  selectedPerson: null,
  roleOnProject: '',
  roleSearch: '',
  weeklyHours: {},
};

export function useProjectAssignmentAdd({ projectId, invalidateFilterMeta, reloadAssignments, checkAssignmentConflicts }: Params) {
  const [state, setState] = useState<AddAssignmentState>(initialState);
  const [warnings, setWarnings] = useState<string[]>([]);

  const save = useCallback(async () => {
    if (!projectId || !state.selectedPerson?.id) return;

    // Warning checks for over-allocation on current week
    const weeklyHours = state.weeklyHours || {};
    const totalNewHours = Object.values(weeklyHours).reduce((sum, hours) => sum + (hours || 0), 0);

    if (totalNewHours > 0) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      const currentWeekKey = monday.toISOString().split('T')[0];

      const currentWeekHours = weeklyHours[currentWeekKey] || 0;
      if (currentWeekHours > 0 && projectId) {
        const conflictWarnings = await checkAssignmentConflicts(state.selectedPerson.id, projectId, currentWeekKey, currentWeekHours);
        setWarnings(conflictWarnings);
      }
    }

    const payload = {
      person: state.selectedPerson.id,
      project: projectId,
      roleOnProject: state.roleOnProject || 'Team Member',
      weeklyHours: state.weeklyHours,
      startDate: new Date().toISOString().split('T')[0],
    } as any;

    await assignmentsApi.create(payload);
    await reloadAssignments(projectId);
    await invalidateFilterMeta();
    setState(initialState);
  }, [projectId, state, checkAssignmentConflicts, reloadAssignments, invalidateFilterMeta]);

  const cancel = useCallback(() => {
    setWarnings([]);
    setState(initialState);
  }, []);

  return { state, setState, save, cancel, warnings, setWarnings } as const;
}
