import React from 'react';
import Modal from '@/components/ui/Modal';
import type { Assignment } from '@/types/models';
import type { WeekHeader } from '@/pages/Assignments/grid/utils';

type Props = {
  assignment: Assignment | null;
  weeks: WeekHeader[];
  onClose: () => void;
  onSaveHours: (assignmentId: number, week: string, hours: number) => Promise<void>;
  canEditAssignments: boolean;
};

const MobileProjectAssignmentSheet: React.FC<Props> = ({
  assignment,
  weeks,
  onClose,
  onSaveHours,
  canEditAssignments,
}) => {
  const [localHours, setLocalHours] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!assignment) return;
    const next: Record<string, string> = {};
    weeks.forEach((week) => {
      const hours = assignment.weeklyHours?.[week.date] ?? 0;
      next[week.date] = String(hours);
    });
    setLocalHours(next);
  }, [assignment, weeks]);

  if (!assignment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditAssignments) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const week of weeks) {
        const initial = assignment.weeklyHours?.[week.date] ?? 0;
        const next = parseFloat(localHours[week.date] ?? '0');
        if (!Number.isFinite(next)) continue;
        if (next !== initial) {
          await onSaveHours(assignment.id!, week.date, next);
        }
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(assignment)}
      onClose={onClose}
      title={`${assignment.personName || 'Placeholder'} - ${assignment.projectDisplayName || `Project ${assignment.project}`}`}
      width={420}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">Role on Project</label>
          <div className="text-sm text-[var(--text)]">{assignment.roleName || 'Unassigned role'}</div>
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
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default MobileProjectAssignmentSheet;
