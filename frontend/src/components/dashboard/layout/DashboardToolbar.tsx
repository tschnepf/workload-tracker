import * as React from 'react';

type Props = {
  unlocked: boolean;
  canUnlock: boolean;
  selectedCount: number;
  canSplitSelected: boolean;
  onToggleUnlock: () => void;
  onGroupSelected: () => void;
  onSplitSelected: () => void;
  onResetLayout: () => void;
};

const DashboardToolbar: React.FC<Props> = ({
  unlocked,
  canUnlock,
  selectedCount,
  canSplitSelected,
  onToggleUnlock,
  onGroupSelected,
  onSplitSelected,
  onResetLayout,
}) => {
  const hasSelection = selectedCount > 0;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onToggleUnlock}
        aria-pressed={unlocked}
        disabled={!canUnlock}
      >
        {unlocked ? 'Lock Dashboard' : 'Unlock Dashboard'}
      </button>

      <button
        type="button"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onGroupSelected}
        disabled={!unlocked || selectedCount < 2}
      >
        Group selected
      </button>

      <button
        type="button"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onSplitSelected}
        disabled={!unlocked || !canSplitSelected}
      >
        Split group
      </button>

      <button
        type="button"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surfaceHover)]"
        onClick={onResetLayout}
      >
        Reset layout
      </button>

      {unlocked ? (
        <span className="text-xs text-[var(--muted)]" aria-live="polite">
          {hasSelection ? `${selectedCount} selected` : 'Select cards, then group or split.'}
        </span>
      ) : null}

      {!canUnlock ? (
        <span className="text-xs text-[var(--muted)]">Rearranging is available on tablet/desktop.</span>
      ) : null}
    </div>
  );
};

export default DashboardToolbar;
