import React from 'react';
import type { Department } from '@/types/models';

export interface BulkActionsBarProps {
  visible: boolean;
  selectedCount: number;
  departments: Department[];
  bulkDepartment: string;
  setBulkDepartment: React.Dispatch<React.SetStateAction<string>>;
  onApply: () => Promise<void> | void;
  onClear: () => void;
}

export default function BulkActionsBar(props: BulkActionsBarProps) {
  const { visible, selectedCount, departments, bulkDepartment, setBulkDepartment, onApply, onClear } = props;
  if (!visible) return null;

  return (
    <div className="p-3 border-t border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--text)] font-medium">Assign {selectedCount} people to:</span>
        <select
          value={bulkDepartment}
          onChange={(e) => setBulkDepartment(e.target.value)}
          className="px-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[var(--focus)] focus:outline-none"
        >
          <option value="">Select Department...</option>
          <option value="unassigned">Remove from Department</option>
          {departments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </select>
        <button
          onClick={onApply}
          disabled={!bulkDepartment}
          className="px-3 py-1.5 text-sm rounded bg-[var(--primary)] text-white hover:bg-[var(--primaryHover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Assign
        </button>
        <button
          onClick={onClear}
          className="px-3 py-1.5 text-sm rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
}
