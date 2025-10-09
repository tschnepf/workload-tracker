import React from 'react';
import { departmentsApi } from '@/services/api';
import { showToast } from '@/lib/toastBus';
import { useProjectRoles, useProjectRoleMutations } from '@/roles/hooks/useProjectRoles';

type Dept = { id?: number; name: string };

const DepartmentProjectRolesSection: React.FC<{ enabled: boolean; isAdmin: boolean }> = ({ enabled, isAdmin }) => {
  const [departments, setDepartments] = React.useState<Dept[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [selectedDeptId, setSelectedDeptId] = React.useState<number | null>(null);
  const [newRole, setNewRole] = React.useState<string>('');

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

  const [showInactive, setShowInactive] = React.useState<boolean>(false);
  const { data: roles = [], refetch, isLoading: rolesLoading } = useProjectRoles(selectedDeptId ?? undefined, { includeInactive: showInactive });
  const { create, remove, update } = useProjectRoleMutations();
  const canMutate =  !!isAdmin; 

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
        <label className="ml-2 flex items-center gap-2 text-sm text-[var(--muted)]">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive((e.target as HTMLInputElement).checked)} />
          Show inactive
        </label>
      </div>

      <div className="mb-4">
        {rolesLoading ? (
          <div className="text-[var(--muted)] text-sm">Loading roles...</div>
        ) : roles.length === 0 ? (
          <div className="text-[var(--muted)] text-sm">No roles configured for this department.</div>
        ) : (
          <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md bg-[var(--surface)]">
            {roles.map(r => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2">
                <div className={`text-sm truncate ${r.is_active ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`} title={r.name}>{r.name}</div>
                {canMutate && (
                  r.is_active ? (
                    <button
                      aria-label={`Deactivate ${r.name}`}
                      title="Deactivate role (hide from selectors)"
                      className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                      onClick={async () => {
                        if (!selectedDeptId) return;
                        const ok = window.confirm(`Deactivate \"${r.name}\"? It will be hidden from selectors.`);
                        if (!ok) return;
                        try {
                          await remove.mutateAsync({ id: r.id });
                          if (!showInactive) {
                            // If not showing inactive, it will disappear on next render automatically
                          }
                          showToast('Role deactivated', 'success');
                        } catch (e: any) {
                          showToast(e?.message || 'Failed to deactivate role', 'error');
                        }
                      }}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      aria-label={`Activate ${r.name}`}
                      title="Activate role (show in selectors)"
                      className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                      onClick={async () => {
                        try {
                          await update.mutateAsync({ id: r.id, isActive: true });
                          showToast('Role activated', 'success');
                        } catch (e: any) {
                          showToast(e?.message || 'Failed to activate role', 'error');
                        }
                      }}
                    >
                      Activate
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
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
    </div>
  );
};

export default DepartmentProjectRolesSection;

