import React from 'react';

export interface TabItem {
  key: string;
  label: string;
  disabled?: boolean;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const Tabs: React.FC<TabsProps> = ({ items, value, onChange, className = '' }) => (
  <div role="tablist" className={`inline-flex rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 ${className}`}>
    {items.map((item) => {
      const active = item.key === value;
      return (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={active}
          aria-controls={`${item.key}-panel`}
          disabled={item.disabled}
          onClick={() => onChange(item.key)}
          className={[
            'rounded-[var(--radius-sm)] px-3 py-1.5 text-xs transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-focus-ring)]',
            active
              ? 'bg-[var(--color-action-primary)] text-white'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--surfaceHover)]',
            item.disabled ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {item.label}
        </button>
      );
    })}
  </div>
);

export default Tabs;
