import { useState } from 'react';

export function useBulkActions() {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<Set<number>>(new Set());
  const [bulkDepartment, setBulkDepartment] = useState<string>('');

  const clearSelection = () => setSelectedPeopleIds(new Set());

  const toggleBulkMode = () => {
    setBulkMode(v => !v);
    clearSelection();
  };

  return {
    bulkMode,
    setBulkMode,
    selectedPeopleIds,
    setSelectedPeopleIds,
    bulkDepartment,
    setBulkDepartment,
    clearSelection,
    toggleBulkMode,
  };
}

export type UseBulkActionsReturn = ReturnType<typeof useBulkActions>;

