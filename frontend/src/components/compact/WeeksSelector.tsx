import React from 'react';

interface Props {
  value: number;
  onChange: (n: number) => void;
  options?: number[];
}

const WeeksSelector: React.FC<Props> = ({ value, onChange, options = [8, 12, 16, 20, 26, 52] }) => {
  return (
    <div role="group" aria-label="Weeks selector" className="flex items-center gap-1 text-xs min-w-0">
      <span className="text-[var(--muted)] shrink-0">Weeks</span>
      <div className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1 pb-1 scrollbar-theme">
        {options.map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`shrink-0 px-2 py-0.5 rounded border ${
              value === n
                ? 'border-[var(--primary)] text-[var(--text)] bg-[var(--surfaceHover)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
            aria-pressed={value === n}
            aria-label={`Show ${n} weeks`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
};

export default WeeksSelector;
