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

  // Keep selected person in sync when the backing list updates
  // This ensures detail panel reflects optimistic updates and refetches.
  useEffect(() => {
    if (!selectedPerson) return;
    const idx = people.findIndex(p => p.id === selectedPerson.id);
    if (idx !== -1) {
      const personFromList = people[idx];
      // Replace reference if list has a newer object (shallow identity change)
      if (personFromList !== selectedPerson) {
        setSelectedPerson(personFromList);
        setSelectedIndex(idx);
      }
    }
  }, [people]);

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
