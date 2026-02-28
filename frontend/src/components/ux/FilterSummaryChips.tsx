import React from 'react';

export type FilterSummaryItem = {
  id: string;
  label: string;
  onRemove?: () => void;
};

export type FilterSummaryChipsProps = {
  items: FilterSummaryItem[];
  onClearAll?: () => void;
  emptyLabel?: string;
  className?: string;
};

const FilterSummaryChips: React.FC<FilterSummaryChipsProps> = ({
  items,
  onClearAll,
  emptyLabel = 'No active filters',
  className,
}) => {
  if (items.length === 0) {
    return <div className={`text-xs text-[var(--muted)] ${className || ''}`.trim()}>{emptyLabel}</div>;
  }

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className || ''}`.trim()} aria-label="Active filters">
      {items.map((item) => (
        <span
          key={item.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[11px] text-[var(--text)]"
        >
          <span>{item.label}</span>
          {item.onRemove ? (
            <button
              type="button"
              className="text-[var(--muted)] hover:text-[var(--text)]"
              onClick={item.onRemove}
              aria-label={`Remove ${item.label}`}
            >
              x
            </button>
          ) : null}
        </span>
      ))}
      {onClearAll ? (
        <button
          type="button"
          className="px-2 py-0.5 rounded border border-[var(--border)] text-[11px] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
          onClick={onClearAll}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
};

export default FilterSummaryChips;
