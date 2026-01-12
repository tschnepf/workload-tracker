import React from 'react';
import { departmentsApi } from '@/services/api';
import { showToast } from '@/lib/toastBus';
import { useProjectRoles, useProjectRoleMutations } from '@/roles/hooks/useProjectRoles';
import { reorderProjectRoles, getProjectRoleUsage, clearProjectRoleAssignments, ProjectRole, ProjectRoleUsage } from '@/roles/api';
import SortableList from '@/components/common/SortableList';
import Modal from '@/components/ui/Modal';

type Dept = { id?: number; name: string };

const DepartmentProjectRolesSection: React.FC<{ enabled: boolean; isAdmin: boolean }> = ({ enabled, isAdmin }) => {
  const [departments, setDepartments] = React.useState<Dept[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [selectedDeptId, setSelectedDeptId] = React.useState<number | null>(null);
  const [newRole, setNewRole] = React.useState<string>('');
  const [usageRole, setUsageRole] = React.useState<ProjectRole | null>(null);
  const [usageData, setUsageData] = React.useState<ProjectRoleUsage | null>(null);
  const [usageLoading, setUsageLoading] = React.useState<boolean>(false);
  const [usageError, setUsageError] = React.useState<string | null>(null);
  const [clearingAssignments, setClearingAssignments] = React.useState<boolean>(false);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const list = await departmentsApi.listAll();
        if (!mounted) return;
        setDepartments(list || []);
        if (selectedDeptId == null && list && list.length) {
          setSelectedDeptId(list[0]?.id ?? null);
        }
      } catch (e: any) {
        showToast(e?.message || 'Failed to load departments', 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const { data: roles = [], refetch, isLoading: rolesLoading } = useProjectRoles(selectedDeptId ?? undefined, { includeInactive: false });
  const { create, remove } = useProjectRoleMutations();
  const canMutate =  !!isAdmin; 

  const openUsageModal = async (role: ProjectRole) => {
    setUsageRole(role);
    setUsageData(null);
    setUsageError(null);
    setUsageLoading(true);
    try {
      const data = await getProjectRoleUsage(role.id);
      setUsageData(data);
    } catch (e: any) {
      setUsageError(e?.message || 'Failed to load role usage.');
    } finally {
      setUsageLoading(false);
    }
  };

  const closeUsageModal = () => {
    setUsageRole(null);
    setUsageData(null);
    setUsageError(null);
    setUsageLoading(false);
    setClearingAssignments(false);
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-[var(--text)]">Department Project Roles</h2>
        <button onClick={() => { void refetch(); }} className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]">Refresh</button>
      </div>

      {!enabled && (
        <div className="mb-4 text-[var(--muted)] text-sm">Feature is disabled by backend. Ask an admin to enable PROJECT_ROLES_BY_DEPARTMENT.</div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-[var(--muted)]">Department</label>
        <select className="min-w-[220px] bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 min-h-[36px] focus:border-[var(--primary)]" value={selectedDeptId ?? ''} onChange={(e) => setSelectedDeptId(e.target.value ? Number(e.target.value) : null)}>
          {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
      </div>

      <div className="mb-4">
        {rolesLoading ? (
          <div className="text-[var(--muted)] text-sm">Loading roles...</div>
        ) : roles.length === 0 ? (
          <div className="text-[var(--muted)] text-sm">No roles configured for this department.</div>
        ) : (
          <SortableList
            items={roles.map(r => ({ id: r.id, label: r.name }))}
            onReorder={async (orderedIds) => {
              try {
                if (!selectedDeptId) return;
                await reorderProjectRoles(selectedDeptId, orderedIds);
                showToast('Order saved', 'success');
                await refetch();
              } catch (e: any) {
                showToast(e?.message || 'Failed to save order', 'error');
              }
            }}
            disabled={!canMutate}
            renderActions={(id) => {
              const r = roles.find(x => x.id === id);
              if (!r || !canMutate) return null;
              return (
                <button
                  aria-label={`Delete ${r.name}`}
                  title="Delete role permanently"
                  className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                  onClick={async () => {
                    if (!selectedDeptId) return;
                    const ok = window.confirm(`Delete \"${r.name}\" permanently? This will fail if the role is referenced by any assignments.`);
                    if (!ok) return;
                    try {
                      await remove.mutateAsync({ id: r.id });
                      showToast('Role deleted', 'success');
                    } catch (e: any) {
                      if (e?.status === 409) {
                        await openUsageModal(r);
                        return;
                      }
                      showToast(e?.message || 'Failed to delete role (it may be referenced)', 'error');
                    }
                  }}
                >
                  Delete
                </button>
              );
            }}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newRole}
          disabled={!canMutate}
          onChange={e => setNewRole((e.target as HTMLInputElement).value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!canMutate || !selectedDeptId) return;
              const v = newRole.trim();
              if (!v) return;
              try {
                await create.mutateAsync({ departmentId: selectedDeptId, name: v });
                setNewRole('');
                showToast('Role added to department', 'success');
              } catch {}
            }
          }}
          placeholder="Add role name (e.g., Electrical Lead)"
          className="flex-1 px-3 py-2 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)] outline-none"
        />
        <button
          disabled={!canMutate || !newRole.trim() || !selectedDeptId || create.isPending}
          onClick={async () => {
            if (!canMutate || !selectedDeptId) return;
            const v = newRole.trim();
            if (!v) return;
            try {
              await create.mutateAsync({ departmentId: selectedDeptId, name: v });
              setNewRole('');
              showToast('Role added to department', 'success');
            } catch {}
          }}
          className={`px-3 py-2 rounded text-sm border ${create.isPending ? 'text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]' : 'text-white bg-[var(--primary)] border-[var(--primary)] hover:bg-[var(--primaryHover)]'}`}
        >{create.isPending ? 'Adding...' : 'Add'}</button>
      </div>

      <Modal
        isOpen={!!usageRole}
        onClose={closeUsageModal}
        title={usageRole ? `Role in Use: ${usageRole.name}` : 'Role in Use'}
        width={720}
      >
        <div className="space-y-4">
          <div className="text-sm text-[var(--muted)]">
            This role is assigned to existing project assignments. You can clear those assignments and delete the role.
          </div>

          {usageLoading ? (
            <div className="text-sm text-[var(--muted)]">Loading usage…</div>
          ) : usageError ? (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded">{usageError}</div>
          ) : (
            <div className="border border-[var(--border)] rounded">
              <div className="px-3 py-2 text-xs text-[var(--muted)] border-b border-[var(--border)] bg-[var(--surfaceHover)]">
                {usageData?.count ?? 0} assignment(s) using this role
              </div>
              <div className="max-h-[320px] overflow-auto divide-y divide-[var(--border)]">
                {(usageData?.assignments || []).map((item) => (
                  <div key={item.id} className="px-3 py-2 text-sm">
                    <div className="font-medium text-[var(--text)]">{item.project?.name || 'Unknown Project'}</div>
                    <div className="text-[var(--muted)]">{item.person?.name || 'Unknown Person'} · Assignment #{item.id}</div>
                  </div>
                ))}
                {(usageData?.assignments || []).length === 0 && (
                  <div className="px-3 py-3 text-sm text-[var(--muted)]">No assignments found.</div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={closeUsageModal}
              className="px-3 py-2 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
              disabled={clearingAssignments}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!usageRole) return;
                try {
                  setClearingAssignments(true);
                  const res = await clearProjectRoleAssignments(usageRole.id);
                  await remove.mutateAsync({ id: usageRole.id });
                  showToast(`Cleared ${res.cleared} assignment(s) and deleted role`, 'success');
                  closeUsageModal();
                  await refetch();
                } catch (e: any) {
                  setUsageError(e?.message || 'Failed to clear assignments or delete the role.');
                } finally {
                  setClearingAssignments(false);
                }
              }}
              className={`px-3 py-2 rounded text-sm border ${clearingAssignments ? 'text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]' : 'text-white bg-red-500 border-red-500 hover:bg-red-600'}`}
              disabled={clearingAssignments || usageLoading}
            >
              {clearingAssignments ? 'Clearing…' : 'Clear Assignments & Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DepartmentProjectRolesSection;
