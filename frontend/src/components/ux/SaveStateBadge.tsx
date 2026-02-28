import React from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type SaveStateBadgeProps = {
  state: SaveState;
  message?: string;
  onRetry?: () => void;
  className?: string;
};

const STATE_LABELS: Record<SaveState, string> = {
  idle: 'Idle',
  saving: 'Saving...',
  saved: 'Saved',
  error: 'Save failed',
};

const STATE_CLASSES: Record<SaveState, string> = {
  idle: 'border-[var(--border)] text-[var(--muted)] bg-[var(--surface)]',
  saving: 'border-amber-500/40 text-amber-200 bg-amber-500/10',
  saved: 'border-emerald-500/40 text-emerald-200 bg-emerald-500/10',
  error: 'border-red-500/40 text-red-200 bg-red-500/10',
};

const SaveStateBadge: React.FC<SaveStateBadgeProps> = ({ state, message, onRetry, className }) => {
  const label = message || STATE_LABELS[state];
  return (
    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-xs ${STATE_CLASSES[state]} ${className || ''}`.trim()}>
      <span>{label}</span>
      {state === 'error' && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="px-1.5 py-0.5 rounded border border-current/40 text-[11px] hover:bg-white/10"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
};

export default SaveStateBadge;
