import React from 'react';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useVerticals } from '@/hooks/useVerticals';
import Select from '@/components/ui/Select';

type Props = {
  expand?: boolean;
};

export const GlobalVerticalFilter: React.FC<Props> = ({ expand = false }) => {
  const { state, setVertical, clearVertical } = useVerticalFilter();
  const { verticals, isLoading } = useVerticals();

  const value = state.selectedVerticalId ?? '';

  return (
    <div className={`flex min-w-0 items-center ${expand ? 'flex-1' : 'flex-none'}`}>
      <Select
        aria-label="Global vertical filter"
        value={value}
        onChange={(e) => {
          const next = (e.target as HTMLSelectElement).value;
          if (!next) {
            clearVertical();
            return;
          }
          setVertical(Number(next));
        }}
        disabled={isLoading}
        size="sm"
        className={`${expand ? 'min-w-[180px] flex-1' : 'w-[140px] sm:w-[190px]'}`}
      >
        <option value="">{isLoading ? 'Loading…' : 'All Verticals'}</option>
        {verticals.map((v) => (
          <option key={v.id} value={v.id ?? ''}>
            {v.shortName ? `${v.name} (${v.shortName})` : v.name}
          </option>
        ))}
      </Select>
    </div>
  );
};

export default GlobalVerticalFilter;
