import React from 'react';
import { useProjectRoles } from '@/hooks/useProjectRoles';
import { showToast } from '@/lib/toastBus';

const ProjectRolesSection: React.FC = () => {
  const { roles, isLoading, error, add, isAdding, refresh, remove, isRemoving } = useProjectRoles();
  const [value, setValue] = React.useState('');

  const submit = async () => {
    const v = value.trim();
    if (!v) return;
    await add(v);
    setValue('');
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-[var(--text)]">Project Roles</h2>
        <button
          onClick={() => { void refresh(); }}
          className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
        >Refresh</button>
      </div>
      <p className="text-[var(--muted)] text-sm mb-4">These roles power the autocomplete for role on project in Assignments and Project Assignments.</p>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={value}
          onChange={e => setValue((e.target as HTMLInputElement).value)}
          onKeyDown={e => { if ((e as any).key === 'Enter') submit(); }}
          placeholder="Add a role (e.g., Electrical Lead)"
          className="flex-1 px-3 py-2 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)] outline-none"
        />
        <button
          disabled={isAdding || !value.trim()}
          onClick={submit}
          className={`px-3 py-2 rounded text-sm border ${isAdding ? 'text-[var(--muted)] bg-[var(--surface)] border-[var(--border)]' : 'text-white bg-[var(--primary)] border-[var(--primary)] hover:bg-[var(--primaryHover)]'}`}
        >{isAdding ? 'Adding…' : 'Add'}</button>
      </div>

      {isLoading ? (
        <div className="text-[var(--muted)] text-sm">Loading roles…</div>
      ) : error ? (
        <div className="text-red-400 text-sm">Failed to load: {error.message}</div>
      ) : roles.length === 0 ? (
        <div className="text-[var(--muted)] text-sm">No roles yet. Add your first role above.</div>
      ) : (
        <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md bg-[var(--surface)]">
          {roles.map((r) => (
            <div key={r} className="flex items-center justify-between px-3 py-2">
              <div className="text-sm text-[var(--text)] truncate" title={r}>{r}</div>
              <div className="flex items-center gap-2">
                <button
                  className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                  disabled={isRemoving}
                  onClick={async () => {
                    // Optional confirm; prevents accidental mass cleanup
                    const ok = window.confirm(`Remove project role "${r}"? This clears it from all assignments using it.`);
                    if (!ok) return;
                    try {
                      await remove(r);
                      showToast('Project role removed', 'success');
                    } catch (e: any) {
                      showToast(e?.message || 'Failed to remove project role', 'error');
                    }
                  }}
                >Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectRolesSection;
