import React from 'react';

export interface AutocompleteDropdownProps<T> {
  visible: boolean;
  options: T[];
  selectedIndex: number;
  onSelect: (opt: T, index: number) => void;
  onHover: (index: number) => void;
  renderOption: (opt: T) => React.ReactNode;
}

export default function AutocompleteDropdowns<T>(props: AutocompleteDropdownProps<T>) {
  const { visible, options, selectedIndex, onSelect, onHover, renderOption } = props;
  if (!visible || options.length === 0) return null;

  return (
    <div
      className="absolute top-full left-0 right-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg z-50 max-h-40 overflow-y-auto"
      role="listbox"
      aria-label="Autocomplete options"
    >
      {options.map((opt, index) => (
        <button
          key={index}
          onClick={() => onSelect(opt, index)}
          onMouseEnter={() => onHover(index)}
          role="option"
          aria-selected={selectedIndex === index}
          className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-[var(--border)] last:border-b-0 ${
            selectedIndex === index
              ? 'bg-[var(--surfaceHover)] text-[var(--text)] border-[var(--primary)]'
              : 'text-[var(--text)] hover:bg-[var(--surface)]'
          }`}
        >
          {renderOption(opt)}
        </button>
      ))}
    </div>
  );
}
