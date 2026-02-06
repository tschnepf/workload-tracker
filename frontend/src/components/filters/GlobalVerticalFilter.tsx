import React from 'react';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useVerticals } from '@/hooks/useVerticals';

type Props = {
  expand?: boolean;
};

export const GlobalVerticalFilter: React.FC<Props> = ({ expand = false }) => {
  const { state, setVertical, clearVertical } = useVerticalFilter();
  const { verticals, isLoading } = useVerticals();

  const value = state.selectedVerticalId ?? '';

  return (
    <div className={`flex items-center ${expand ? 'min-w-0 flex-1' : 'flex-none'}`}>
      <select
        aria-label="Global vertical filter"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) {
            clearVertical();
            return;
          }
          setVertical(Number(next));
        }}
        disabled={isLoading}
        className={`bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded px-2 py-1 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus)] ${expand ? 'min-w-[140px]' : 'w-[110px] sm:w-[140px]'}`}
      >
        <option value="">{isLoading ? 'Loading…' : 'All Verticals'}</option>
        {verticals.map((v) => (
          <option key={v.id} value={v.id ?? ''}>
            {v.shortName ? `${v.name} (${v.shortName})` : v.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default GlobalVerticalFilter;
