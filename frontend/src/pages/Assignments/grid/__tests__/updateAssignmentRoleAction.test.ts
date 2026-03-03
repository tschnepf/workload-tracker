import { describe, it, expect, vi } from 'vitest';
import { updateAssignmentRoleAction } from '../useAssignmentRoleUpdate';

function makeSetState<T>(holder: { value: T }) {
  return (updater: any) => {
    if (typeof updater === 'function') {
      holder.value = updater(holder.value);
    } else {
      holder.value = updater;
    }
  };
}

describe('updateAssignmentRoleAction', () => {
  it('updates role optimistically and persists', async () => {
    const peopleHolder = {
      value: [
        { id: 10, name: 'Alice', assignments: [{ id: 100, weeklyHours: {}, roleOnProjectId: null, roleName: null }] },
      ],
    } as { value: any[] };
    const asnHolder = { value: [{ id: 100, weeklyHours: {}, roleOnProjectId: null, roleName: null }] } as { value: any[] };
    const assignmentsApi = { update: vi.fn().mockResolvedValue({}) };
    const showToast = vi.fn();

    const result = await updateAssignmentRoleAction({
      assignmentsApi,
      setPeople: makeSetState(peopleHolder),
      setAssignmentsData: makeSetState(asnHolder as any),
      assignmentsData: asnHolder.value as any,
      people: peopleHolder.value,
      personId: 10,
      assignmentId: 100,
      roleId: 5,
      roleName: 'Engineer',
      showToast,
    });

    expect(result).toBe(true);
    expect(assignmentsApi.update).toHaveBeenCalledWith(100, { roleOnProjectId: 5 }, undefined);
    expect(peopleHolder.value[0].assignments[0].roleOnProjectId).toBe(5);
    expect(peopleHolder.value[0].assignments[0].roleName).toBe('Engineer');
    expect(asnHolder.value[0].roleOnProjectId).toBe(5);
    expect(asnHolder.value[0].roleName).toBe('Engineer');
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('Failed to update role'), expect.anything());
  });

  it('rolls back on error and shows toast', async () => {
    const peopleHolder = {
      value: [
        { id: 10, name: 'Alice', assignments: [{ id: 100, weeklyHours: {}, roleOnProjectId: null, roleName: null }] },
      ],
    } as { value: any[] };
    const asnHolder = { value: [{ id: 100, weeklyHours: {}, roleOnProjectId: null, roleName: null }] } as { value: any[] };
    const assignmentsApi = { update: vi.fn().mockRejectedValue(new Error('nope')) };
    const showToast = vi.fn();

    const result = await updateAssignmentRoleAction({
      assignmentsApi,
      setPeople: makeSetState(peopleHolder),
      setAssignmentsData: makeSetState(asnHolder as any),
      assignmentsData: asnHolder.value as any,
      people: peopleHolder.value,
      personId: 10,
      assignmentId: 100,
      roleId: 7,
      roleName: 'Manager',
      showToast,
    });

    expect(result).toBe(false);
    // Rolled back
    expect(peopleHolder.value[0].assignments[0].roleOnProjectId).toBe(null);
    expect(peopleHolder.value[0].assignments[0].roleName).toBe(null);
    expect(asnHolder.value[0].roleOnProjectId).toBe(null);
    expect(asnHolder.value[0].roleName).toBe(null);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Failed to update role'), 'error');
  });

  it('persists when assignment exists only in assignmentsData (project assignments view shape)', async () => {
    const peopleHolder = {
      value: [
        { id: 10, name: 'Alice' },
      ],
    } as { value: any[] };
    const asnHolder = { value: [{ id: 100, weeklyHours: {}, person: 10, roleOnProjectId: null, roleName: null }] } as { value: any[] };
    const assignmentsApi = { update: vi.fn().mockResolvedValue({}) };
    const showToast = vi.fn();

    const result = await updateAssignmentRoleAction({
      assignmentsApi,
      setPeople: makeSetState(peopleHolder),
      setAssignmentsData: makeSetState(asnHolder as any),
      assignmentsData: asnHolder.value as any,
      people: peopleHolder.value,
      personId: 10,
      assignmentId: 100,
      roleId: 9,
      roleName: 'Architect',
      showToast,
    });

    expect(result).toBe(true);
    expect(assignmentsApi.update).toHaveBeenCalledWith(100, { roleOnProjectId: 9 }, undefined);
    expect(asnHolder.value[0].roleOnProjectId).toBe(9);
    expect(asnHolder.value[0].roleName).toBe('Architect');
    expect(showToast).not.toHaveBeenCalled();
  });
});
