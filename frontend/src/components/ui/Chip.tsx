import React from 'react';

interface ChipProps {
  children: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
}

const toneMap: Record<NonNullable<ChipProps['tone']>, string> = {
  default: 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)]',
  primary: 'border-[var(--color-action-primary)] bg-[var(--color-surface-overlay)] text-[var(--color-text-primary)]',
  success: 'border-[var(--color-state-success)] bg-[color:color-mix(in_srgb,var(--color-state-success)_18%,transparent)] text-[var(--color-text-primary)]',
  warning: 'border-[var(--color-state-warning)] bg-[color:color-mix(in_srgb,var(--color-state-warning)_18%,transparent)] text-[var(--color-text-primary)]',
  danger: 'border-[var(--color-state-danger)] bg-[color:color-mix(in_srgb,var(--color-state-danger)_18%,transparent)] text-[var(--color-text-primary)]',
};

const Chip: React.FC<ChipProps> = ({ children, tone = 'default', removable = false, onRemove, className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${toneMap[tone]} ${className}`}>
      <span className="max-w-[200px] truncate">{children}</span>
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          aria-label="Remove"
        >
          ×
        </button>
      ) : null}
    </span>
  );
};

export default Chip;
