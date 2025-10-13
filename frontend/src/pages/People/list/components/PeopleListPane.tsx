import React from 'react';
import PeopleListTable from '@/pages/People/list/components/PeopleListTable';
import type { Person } from '@/types/models';

type Column = 'name' | 'location' | 'department' | 'weeklyCapacity' | 'role';

export interface PeopleListPaneProps {
  items: Person[];
  bulkMode: boolean;
  selectedPersonId: number | null;
  selectedPeopleIds: Set<number>;
  onRowClick: (person: Person, index: number) => void;
  onToggleSelect: (id: number, checked: boolean) => void;
  sortBy: Column;
  sortDirection: 'asc' | 'desc';
  onColumnSort: (c: Column) => void;
  hasMore: boolean;
  onLoadMore: () => void;
}

export default function PeopleListPane(props: PeopleListPaneProps) {
  const {
    items,
    bulkMode,
    selectedPersonId,
    selectedPeopleIds,
    onRowClick,
    onToggleSelect,
    sortBy,
    sortDirection,
    onColumnSort,
    hasMore,
    onLoadMore,
  } = props;

  const SortableHeader = ({ column, children, className = '' }: { column: Column; children: React.ReactNode; className?: string }) => (
    <button onClick={() => onColumnSort(column)} className={`flex items-center gap-1 text-left hover:text-[var(--text)] transition-colors ${className}`}>
      {children}
      {sortBy === column && (
        <svg className={`w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="flex-1 overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-xs text-[var(--muted)] font-medium border-b border-[var(--border)] bg-[var(--card)]">
        {bulkMode && <div className="col-span-1">SELECT</div>}
        <div className={bulkMode ? 'col-span-3' : 'col-span-3'}>
          <SortableHeader column="name">NAME</SortableHeader>
        </div>
        <div className={bulkMode ? 'col-span-2' : 'col-span-2'}>
          <SortableHeader column="department">DEPARTMENT</SortableHeader>
        </div>
        <div className={bulkMode ? 'col-span-2' : 'col-span-2'}>
          <SortableHeader column="location">LOCATION</SortableHeader>
        </div>
        <div className={bulkMode ? 'col-span-2' : 'col-span-2'}>
          <SortableHeader column="weeklyCapacity">CAPACITY</SortableHeader>
        </div>
        <div className={bulkMode ? 'col-span-2' : 'col-span-3'}>
          <SortableHeader column="role">ROLE</SortableHeader>
        </div>
      </div>

      <PeopleListTable
        items={items}
        bulkMode={bulkMode}
        selectedPersonId={selectedPersonId}
        selectedPeopleIds={selectedPeopleIds}
        onRowClick={onRowClick}
        onToggleSelect={onToggleSelect}
      />

      {hasMore && (
        <div className="p-2 flex justify-center">
          <button onClick={onLoadMore} className="px-3 py-1 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]">Load more</button>
        </div>
      )}
    </div>
  );
}
