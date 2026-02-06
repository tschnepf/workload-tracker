import { useCallback, useMemo, useState, useEffect } from 'react';
import type { Person } from '@/types/models';
import { peopleApi, jobsApi } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';

interface PersonWithAvailability extends Person {
  availableHours?: number;
  utilizationPercent?: number;
  totalHours?: number;
  capacity?: number;
  skillMatchScore?: number;
  hasSkillMatch?: boolean;
}

interface Params {
  people: Person[];
  availabilityMap: Record<number, { availableHours: number; utilizationPercent: number; totalHours: number; capacity: number }>;
  deptState: { selectedDepartmentId?: number | null; includeChildren?: boolean } | null | undefined;
  candidatesOnly: boolean;
  caps: { data?: { asyncJobs?: boolean } | null };
  vertical?: number | null;
}

export function usePersonSearch({ people, availabilityMap, deptState, candidatesOnly, caps, vertical }: Params) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<PersonWithAvailability[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [srAnnouncement, setSrAnnouncement] = useState('');

  const debounced = useDebounce(text, 300);

  const areResultsEqual = (a: PersonWithAvailability[], b: PersonWithAvailability[]) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i] as any;
      const bi = b[i] as any;
      if (ai.id !== bi.id) return false;
      if ((ai.availableHours ?? 0) !== (bi.availableHours ?? 0)) return false;
      if ((ai.skillMatchScore ?? 0) !== (bi.skillMatchScore ?? 0)) return false;
    }
    return true;
  };

  const performSearch = useCallback(async (searchTerm: string) => {
    let filtered = people;
    if (searchTerm.length > 0) {
      filtered = people.filter(person =>
        person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(person.role || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    const commonSkills = ['heat', 'lighting', 'hvac', 'autocad', 'python', 'design', 'mechanical', 'electrical'];
    const detectedSkills = commonSkills.filter(skill => searchTerm.toLowerCase().includes(skill));

    let scoreMap: Record<number, number> = {};
    if (detectedSkills.length > 0) {
      try {
        const department = deptState?.selectedDepartmentId != null ? Number(deptState.selectedDepartmentId) : undefined;
        const include_children = department != null ? (deptState?.includeChildren ? 1 : 0) : undefined;
        const isGlobal = department == null || people.length > 500; // heuristic aligned with prior
        if (isGlobal && (caps.data?.asyncJobs ?? false)) {
          const { jobId } = await peopleApi.skillMatchAsync(detectedSkills, { department, include_children, limit: 2000, vertical: vertical ?? undefined });
          const status = await jobsApi.pollStatus(jobId, { intervalMs: 1200, timeoutMs: 90000 });
          const srv = (status.result || []) as Array<{ personId: number; score: number }>;
          srv.forEach(r => { if (r.personId != null) scoreMap[r.personId] = r.score || 0; });
        } else {
          const srv = await peopleApi.skillMatch(detectedSkills, { department, include_children, limit: 2000, vertical: vertical ?? undefined });
          srv.forEach((r: any) => { if (r.personId != null) scoreMap[r.personId] = r.score || 0; });
        }
      } catch {
        scoreMap = {};
      }
    }

    const peopleWithData = filtered.map((person) => {
      const availability = availabilityMap[person.id!] || { availableHours: 0, utilizationPercent: 0, totalHours: 0, capacity: person.weeklyCapacity || 36 };
      const skillMatchScore = scoreMap[person.id!] ?? 0;
      return {
        ...person,
        ...availability,
        skillMatchScore,
        hasSkillMatch: (detectedSkills.length > 0) ? (skillMatchScore > 0) : false,
      } as PersonWithAvailability;
    });

    const sorted = peopleWithData
      .sort((a, b) => {
        if (a.skillMatchScore !== b.skillMatchScore) return b.skillMatchScore - a.skillMatchScore;
        if ((b.availableHours ?? 0) !== (a.availableHours ?? 0)) return (b.availableHours ?? 0) - (a.availableHours ?? 0);
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);

    if (!areResultsEqual(results, sorted)) setResults(sorted);
    const announcement = `Found ${sorted.length} people matching your search. ${sorted.filter(p => p.hasSkillMatch).length} with skill matches.`;
    if (srAnnouncement !== announcement) setSrAnnouncement(announcement);
  }, [people, availabilityMap, caps.data, deptState?.selectedDepartmentId, deptState?.includeChildren, candidatesOnly, results, srAnnouncement, vertical]);

  const availabilityVersion = useMemo(() => Object.keys(availabilityMap).length, [availabilityMap]);

  useEffect(() => {
    if (people.length === 0) {
      if (results.length !== 0) setResults([]);
      return;
    }
    performSearch(debounced);
  }, [debounced, people.length, availabilityVersion]);

  const onChange = (term: string) => {
    setText(term);
    setSelectedIndex(-1);
  };

  const onFocus = () => {
    performSearch(text);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        onSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setResults([]);
      setSelectedIndex(-1);
    }
  };

  const onSelect = (person: Person) => {
    // consumer should update external state for selection; we just clear UI results
    setResults([]);
    setSelectedIndex(-1);
  };

  return { results, selectedIndex, setSelectedIndex, srAnnouncement, onChange, onFocus, onKeyDown, onSelect } as const;
}
