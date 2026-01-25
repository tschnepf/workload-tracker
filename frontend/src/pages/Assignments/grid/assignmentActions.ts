import type { Assignment } from '@/types/models';
import { emitAssignmentsRefresh } from '@/lib/assignmentsRefreshBus';
import type { QueryClient } from '@tanstack/react-query';

export async function removeAssignmentAction(params: {
  assignmentsApi: any;
  setPeople: React.Dispatch<React.SetStateAction<any[]>>;
  personId: number;
  assignmentId: number;
  showToast: (msg: string, type?: 'info'|'success'|'warning'|'error') => void;
}) {
  const { assignmentsApi, setPeople, personId, assignmentId, showToast } = params;
  try {
    await assignmentsApi.delete(assignmentId);
    setPeople(prev => prev.map((person: any) =>
      person.id === personId
        ? { ...person, assignments: person.assignments.filter((a: any) => a.id !== assignmentId) }
        : person
    ));
    emitAssignmentsRefresh({
      type: 'deleted',
      assignmentId,
      projectId: assignment?.project ?? null,
      personId: assignment?.person ?? personId,
      updatedAt: assignment?.updatedAt ?? new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Failed to delete assignment:', err);
    showToast('Failed to delete assignment: ' + (err?.message || 'Unknown error'), 'error');
  }
}

export async function updateAssignmentHoursAction(params: {
  assignmentsApi: any;
  queryClient: QueryClient;
  setPeople: React.Dispatch<React.SetStateAction<any[]>>;
  setAssignmentsData: React.Dispatch<React.SetStateAction<Assignment[]>>;
  setHoursByPerson: React.Dispatch<React.SetStateAction<Record<number, Record<string, number>>>>;
  hoursByPerson: Record<number, Record<string, number>>;
  people: any[];
  personId: number;
  assignmentId: number;
  week: string;
  hours: number;
  showToast: (msg: string, type?: 'info'|'success'|'warning'|'error') => void;
}) {
  const { assignmentsApi, queryClient, setPeople, setAssignmentsData, setHoursByPerson, hoursByPerson, people, personId, assignmentId, week, hours, showToast } = params;
  const person = people.find(p => p.id === personId);
  const assignment = person?.assignments.find((a: any) => a.id === assignmentId);
  if (!assignment) return;
  const prevWeeklyHours = { ...assignment.weeklyHours };
  const updatedWeeklyHours = { ...prevWeeklyHours, [week]: hours };
  setPeople(prev => prev.map((p: any) => p.id === personId ? { ...p, assignments: p.assignments.map((a: any) => a.id === assignmentId ? { ...a, weeklyHours: updatedWeeklyHours } : a) } : p));
  setAssignmentsData(prev => prev.map((a: any) => a.id === assignmentId ? { ...a, weeklyHours: updatedWeeklyHours } : a));

  // Optimistically update hoursByPerson so pills refresh immediately
  try {
    const total = (person?.assignments || []).reduce((sum: number, a: any) => {
      const wh = (a.id === assignmentId) ? updatedWeeklyHours : (a.weeklyHours || {});
      const v = parseFloat((wh?.[week] as any)?.toString?.() || '0') || 0;
      return sum + v;
    }, 0);
    const nextMap: Record<number, Record<string, number>> = { ...hoursByPerson };
    nextMap[personId] = { ...(nextMap[personId] || {}) };
    nextMap[personId][week] = total;
    setHoursByPerson(nextMap);
  } catch {}
  try {
    await assignmentsApi.update(assignmentId, { weeklyHours: updatedWeeklyHours });
    queryClient.invalidateQueries({ queryKey: ['capacityHeatmap'] });
    queryClient.invalidateQueries({ queryKey: ['workloadForecast'] });
    emitAssignmentsRefresh({
      type: 'updated',
      assignmentId,
      projectId: assignment.project ?? null,
      personId: assignment.person ?? null,
      updatedAt: assignment.updatedAt ?? new Date().toISOString(),
      fields: ['weeklyHours'],
      assignment: { ...assignment, weeklyHours: updatedWeeklyHours },
    });
  } catch (err: any) {
    setPeople(prev => prev.map((p: any) => p.id === personId ? { ...p, assignments: p.assignments.map((a: any) => a.id === assignmentId ? { ...a, weeklyHours: prevWeeklyHours } : a) } : p));
    setAssignmentsData(prev => prev.map((a: any) => a.id === assignmentId ? { ...a, weeklyHours: prevWeeklyHours } : a));
    // Revert the optimistic pill update
    try {
      const total = (person?.assignments || []).reduce((sum: number, a: any) => {
        const wh = (a.id === assignmentId) ? prevWeeklyHours : (a.weeklyHours || {});
        const v = parseFloat((wh?.[week] as any)?.toString?.() || '0') || 0;
        return sum + v;
      }, 0);
      const nextMap: Record<number, Record<string, number>> = { ...hoursByPerson };
      nextMap[personId] = { ...(nextMap[personId] || {}) };
      nextMap[personId][week] = total;
      setHoursByPerson(nextMap);
    } catch {}
    console.error('Failed to update assignment hours:', err);
    showToast('Failed to update hours: ' + (err?.message || 'Unknown error'), 'error');
  }
}

export async function updateMultipleCellsAction(params: {
  assignmentsApi: any;
  queryClient: QueryClient;
  setPeople: React.Dispatch<React.SetStateAction<any[]>>;
  setAssignmentsData: React.Dispatch<React.SetStateAction<Assignment[]>>;
  setHoursByPerson: React.Dispatch<React.SetStateAction<Record<number, Record<string, number>>>>;
  hoursByPerson: Record<number, Record<string, number>>;
  people: any[];
  cells: { personId: number, assignmentId: number, week: string }[];
  hours: number;
  showToast: (msg: string, type?: 'info'|'success'|'warning'|'error') => void;
}) {
  const { assignmentsApi, queryClient, setPeople, setAssignmentsData, setHoursByPerson, hoursByPerson, people, cells, hours, showToast } = params;

  const assignmentUpdates = new Map<string, { personId: number; assignmentId: number; weeklyHours: Record<string, number>; prevWeeklyHours: Record<string, number>; }>();
  cells.forEach(cell => {
    const key = `${cell.personId}-${cell.assignmentId}`;
    if (!assignmentUpdates.has(key)) {
      const person = people.find(p => p.id === cell.personId);
      const assignment = person?.assignments.find((a: any) => a.id === cell.assignmentId);
      if (assignment) {
        assignmentUpdates.set(key, { personId: cell.personId, assignmentId: cell.assignmentId, weeklyHours: { ...assignment.weeklyHours }, prevWeeklyHours: { ...assignment.weeklyHours } });
      }
    }
    const update = assignmentUpdates.get(key);
    if (update) update.weeklyHours[cell.week] = hours;
  });
  const updatesArray = Array.from(assignmentUpdates.values());
  setPeople(prev => prev.map((person: any) => {
    const personUpdates = updatesArray.filter(u => u.personId === person.id);
    if (personUpdates.length === 0) return person;
    return { ...person, assignments: person.assignments.map((assignment: any) => {
      const u = personUpdates.find(x => x.assignmentId === assignment.id);
      return u ? { ...assignment, weeklyHours: u.weeklyHours } : assignment;
    }) };
  }));
  setAssignmentsData(prev => prev.map((a: any) => {
    const u = updatesArray.find(x => x.assignmentId === a.id);
    return u ? { ...a, weeklyHours: u.weeklyHours } : a;
  }));
  try {
    const byPersonWeeks = new Map<number, Set<string>>();
    cells.forEach(c => {
      if (!byPersonWeeks.has(c.personId)) byPersonWeeks.set(c.personId, new Set());
      byPersonWeeks.get(c.personId)!.add(c.week);
    });
    const newMap: Record<number, Record<string, number>> = { ...hoursByPerson };
    for (const [pid, weeksSet] of byPersonWeeks.entries()) {
      const person = people.find(p => p.id === pid);
      if (!person) continue;
      if (!newMap[pid]) newMap[pid] = { ...(hoursByPerson[pid] || {}) };
      for (const wk of weeksSet) {
        const total = (person.assignments || []).reduce((sum: number, a: any) => {
          const u = updatesArray.find(x => x.assignmentId === a.id && x.personId === pid);
          const wh = u ? u.weeklyHours : a.weeklyHours || {};
          const v = parseFloat((wh?.[wk] as any)?.toString?.() || '0') || 0;
          return sum + v;
        }, 0);
        newMap[pid][wk] = total;
      }
    }
    setHoursByPerson(newMap);
  } catch {}

  let results: PromiseSettledResult<any>[] = [];
  if (updatesArray.length > 1) {
    try {
      const bulk = await assignmentsApi.bulkUpdateHours(updatesArray.map(u => ({ assignmentId: u.assignmentId, weeklyHours: u.weeklyHours })));
      const ok = (bulk?.results || []).map((r: any) => ({ status: 'fulfilled', value: r })) as PromiseSettledResult<any>[];
      results = ok;
    } catch (e) {
      results = updatesArray.map(() => ({ status: 'rejected', reason: e })) as PromiseSettledResult<any>[];
    }
  } else {
    results = await Promise.allSettled(updatesArray.map(u => assignmentsApi.update(u.assignmentId, { weeklyHours: u.weeklyHours })));
  }
  const failed: typeof updatesArray = [];
  results.forEach((res, idx) => { if (res.status === 'rejected') failed.push(updatesArray[idx]); });
  const succeeded = results.some(r => r.status === 'fulfilled');
  if (succeeded) {
    queryClient.invalidateQueries({ queryKey: ['capacityHeatmap'] });
    queryClient.invalidateQueries({ queryKey: ['workloadForecast'] });
    updatesArray.forEach((u) => {
      const person = people.find(p => p.id === u.personId);
      const assignment = person?.assignments.find((a: any) => a.id === u.assignmentId);
      emitAssignmentsRefresh({
        type: 'updated',
        assignmentId: u.assignmentId,
        projectId: assignment?.project ?? null,
        personId: u.personId ?? null,
        updatedAt: assignment?.updatedAt ?? new Date().toISOString(),
        fields: ['weeklyHours'],
        assignment: assignment ? { ...assignment, weeklyHours: u.weeklyHours } as any : undefined,
      });
    });
  }
  if (failed.length > 0) {
    setPeople(prev => prev.map((person: any) => {
      const failedForPerson = failed.filter(u => u.personId === person.id);
      if (failedForPerson.length === 0) return person;
      return { ...person, assignments: person.assignments.map((assignment: any) => {
        const f = failedForPerson.find(x => x.assignmentId === assignment.id);
        return f ? { ...assignment, weeklyHours: f.prevWeeklyHours } : assignment;
      }) };
    }));
    setAssignmentsData(prev => prev.map((a: any) => {
      const f = failed.find(x => x.assignmentId === a.id);
      return f ? { ...a, weeklyHours: f.prevWeeklyHours } : a;
    }));
    showToast(`Failed to update ${failed.length} assignment(s). Changes were reverted for those.`, 'error');
  }
}
