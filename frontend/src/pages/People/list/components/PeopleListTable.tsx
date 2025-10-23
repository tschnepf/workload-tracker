import React, { useMemo, useRef } from 'react';
import type { Person } from '@/types/models';
import { useVirtualizer } from '@tanstack/react-virtual';

type Props = {
  items: Person[];
  bulkMode: boolean;
  selectedPersonId: number | null;
  selectedPeopleIds: Set<number>;
  onRowClick: (person: Person, index: number) => void;
  onToggleSelect: (personId: number, checked: boolean) => void;
  assignmentCounts?: Record<number, number>;
};

const PeopleListTable: React.FC<Props> = ({
  items,
  bulkMode,
  selectedPersonId,
  selectedPeopleIds,
  onRowClick,
  onToggleSelect,
  assignmentCounts,
}) => {
  const listParentRef = useRef<HTMLDivElement | null>(null);
  const enableVirtual = items.length > 200;

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 44,
    overscan: 6,
  });

  const content = useMemo(() => {
    if (items.length === 0) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center text-[var(--muted)]">
            <div className="text-lg mb-2">No people found</div>
            <div className="text-sm">Try adjusting your search or create a new person</div>
          </div>
        </div>
      );
    }

    if (enableVirtual) {
      return (
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((v) => {
            const index = v.index;
            const person = items[index];
            if (!person) return null;
            return (
              <div
                key={person.id ?? index}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
                onClick={bulkMode ? undefined : () => onRowClick(person, index)}
                className={`grid grid-cols-13 gap-2 px-2 py-1.5 text-sm border-b border-[var(--border)] transition-colors focus:outline-none ${
                  bulkMode
                    ? 'hover:bg-[var(--surfaceHover)]'
                    : `cursor-pointer hover:bg-[var(--surfaceHover)] ${selectedPersonId === person.id ? 'bg-[var(--surfaceHover)] border-[var(--primary)]' : ''}`
                }`}
                tabIndex={0}
              >
                {bulkMode && (
                  <div className="col-span-1 flex items-center">
                    <input
                      type="checkbox"
                      checked={person.id ? selectedPeopleIds.has(person.id) : false}
                      onChange={(e) => person.id && onToggleSelect(person.id, e.target.checked)}
                      className="w-3 h-3 text-[var(--primary)] bg-[var(--surface)] border-[var(--border)] rounded focus:ring-[var(--focus)] focus:ring-2"
                    />
                  </div>
                )}
                <div className="col-span-3 text-[var(--text)] font-medium">{person.name}</div>
                <div className="col-span-2 text-[var(--muted)] text-xs">{person.departmentName || 'None'}</div>
                <div className="col-span-2 text-[var(--muted)] text-xs">{person.location || 'Not specified'}</div>
                <div className="col-span-2 text-[var(--muted)] text-xs">{person.weeklyCapacity || 36}h/week</div>
                <div className={`${bulkMode ? 'col-span-2' : 'col-span-3'} text-[var(--muted)] text-xs`}>{person.roleName || 'Not specified'}</div>
                <div className="col-span-1 text-[var(--muted)] text-xs text-right pr-1">{assignmentCounts?.[person.id!] ?? 0}</div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <>
        {items.map((person, index) => (
          <div
            key={person.id}
            onClick={bulkMode ? undefined : () => onRowClick(person, index)}
            className={`grid grid-cols-13 gap-2 px-2 py-1.5 text-sm border-b border-[var(--border)] transition-colors focus:outline-none ${
              bulkMode
                ? 'hover:bg-[var(--surfaceHover)]'
                : `cursor-pointer hover:bg-[var(--surfaceHover)] ${selectedPersonId === person.id ? 'bg-[var(--surfaceHover)] border-[var(--primary)]' : ''}`
            }`}
            tabIndex={0}
          >
            {bulkMode && (
              <div className="col-span-1 flex items-center">
                <input
                  type="checkbox"
                  checked={selectedPeopleIds.has(person.id!)}
                  onChange={(e) => onToggleSelect(person.id!, e.target.checked)}
                  className="w-3 h-3 text-[var(--primary)] bg-[var(--surface)] border-[var(--border)] rounded focus:ring-[var(--focus)] focus:ring-2"
                />
              </div>
            )}
            <div className="col-span-3 text-[var(--text)] font-medium">{person.name}</div>
            <div className="col-span-2 text-[var(--muted)] text-xs">{person.departmentName || 'None'}</div>
            <div className="col-span-2 text-[var(--muted)] text-xs">{person.location || 'Not specified'}</div>
            <div className="col-span-2 text-[var(--muted)] text-xs">{person.weeklyCapacity || 36}h/week</div>
            <div className={`${bulkMode ? 'col-span-2' : 'col-span-3'} text-[var(--muted)] text-xs`}>{person.roleName || 'Not specified'}</div>
            <div className="col-span-1 text-[var(--muted)] text-xs text-right pr-1">{assignmentCounts?.[person.id!] ?? 0}</div>
          </div>
        ))}
        {/* Buffer rows to prevent last person from being cut off */}
        <div className="py-1.5">
          <div className="py-1.5">
            <div className="py-1.5"></div>
          </div>
        </div>
      </>
    );
  }, [items, bulkMode, selectedPersonId, selectedPeopleIds, onRowClick, onToggleSelect, enableVirtual]);

  return (
    <div className="overflow-y-auto h-full bg-[var(--card)]" ref={listParentRef}>
      {content}
    </div>
  );
};

export default PeopleListTable;
