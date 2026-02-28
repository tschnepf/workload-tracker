import React from 'react';

interface Props {
  options: readonly string[];
  selected: Set<string>;
  format: (s: string) => string;
  onToggle: (s: string) => void;
  compact?: boolean;
  compactLabels?: Record<string, string>;
}

const StatusFilterChips: React.FC<Props> = ({ options, selected, format, onToggle, compact = false, compactLabels }) => {
  const showAllActive = selected.size === 0 || selected.has('Show All');
  return (
    <div className={`${compact ? 'flex items-center gap-1 min-w-0 whitespace-nowrap' : 'flex flex-wrap items-center gap-1 min-w-0'}`} aria-label="Status filters">
      {options.map((status) => {
        const isActive = status === 'Show All' ? showAllActive : selected.has(status);
        const label = format(status);
        const compactLabel = compactLabels?.[label] ?? compactLabels?.[status];
        const displayLabel = compact && compactLabel ? compactLabel : label;
        return (
          <button
            key={status}
            onClick={() => onToggle(status)}
            className={`px-2 py-0.5 text-xs rounded border transition-colors ${
              isActive
                ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
            }`}
            aria-pressed={isActive}
            aria-label={`Filter: ${label}`}
            title={label}
          >
            {displayLabel}
          </button>
        );
      })}
    </div>
  );
};

export default StatusFilterChips;
