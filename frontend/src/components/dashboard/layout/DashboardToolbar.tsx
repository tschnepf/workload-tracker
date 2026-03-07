import * as React from 'react';

type Props = {
  unlocked: boolean;
  canUnlock: boolean;
  onToggleUnlock: () => void;
  onResetLayout: () => void;
};

const DashboardToolbar: React.FC<Props> = ({
  unlocked,
  canUnlock,
  onToggleUnlock,
  onResetLayout,
}) => {
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
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surfaceHover)]"
        onClick={onResetLayout}
      >
        Reset layout
      </button>

      {!canUnlock ? (
        <span className="text-xs text-[var(--muted)]">Rearranging is available on tablet/desktop.</span>
      ) : unlocked ? (
        <span className="text-xs text-[var(--muted)]">Drag cards by handle and resize from the bottom-right corner.</span>
      ) : null}
    </div>
  );
};

export default DashboardToolbar;
