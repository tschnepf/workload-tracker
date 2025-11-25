import React from 'react';
import Modal from '@/components/ui/Modal';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import type { Person, Assignment } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';

type Props = {
  target: { personId: number; assignmentId: number } | null;
  people: Person[];
  weeks: WeekHeader[];
  onClose: () => void;
  onSaveHours: (personId: number, assignmentId: number, week: string, hours: number) => Promise<void>;
  onRoleChange: (personId: number, assignmentId: number, roleId: number | null, roleName: string | null) => Promise<void> | void;
  loadingAssignments: Set<number>;
  canEditAssignments: boolean;
};

const MobileAssignmentSheet: React.FC<Props> = ({
  target,
  people,
  weeks,
  onClose,
  onSaveHours,
  onRoleChange,
  loadingAssignments,
  canEditAssignments,
}) => {
  const person = React.useMemo(() => {
    if (!target) return null;
    return people.find((p) => p.id === target.personId) ?? null;
  }, [target, people]);

  const assignment = React.useMemo(() => {
    if (!person || !target) return null;
    const list = (person as any).assignments as Assignment[] | undefined;
    return list?.find((a) => a.id === target.assignmentId) ?? null;
  }, [person, target]);

  const [localHours, setLocalHours] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { data: roleOptions = [] } = useProjectRoles(person?.department ?? null, { includeInactive: true });

  React.useEffect(() => {
    if (!assignment) return;
    const next: Record<string, string> = {};
    weeks.forEach((week) => {
      const hours = assignment.weeklyHours?.[week.date] ?? 0;
      next[week.date] = String(hours);
    });
    setLocalHours(next);
  }, [assignment, weeks]);

  if (!target || !person || loadingAssignments.has(target.personId)) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditAssignments) {
      onClose();
      return;
    }
    if (!assignment) return;
    setSaving(true);
    setError(null);
    try {
      for (const week of weeks) {
        const initial = assignment.weeklyHours?.[week.date] ?? 0;
        const next = parseFloat(localHours[week.date] ?? '0');
        if (!Number.isFinite(next)) continue;
        if (next !== initial) {
          await onSaveHours(person.id!, assignment.id!, week.date, next);
        }
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!assignment) return;
    const nextId = event.target.value ? Number(event.target.value) : null;
    const roleName = roleOptions.find((r) => r.id === nextId)?.name ?? null;
    await onRoleChange(person.id!, assignment.id!, nextId, roleName);
  };

  return (
    <Modal
      isOpen={Boolean(target)}
      onClose={onClose}
      title={`Edit ${person.name}`}
      width={420}
    >
      {!assignment ? (
        <div className="text-sm text-[var(--muted)]">Loading assignment…</div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Project</label>
            <div className="text-sm font-medium text-[var(--text)]">{assignment.projectDisplayName || `Project ${assignment.project}`}</div>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Role on Project</label>
            <select
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm"
              value={assignment.roleOnProjectId ?? ''}
              onChange={handleRoleChange}
              disabled={!canEditAssignments}
            >
              <option value="">Unassigned</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
            {weeks.map((week) => (
              <label key={week.date} className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted)]">{week.display}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className="w-24 ml-3 border border-[var(--border)] rounded px-2 py-1 bg-[var(--surface)] text-[var(--text)]"
                  value={localHours[week.date] ?? ''}
                  onChange={(e) => setLocalHours((prev) => ({ ...prev, [week.date]: e.target.value }))}
                  disabled={!canEditAssignments}
                  readOnly={!canEditAssignments}
                />
              </label>
            ))}
          </div>
          {error ? <div className="text-sm text-red-300">{error}</div> : null}
          {!canEditAssignments && (
            <div className="text-xs text-[var(--muted)]">Editing is disabled for your role. Contact an administrator if you need access.</div>
          )}
          <div className="flex justify-between gap-2 pt-2">
            <button type="button" className="px-3 py-1 rounded border border-[var(--border)] text-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-[var(--primary)] text-white text-sm disabled:opacity-60"
              disabled={saving || !canEditAssignments}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default MobileAssignmentSheet;
