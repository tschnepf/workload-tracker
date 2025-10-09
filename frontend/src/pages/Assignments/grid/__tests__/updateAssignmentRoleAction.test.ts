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

    await updateAssignmentRoleAction({
      assignmentsApi,
      setPeople: makeSetState(peopleHolder),
      setAssignmentsData: makeSetState(asnHolder as any),
      people: peopleHolder.value,
      personId: 10,
      assignmentId: 100,
      roleId: 5,
      roleName: 'Engineer',
      showToast,
    });

    expect(assignmentsApi.update).toHaveBeenCalledWith(100, { roleOnProjectId: 5 });
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

    await updateAssignmentRoleAction({
      assignmentsApi,
      setPeople: makeSetState(peopleHolder),
      setAssignmentsData: makeSetState(asnHolder as any),
      people: peopleHolder.value,
      personId: 10,
      assignmentId: 100,
      roleId: 7,
      roleName: 'Manager',
      showToast,
    });

    // Rolled back
    expect(peopleHolder.value[0].assignments[0].roleOnProjectId).toBe(null);
    expect(peopleHolder.value[0].assignments[0].roleName).toBe(null);
    expect(asnHolder.value[0].roleOnProjectId).toBe(null);
    expect(asnHolder.value[0].roleName).toBe(null);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Failed to update role'), 'error');
  });
});

