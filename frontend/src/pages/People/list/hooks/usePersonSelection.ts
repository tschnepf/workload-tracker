import { useEffect, useState } from 'react';
import type { Person } from '@/types/models';

export interface UsePersonSelectionOptions {
  autoSelectFirst?: boolean;
}

export function usePersonSelection(people: Person[], options: UsePersonSelectionOptions = {}) {
  const { autoSelectFirst = true } = options;
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Initial auto-select behavior
  useEffect(() => {
    if (autoSelectFirst && !selectedPerson && people.length > 0) {
      setSelectedPerson(people[0]);
      setSelectedIndex(0);
    }
  }, [autoSelectFirst, people, selectedPerson]);

  const selectByIndex = (index: number) => {
    if (index < 0 || index >= people.length) return;
    setSelectedPerson(people[index]);
    setSelectedIndex(index);
  };

  const onRowClick = (person: Person, index: number) => {
    setSelectedPerson(person);
    setSelectedIndex(index);
  };

  return {
    selectedPerson,
    selectedIndex,
    onRowClick,
    selectByIndex,
    setSelectedPerson,
    setSelectedIndex,
  };
}

export type UsePersonSelectionReturn = ReturnType<typeof usePersonSelection>;

