import React from 'react';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useVerticals } from '@/hooks/useVerticals';
import Select from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import { isAdminOrManager } from '@/utils/roleAccess';

type Props = {
  expand?: boolean;
};

export const GlobalVerticalFilter: React.FC<Props> = ({ expand = false }) => {
  const { state, setVertical, clearVertical } = useVerticalFilter();
  const { verticals, isLoading } = useVerticals();
  const auth = useAuth();
  const canViewAllVerticals = isAdminOrManager(auth.user);
  const forcedVerticalId = !canViewAllVerticals && verticals.length === 1 && verticals[0]?.id != null
    ? Number(verticals[0].id)
    : null;
  const isForcedVertical = forcedVerticalId != null;

  React.useEffect(() => {
    if (!isForcedVertical) return;
    if (state.selectedVerticalId === forcedVerticalId) return;
    setVertical(forcedVerticalId);
  }, [forcedVerticalId, isForcedVertical, setVertical, state.selectedVerticalId]);

  const value = isForcedVertical ? forcedVerticalId : (state.selectedVerticalId ?? '');

  return (
    <div className={`flex min-w-0 items-center ${expand ? 'flex-1' : 'flex-none'}`}>
      <Select
        aria-label="Global vertical filter"
        value={value}
        onChange={(e) => {
          if (isForcedVertical) return;
          const next = (e.target as HTMLSelectElement).value;
          if (!next) {
            clearVertical();
            return;
          }
          setVertical(Number(next));
        }}
        disabled={isLoading || isForcedVertical}
        size="sm"
        className={`${expand ? 'min-w-[180px] flex-1 h-10' : 'w-[140px] sm:w-[190px] h-10'}`}
      >
        {!isForcedVertical ? (
          <option value="">{isLoading ? 'Loading…' : 'All Verticals'}</option>
        ) : null}
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
