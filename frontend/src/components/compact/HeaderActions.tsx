import React from 'react';

interface Props {
  onExpandAll: () => void | Promise<void>;
  onCollapseAll: () => void;
  onRefreshAll: () => void;
  disabled?: boolean;
}

const HeaderActions: React.FC<Props> = ({ onExpandAll, onCollapseAll, onRefreshAll, disabled }) => {
  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        className={`px-2 py-0.5 rounded border ${disabled ? 'text-[var(--muted)] cursor-wait' : 'text-[var(--muted)] hover:text-[var(--text)]'} border-[var(--border)]`}
        onClick={onExpandAll}
        aria-busy={disabled}
        disabled={disabled}
      >
        Expand All
      </button>
      <button
        className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
        onClick={onCollapseAll}
      >
        Collapse All
      </button>
      <button
        className={`px-2 py-0.5 rounded border ${disabled ? 'text-[var(--muted)] cursor-wait' : 'text-[var(--muted)] hover:text-[var(--text)]'} border-[var(--border)]`}
        onClick={onRefreshAll}
        aria-busy={disabled}
        disabled={disabled}
      >
        Refresh All
      </button>
    </div>
  );
};

export default HeaderActions;

