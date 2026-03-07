import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PageState from '@/components/ui/PageState';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { Department, Person, PersonSkill, SkillTag } from '@/types/models';
import { departmentsApi, peopleApi, personSkillsApi, skillTagsApi } from '@/services/api';
import { showToast } from '@/lib/toastBus';
import { confirmAction } from '@/lib/confirmAction';

type AssignmentMode = 'skill_to_people' | 'people_to_skills';

function nextPageFromUrl(url?: string | null): number | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const pageRaw = parsed.searchParams.get('page');
    if (!pageRaw) return null;
    const page = Number(pageRaw);
    return Number.isFinite(page) ? page : null;
  } catch {
    return null;
  }
}

function buildDepartmentTree(departments: Department[]) {
  const byParent = new Map<number | null, Department[]>();
  departments.forEach((dept) => {
    const parentId = dept.parentDepartment ?? null;
    const list = byParent.get(parentId) || [];
    list.push(dept);
    byParent.set(parentId, list);
  });
  byParent.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
  return byParent;
}

const SkillsAddDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, onClose, children }) => {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1150] bg-black/60 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md h-full bg-[var(--surface)] text-[var(--text)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold truncate">Add Skill</div>
          <button
            type="button"
            className="text-xl text-[var(--muted)]"
            onClick={onClose}
            aria-label="Close add skill panel"
          >
            x
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const SkillsDashboard: React.FC = () => {
  const { state: verticalState } = useVerticalFilter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [departmentSearch, setDepartmentSearch] = useState('');

  const [skills, setSkills] = useState<SkillTag[]>([]);
  const [skillsPage, setSkillsPage] = useState(1);
  const [skillsHasNext, setSkillsHasNext] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');

  const [people, setPeople] = useState<Person[]>([]);
  const [peoplePage, setPeoplePage] = useState(1);
  const [peopleHasNext, setPeopleHasNext] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState('');

  const [mode, setMode] = useState<AssignmentMode>('skill_to_people');
  const [expandedSkillIds, setExpandedSkillIds] = useState<Set<number>>(new Set());
  const [isAddSkillOpen, setIsAddSkillOpen] = useState(false);
  const [scopePickerSkillId, setScopePickerSkillId] = useState<number | null>(null);
  const [scopeTargetDepartmentId, setScopeTargetDepartmentId] = useState<number | ''>('');
  const [addPeopleSkillId, setAddPeopleSkillId] = useState<number | null>(null);
  const [addPeopleQuery, setAddPeopleQuery] = useState('');
  const [addPeopleResults, setAddPeopleResults] = useState<Person[]>([]);
  const [addPeopleLoading, setAddPeopleLoading] = useState(false);
  const [addPeopleSelectedIndex, setAddPeopleSelectedIndex] = useState(-1);
  const [addPeopleSelectedPerson, setAddPeopleSelectedPerson] = useState<Person | null>(null);
  const [addPeopleSelectionLocked, setAddPeopleSelectionLocked] = useState(false);
  const [addPeopleSrAnnouncement, setAddPeopleSrAnnouncement] = useState('');
  const [addPeopleDropdownAbove, setAddPeopleDropdownAbove] = useState(false);
  const addPeopleInputRef = useRef<HTMLInputElement | null>(null);
  const [addSkillsPersonId, setAddSkillsPersonId] = useState<number | null>(null);
  const [addSkillsQuery, setAddSkillsQuery] = useState('');
  const [addSkillsResults, setAddSkillsResults] = useState<SkillTag[]>([]);
  const [addSkillsLoading, setAddSkillsLoading] = useState(false);
  const [addSkillsSelectedIndex, setAddSkillsSelectedIndex] = useState(-1);
  const [addSkillsSrAnnouncement, setAddSkillsSrAnnouncement] = useState('');
  const [addSkillsDropdownAbove, setAddSkillsDropdownAbove] = useState(false);
  const addSkillsInputRef = useRef<HTMLInputElement | null>(null);

  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('');
  const [newSkillScope, setNewSkillScope] = useState<'global' | 'department'>('global');

  const [strengthAssignments, setStrengthAssignments] = useState<PersonSkill[]>([]);

  const deptById = useMemo(() => {
    const map = new Map<number, Department>();
    departments.forEach((dept) => {
      if (dept.id != null) map.set(dept.id, dept);
    });
    return map;
  }, [departments]);

  const tree = useMemo(() => buildDepartmentTree(departments), [departments]);
  const departmentOptions = useMemo(
    () =>
      departments
        .filter((dept) => dept.id != null)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [departments]
  );

  const loadDepartments = useCallback(async () => {
    const rows = await departmentsApi.listAll({
      vertical: verticalState.selectedVerticalId ?? undefined,
    });
    setDepartments((rows || []).filter((dept) => !!dept.id));
  }, [verticalState.selectedVerticalId]);

  const loadSkills = useCallback(
    async (page: number, append: boolean) => {
      const res = await skillTagsApi.list({
        search: skillSearch || undefined,
        page,
        page_size: 100,
        vertical: verticalState.selectedVerticalId ?? undefined,
        department: selectedDepartmentId ?? undefined,
        scope: selectedDepartmentId == null ? 'global' : undefined,
        include_children: selectedDepartmentId != null ? 1 : undefined,
        include_global: selectedDepartmentId != null ? 1 : undefined,
      });
      setSkills((prev) => (append ? [...prev, ...(res.results || [])] : (res.results || [])));
      setSkillsPage(page);
      setSkillsHasNext(Boolean(res.next));
    },
    [selectedDepartmentId, skillSearch, verticalState.selectedVerticalId]
  );

  const loadPeople = useCallback(
    async (page: number, append: boolean) => {
      const payload: Parameters<typeof peopleApi.searchList>[0] = {
        page,
        page_size: 100,
        vertical: verticalState.selectedVerticalId ?? undefined,
        include_inactive: 0,
        ordering: 'department,name',
      };
      if (peopleSearch.trim()) {
        payload.search_tokens = [{ term: peopleSearch.trim(), op: 'and' }];
      }
      if (selectedDepartmentId != null) {
        payload.department = selectedDepartmentId;
        payload.include_children = 1;
      }

      const res = await peopleApi.searchList(payload);
      const incoming = (res.results || []).filter((row) => row.department != null);
      setPeople((prev) => (append ? [...prev, ...incoming] : incoming));
      setPeoplePage(page);
      setPeopleHasNext(Boolean(res.next));
    },
    [peopleSearch, selectedDepartmentId, verticalState.selectedVerticalId]
  );

  const loadStrengthAssignments = useCallback(async () => {
    const personIds = people.map((person) => person.id).filter((id): id is number => typeof id === 'number');
    const skillIds = skills.map((skill) => skill.id).filter((id): id is number => typeof id === 'number');
    if (!personIds.length || !skillIds.length) {
      setStrengthAssignments([]);
      return;
    }

    const allRows: PersonSkill[] = [];
    let page = 1;
    while (true) {
      const res = await personSkillsApi.list({
        person_ids: personIds,
        skill_tag_ids: skillIds,
        skill_type: 'strength',
        page,
        page_size: 200,
      });
      allRows.push(...(res.results || []));
      const nextPage = nextPageFromUrl(res.next);
      if (!nextPage) break;
      page = nextPage;
    }
    setStrengthAssignments(allRows);
  }, [people, skills]);

  const refreshData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadDepartments(), loadSkills(1, false), loadPeople(1, false)]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load skills workspace');
    } finally {
      setLoading(false);
    }
  }, [loadDepartments, loadPeople, loadSkills]);

  useAuthenticatedEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    void loadSkills(1, false);
    void loadPeople(1, false);
  }, [selectedDepartmentId, skillSearch, peopleSearch, verticalState.selectedVerticalId, loadSkills, loadPeople]);

  useEffect(() => {
    void loadStrengthAssignments();
  }, [loadStrengthAssignments]);

  useEffect(() => {
    if (!isAddSkillOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAddSkillOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAddSkillOpen]);

  useEffect(() => {
    setScopePickerSkillId(null);
    setScopeTargetDepartmentId('');
    setAddPeopleSkillId(null);
    setAddPeopleQuery('');
    setAddPeopleResults([]);
    setAddPeopleSelectedIndex(-1);
    setAddPeopleSelectedPerson(null);
    setAddPeopleSelectionLocked(false);
    setAddPeopleSrAnnouncement('');
    setAddSkillsPersonId(null);
    setAddSkillsQuery('');
    setAddSkillsResults([]);
    setAddSkillsLoading(false);
    setAddSkillsSelectedIndex(-1);
    setAddSkillsSrAnnouncement('');
  }, [selectedDepartmentId, mode]);

  useEffect(() => {
    setExpandedSkillIds((prev) => {
      const liveIds = new Set(skills.map((skill) => skill.id).filter((id): id is number => id != null));
      const next = new Set<number>();
      prev.forEach((id) => {
        if (liveIds.has(id)) next.add(id);
      });
      return next;
    });
    setAddPeopleSkillId((prev) => {
      if (prev == null || skills.find((skill) => skill.id === prev)) return prev;
      setAddPeopleQuery('');
      setAddPeopleResults([]);
      setAddPeopleSelectedIndex(-1);
      setAddPeopleSelectedPerson(null);
      setAddPeopleSelectionLocked(false);
      setAddPeopleSrAnnouncement('');
      return null;
    });
  }, [skills]);

  useEffect(() => {
    setAddSkillsPersonId((prev) => {
      if (prev == null || people.some((person) => person.id === prev)) return prev;
      setAddSkillsQuery('');
      setAddSkillsResults([]);
      setAddSkillsLoading(false);
      setAddSkillsSelectedIndex(-1);
      setAddSkillsSrAnnouncement('');
      return null;
    });
  }, [people]);

  useEffect(() => {
    if (mode !== 'skill_to_people' || addPeopleSkillId == null) {
      setAddPeopleResults([]);
      setAddPeopleLoading(false);
      setAddPeopleSelectedIndex(-1);
      setAddPeopleSrAnnouncement('');
      return;
    }
    if (addPeopleSelectionLocked) {
      setAddPeopleResults([]);
      setAddPeopleLoading(false);
      setAddPeopleSelectedIndex(-1);
      return;
    }
    if (!addPeopleQuery.trim()) {
      setAddPeopleResults([]);
      setAddPeopleLoading(false);
      setAddPeopleSelectedIndex(-1);
      setAddPeopleSrAnnouncement('');
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAddPeopleLoading(true);
      try {
        const payload: Parameters<typeof peopleApi.searchList>[0] = {
          page: 1,
          page_size: 20,
          include_inactive: 0,
          vertical: verticalState.selectedVerticalId ?? undefined,
          ordering: 'name',
        };
        if (selectedDepartmentId != null) {
          payload.department = selectedDepartmentId;
          payload.include_children = 1;
        }
        if (addPeopleQuery.trim()) {
          payload.search_tokens = [{ term: addPeopleQuery.trim(), op: 'and' }];
        }

        const res = await peopleApi.searchList(payload);
        if (cancelled) return;
        const nextResults = (res.results || []).filter((person) => person.department != null);
        setAddPeopleResults(nextResults);
        setAddPeopleSelectedIndex(nextResults.length > 0 ? 0 : -1);
        setAddPeopleSrAnnouncement(`Found ${nextResults.length} people matching your search.`);
      } catch {
        if (!cancelled) {
          setAddPeopleResults([]);
          setAddPeopleSelectedIndex(-1);
          setAddPeopleSrAnnouncement('');
        }
      } finally {
        if (!cancelled) setAddPeopleLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, addPeopleSkillId, addPeopleQuery, addPeopleSelectionLocked, selectedDepartmentId, verticalState.selectedVerticalId]);

  useEffect(() => {
    if (mode !== 'people_to_skills' || addSkillsPersonId == null) {
      setAddSkillsResults([]);
      setAddSkillsLoading(false);
      setAddSkillsSelectedIndex(-1);
      setAddSkillsSrAnnouncement('');
      return;
    }
    if (!addSkillsQuery.trim()) {
      setAddSkillsResults([]);
      setAddSkillsLoading(false);
      setAddSkillsSelectedIndex(-1);
      setAddSkillsSrAnnouncement('');
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAddSkillsLoading(true);
      try {
        const res = await skillTagsApi.list({
          search: addSkillsQuery.trim(),
          page: 1,
          page_size: 20,
          vertical: verticalState.selectedVerticalId ?? undefined,
          department: selectedDepartmentId ?? undefined,
          scope: selectedDepartmentId == null ? 'global' : undefined,
          include_children: selectedDepartmentId != null ? 1 : undefined,
          include_global: selectedDepartmentId != null ? 1 : undefined,
        });
        if (cancelled) return;
        const dedup = new Map<number, SkillTag>();
        (res.results || []).forEach((skill) => {
          if (skill.id != null) dedup.set(skill.id, skill);
        });
        const rows = Array.from(dedup.values());
        setAddSkillsResults(rows);
        setAddSkillsSelectedIndex(rows.length > 0 ? 0 : -1);
        setAddSkillsSrAnnouncement(`Found ${rows.length} skills matching your search.`);
      } catch {
        if (!cancelled) {
          setAddSkillsResults([]);
          setAddSkillsSelectedIndex(-1);
          setAddSkillsSrAnnouncement('');
        }
      } finally {
        if (!cancelled) setAddSkillsLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, addSkillsPersonId, addSkillsQuery, selectedDepartmentId, verticalState.selectedVerticalId]);

  const isAddPeopleSearchOpen = useMemo(
    () =>
      mode === 'skill_to_people'
      && addPeopleSkillId != null
      && !addPeopleSelectionLocked
      && addPeopleQuery.trim().length > 0
      && addPeopleResults.length > 0,
    [mode, addPeopleSkillId, addPeopleSelectionLocked, addPeopleQuery, addPeopleResults.length]
  );

  const isAddSkillsSearchOpen = useMemo(
    () =>
      mode === 'people_to_skills'
      && addSkillsPersonId != null
      && addSkillsQuery.trim().length > 0
      && addSkillsResults.length > 0,
    [mode, addSkillsPersonId, addSkillsQuery, addSkillsResults.length]
  );

  useEffect(() => {
    if (!isAddPeopleSearchOpen) return;
    const updatePlacement = () => {
      const el = addPeopleInputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dropdownHeight = 240;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setAddPeopleDropdownAbove(spaceBelow < dropdownHeight && spaceAbove > spaceBelow);
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isAddPeopleSearchOpen, addPeopleResults.length]);

  useEffect(() => {
    if (!isAddSkillsSearchOpen) return;
    const updatePlacement = () => {
      const el = addSkillsInputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dropdownHeight = 240;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setAddSkillsDropdownAbove(spaceBelow < dropdownHeight && spaceAbove > spaceBelow);
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isAddSkillsSearchOpen, addSkillsResults.length]);

  const peopleById = useMemo(() => {
    const map = new Map<number, Person>();
    people.forEach((person) => {
      if (person.id != null) map.set(person.id, person);
    });
    return map;
  }, [people]);

  const skillById = useMemo(() => {
    const map = new Map<number, SkillTag>();
    skills.forEach((skill) => {
      if (skill.id != null) map.set(skill.id, skill);
    });
    return map;
  }, [skills]);

  const peopleForSkill = useMemo(() => {
    const map = new Map<number, Person[]>();
    strengthAssignments.forEach((row) => {
      const skillId = row.skillTagId;
      const personId = row.person;
      if (!skillId || !personId) return;
      const person = peopleById.get(personId);
      if (!person) return;
      const existing = map.get(skillId) || [];
      existing.push(person);
      map.set(skillId, existing);
    });

    map.forEach((list, skillId) => {
      const dedup = new Map<number, Person>();
      list.forEach((person) => {
        if (person.id != null) dedup.set(person.id, person);
      });
      map.set(skillId, Array.from(dedup.values()).sort((a, b) => a.name.localeCompare(b.name)));
    });

    return map;
  }, [peopleById, strengthAssignments]);

  const assignmentSet = useMemo(() => {
    const set = new Set<string>();
    strengthAssignments.forEach((row) => {
      if (row.person && row.skillTagId) {
        set.add(`${row.person}:${row.skillTagId}`);
      }
    });
    return set;
  }, [strengthAssignments]);

  const skillsForPerson = useMemo(() => {
    const map = new Map<number, SkillTag[]>();
    strengthAssignments.forEach((row) => {
      const personId = row.person;
      const skillId = row.skillTagId;
      if (!personId || !skillId) return;
      const skill = skillById.get(skillId);
      if (!skill) return;
      const existing = map.get(personId) || [];
      existing.push(skill);
      map.set(personId, existing);
    });

    map.forEach((list, personId) => {
      const dedup = new Map<number, SkillTag>();
      list.forEach((skill) => {
        if (skill.id != null) dedup.set(skill.id, skill);
      });
      map.set(personId, Array.from(dedup.values()).sort((a, b) => a.name.localeCompare(b.name)));
    });

    return map;
  }, [skillById, strengthAssignments]);

  const toggleExpandedSkill = (skillId?: number) => {
    if (!skillId) return;
    setExpandedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };

  const toggleAddPeoplePanel = (skillId?: number) => {
    if (!skillId) return;
    setScopePickerSkillId(null);
    setScopeTargetDepartmentId('');
    setAddPeopleSkillId((prev) => {
      if (prev === skillId) {
        setAddPeopleQuery('');
        setAddPeopleResults([]);
        setAddPeopleSelectedIndex(-1);
        setAddPeopleSelectedPerson(null);
        setAddPeopleSelectionLocked(false);
        setAddPeopleSrAnnouncement('');
        return null;
      }
      setAddPeopleQuery('');
      setAddPeopleResults([]);
      setAddPeopleSelectedIndex(-1);
      setAddPeopleSelectedPerson(null);
      setAddPeopleSelectionLocked(false);
      setAddPeopleSrAnnouncement('');
      return skillId;
    });
  };

  const closeAddPeoplePanel = () => {
    setAddPeopleSkillId(null);
    setAddPeopleQuery('');
    setAddPeopleResults([]);
    setAddPeopleSelectedIndex(-1);
    setAddPeopleSelectedPerson(null);
    setAddPeopleSelectionLocked(false);
    setAddPeopleSrAnnouncement('');
  };

  const toggleAddSkillsPanel = (personId?: number) => {
    if (!personId) return;
    setAddSkillsPersonId((prev) => {
      if (prev === personId) {
        setAddSkillsQuery('');
        setAddSkillsResults([]);
        setAddSkillsLoading(false);
        setAddSkillsSelectedIndex(-1);
        setAddSkillsSrAnnouncement('');
        return null;
      }
      setAddSkillsQuery('');
      setAddSkillsResults([]);
      setAddSkillsLoading(false);
      setAddSkillsSelectedIndex(-1);
      setAddSkillsSrAnnouncement('');
      return personId;
    });
  };

  const onAddPeopleQueryChange = (value: string) => {
    setAddPeopleQuery(value);
    setAddPeopleSelectionLocked(false);
    setAddPeopleSelectedPerson(null);
    setAddPeopleSelectedIndex(-1);
  };

  const onAddSkillsQueryChange = (value: string) => {
    setAddSkillsQuery(value);
    setAddSkillsSelectedIndex(-1);
  };

  const selectAddPeoplePerson = (person: Person) => {
    setAddPeopleSelectedPerson(person);
    setAddPeopleSelectionLocked(true);
    setAddPeopleQuery(person.name);
    setAddPeopleResults([]);
    setAddPeopleSelectedIndex(-1);
  };

  const onAddPeopleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isAddPeopleSearchOpen) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAddPeopleSelectedIndex((prev) =>
        addPeopleResults.length > 0 ? Math.min(prev + 1, addPeopleResults.length - 1) : -1
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setAddPeopleSelectedIndex((prev) => (addPeopleResults.length > 0 ? Math.max(prev - 1, 0) : -1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (addPeopleSelectedIndex >= 0 && addPeopleSelectedIndex < addPeopleResults.length) {
        selectAddPeoplePerson(addPeopleResults[addPeopleSelectedIndex]);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setAddPeopleResults([]);
      setAddPeopleSelectedIndex(-1);
    }
  };

  const onAddSkillsSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, person: Person) => {
    if (!isAddSkillsSearchOpen) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAddSkillsSelectedIndex((prev) =>
        addSkillsResults.length > 0 ? Math.min(prev + 1, addSkillsResults.length - 1) : -1
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setAddSkillsSelectedIndex((prev) => (addSkillsResults.length > 0 ? Math.max(prev - 1, 0) : -1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (addSkillsSelectedIndex >= 0 && addSkillsSelectedIndex < addSkillsResults.length) {
        void addSkillToPerson(person, addSkillsResults[addSkillsSelectedIndex]);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setAddSkillsResults([]);
      setAddSkillsSelectedIndex(-1);
    }
  };

  const addPersonToSkill = async (skill: SkillTag, person: Person) => {
    if (!skill.id || !person.id) return;
    setBusy(true);
    try {
      const result = await personSkillsApi.bulkAssign({
        operation: 'assign',
        personIds: [person.id],
        skillTagIds: [skill.id],
        skillType: 'strength',
        proficiencyLevel: 'beginner',
      });
      await loadStrengthAssignments();
      if (result.created > 0) {
        showToast(`Added ${person.name} to ${skill.name}`, 'success');
      } else {
        showToast(`${person.name} already has ${skill.name}`, 'info');
      }
      setAddPeopleQuery('');
      setAddPeopleResults([]);
      setAddPeopleSelectedIndex(-1);
      setAddPeopleSelectedPerson(null);
      setAddPeopleSelectionLocked(false);
      setAddPeopleSrAnnouncement('');
    } catch (err: any) {
      showToast(err?.message || 'Failed to add person to skill', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addSkillToPerson = async (person: Person, skill: SkillTag) => {
    if (!person.id || !skill.id) return;
    if (assignmentSet.has(`${person.id}:${skill.id}`)) return;
    setBusy(true);
    try {
      await personSkillsApi.bulkAssign({
        operation: 'assign',
        personIds: [person.id],
        skillTagIds: [skill.id],
        skillType: 'strength',
        proficiencyLevel: 'beginner',
      });
      await loadStrengthAssignments();
      showToast(`Added ${skill.name} to ${person.name}`, 'success');
      setAddSkillsQuery('');
      setAddSkillsResults([]);
      setAddSkillsSelectedIndex(-1);
      setAddSkillsSrAnnouncement('');
    } catch (err: any) {
      showToast(err?.message || 'Failed to add skill to person', 'error');
    } finally {
      setBusy(false);
    }
  };

  const createSkill = async () => {
    const name = newSkillName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await skillTagsApi.create({
        name,
        category: newSkillCategory.trim() || undefined,
        department:
          newSkillScope === 'department' && selectedDepartmentId != null ? selectedDepartmentId : null,
      } as any);
      setNewSkillName('');
      setNewSkillCategory('');
      setNewSkillScope(selectedDepartmentId != null ? 'department' : 'global');
      setIsAddSkillOpen(false);
      await loadSkills(1, false);
      showToast('Skill created', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to create skill', 'error');
    } finally {
      setBusy(false);
    }
  };

  const setSkillDepartmentScope = async (skill: SkillTag, departmentId: number | null) => {
    if (!skill.id) return;
    setBusy(true);
    try {
      await skillTagsApi.update(skill.id, {
        department: departmentId,
      });
      setScopePickerSkillId(null);
      setScopeTargetDepartmentId('');
      await loadSkills(1, false);
      await loadStrengthAssignments();
      showToast(departmentId == null ? 'Skill moved to global' : 'Skill scoped to department', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update skill scope', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleSkillScope = async (skill: SkillTag) => {
    if (!skill.id) return;
    if (skill.scopeType === 'global') {
      if (selectedDepartmentId == null) {
        if (!departmentOptions.length) {
          showToast('No departments available for scoping', 'info');
          return;
        }
        setScopePickerSkillId(skill.id);
        setScopeTargetDepartmentId(departmentOptions[0].id!);
        return;
      }
      await setSkillDepartmentScope(skill, selectedDepartmentId);
      return;
    }
    await setSkillDepartmentScope(skill, null);
  };

  const applyScopedDepartment = async (skill: SkillTag) => {
    if (!skill.id) return;
    if (scopeTargetDepartmentId === '') {
      showToast('Select a department', 'info');
      return;
    }
    await setSkillDepartmentScope(skill, Number(scopeTargetDepartmentId));
  };

  const deleteSkill = async (skill: SkillTag) => {
    if (!skill.id) return;
    const assignedCount = strengthAssignments.filter((row) => row.skillTagId === skill.id).length;
    const confirmed = await confirmAction({
      title: 'Delete Skill',
      message: assignedCount > 0
        ? `Delete "${skill.name}"? This will remove ${assignedCount} visible strength assignment(s) and cannot be undone.`
        : `Delete "${skill.name}"? This cannot be undone.`,
      confirmLabel: 'Delete Skill',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await skillTagsApi.delete(skill.id);
      setExpandedSkillIds((prev) => {
        const next = new Set(prev);
        next.delete(skill.id!);
        return next;
      });
      setScopePickerSkillId((prev) => (prev === skill.id ? null : prev));
      setAddPeopleSkillId((prev) => (prev === skill.id ? null : prev));
      await loadSkills(1, false);
      await loadStrengthAssignments();
      showToast('Skill deleted', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete skill', 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectedDepartmentName = selectedDepartmentId != null ? (deptById.get(selectedDepartmentId)?.name || '') : 'All Departments';
  const openAddSkillPanel = () => {
    setNewSkillScope(selectedDepartmentId != null ? 'department' : 'global');
    setIsAddSkillOpen(true);
  };

  const filteredTreeRoots = useMemo(() => {
    const roots = tree.get(null) || [];
    if (!departmentSearch.trim()) return roots;
    const query = departmentSearch.trim().toLowerCase();
    return departments
      .filter((dept) => dept.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, departmentSearch, tree]);

  const renderTree = (parentId: number | null, depth = 0): React.ReactNode => {
    const children = tree.get(parentId) || [];
    return children.map((dept) => {
      const isSelected = selectedDepartmentId === dept.id;
      return (
        <React.Fragment key={dept.id}>
          <button
            type="button"
            onClick={() => setSelectedDepartmentId(dept.id ?? null)}
            className={`w-full text-left rounded px-2 py-1 text-sm transition-colors ${
              isSelected
                ? 'bg-[var(--surfaceHover)] text-[var(--text)] border border-[var(--focus)]'
                : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] border border-transparent'
            }`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            {dept.name}
          </button>
          {renderTree(dept.id ?? null, depth + 1)}
        </React.Fragment>
      );
    });
  };

  if (loading) {
    return (
      <Layout>
        <PageState isLoading />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <PageState error={error} onRetry={() => void refreshData()} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="ux-page-shell space-y-4">
        <div className="ux-page-hero flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Skills Workspace</h1>
            <p className="text-sm text-[var(--muted)]">
              Browse strength skills by department, or browse people with their current skills.
            </p>
            <p className="text-xs text-[var(--muted)]">
              {mode === 'skill_to_people'
                ? 'Mode 1: expand a skill to see people who have it.'
                : 'Mode 2: each person row shows their skill pills.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-sm border ${
                mode === 'skill_to_people'
                  ? 'border-[var(--focus)] bg-[var(--surfaceHover)] text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              onClick={() => setMode('skill_to_people')}
            >
              Skill {'->'} People
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-sm border ${
                mode === 'people_to_skills'
                  ? 'border-[var(--focus)] bg-[var(--surfaceHover)] text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              onClick={() => setMode('people_to_skills')}
            >
              People {'->'} Skills
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-sm border ${
                isAddSkillOpen
                  ? 'border-[var(--focus)] bg-[var(--surfaceHover)] text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              onClick={openAddSkillPanel}
              disabled={busy}
            >
              Add Skill
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="ux-panel p-3">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">Departments</h2>
              <Input
                value={departmentSearch}
                onChange={(e) => setDepartmentSearch(e.target.value)}
                placeholder="Search departments..."
              />
              <button
                type="button"
                onClick={() => setSelectedDepartmentId(null)}
                className={`w-full rounded px-2 py-1 text-left text-sm border ${
                  selectedDepartmentId == null
                    ? 'bg-[var(--surfaceHover)] text-[var(--text)] border-[var(--focus)]'
                    : 'text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--surface)]'
                }`}
              >
                All Departments
              </button>
              <div className="max-h-[480px] overflow-auto space-y-1">
                {departmentSearch.trim()
                  ? filteredTreeRoots.map((dept) => (
                      <button
                        key={dept.id}
                        type="button"
                        onClick={() => setSelectedDepartmentId(dept.id ?? null)}
                        className={`w-full rounded px-2 py-1 text-left text-sm border ${
                          selectedDepartmentId === dept.id
                            ? 'bg-[var(--surfaceHover)] text-[var(--text)] border-[var(--focus)]'
                            : 'text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)] hover:bg-[var(--surface)]'
                        }`}
                      >
                        {dept.name}
                      </button>
                    ))
                  : renderTree(null)}
              </div>
            </div>
          </Card>

          <Card className="ux-panel p-3">
            {mode === 'skill_to_people' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[var(--text)]">
                    Skills ({selectedDepartmentName})
                  </h2>
                  <div className="text-xs text-[var(--muted)]">{skills.length} loaded</div>
                </div>
                <Input
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  placeholder="Search skills..."
                />

                <div className="max-h-[620px] overflow-auto rounded border border-[var(--border)]">
                  {skills.map((skill) => {
                    const skillId = skill.id;
                    const expanded = !!skillId && expandedSkillIds.has(skillId);
                    const assignedPeople = skillId ? (peopleForSkill.get(skillId) || []) : [];
                    const assignedCount = assignedPeople.length;

                    return (
                      <div key={skill.id} className="border-b border-[var(--border)] last:border-b-0">
                        <div className="grid grid-cols-[minmax(0,1fr)_32px_auto] items-center gap-2 px-2 py-2 sm:grid-cols-[340px_32px_auto]">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 text-left"
                            onClick={() => toggleExpandedSkill(skillId)}
                          >
                            <span className="text-xs text-[var(--muted)]">{expanded ? 'v' : '>'}</span>
                            <div className="min-w-0">
                              <div className="truncate text-sm text-[var(--text)]">{skill.name}</div>
                              <div className="text-xs text-[var(--muted)]">
                                {skill.scopeType === 'global'
                                  ? 'Global'
                                  : (skill.departmentName || 'Department')} | {assignedCount} people
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                            onClick={() => toggleAddPeoplePanel(skillId)}
                            disabled={busy}
                            aria-label={`Add people to ${skill.name}`}
                          >
                            {addPeopleSkillId === skillId ? '-' : '+'}
                          </button>
                          <div className="flex w-[250px] sm:w-[380px] items-center justify-end gap-1">
                            {skill.scopeType === 'global' && selectedDepartmentId == null && scopePickerSkillId === skillId ? (
                              <>
                                <select
                                  className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)]"
                                  value={scopeTargetDepartmentId}
                                  onChange={(e) =>
                                    setScopeTargetDepartmentId(
                                      e.target.value ? Number(e.target.value) : ''
                                    )
                                  }
                                  disabled={busy}
                                >
                                  {departmentOptions.map((dept) => (
                                    <option key={dept.id} value={dept.id}>
                                      {dept.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                                  onClick={() => void applyScopedDepartment(skill)}
                                  disabled={busy || scopeTargetDepartmentId === ''}
                                >
                                  Apply
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                                  onClick={() => {
                                    setScopePickerSkillId(null);
                                    setScopeTargetDepartmentId('');
                                  }}
                                  disabled={busy}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                                onClick={() => void toggleSkillScope(skill)}
                                disabled={busy}
                              >
                                {skill.scopeType === 'global' ? 'Scope to Dept' : 'Make Global'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded border border-red-400/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                              onClick={() => void deleteSkill(skill)}
                              disabled={busy}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {addPeopleSkillId === skillId && (
                          <div className="border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                            <div className="rounded border border-[var(--border)] bg-[var(--card)] p-2">
                              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                <div className="text-[10px] font-medium uppercase text-[var(--muted)]">Person</div>
                                <div className="text-[10px] font-medium uppercase text-[var(--muted)]">Actions</div>
                              </div>
                              <div className="relative">
                                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                  <input
                                    type="text"
                                    value={addPeopleQuery}
                                    onChange={(e) => onAddPeopleQueryChange(e.target.value)}
                                    onKeyDown={onAddPeopleSearchKeyDown}
                                    placeholder="Start typing name..."
                                    role="combobox"
                                    aria-expanded={isAddPeopleSearchOpen}
                                    aria-haspopup="listbox"
                                    aria-owns={skillId ? `skill-person-search-results-${skillId}` : undefined}
                                    aria-describedby={skillId ? `skill-person-search-help-${skillId}` : undefined}
                                    className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                                    ref={addPeopleInputRef}
                                    autoFocus
                                  />
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      className="px-2 py-1 text-xs rounded border bg-[var(--primary)] border-[var(--primary)] text-white hover:bg-[var(--primaryHover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      onClick={() => {
                                        if (!addPeopleSelectedPerson) return;
                                        void addPersonToSkill(skill, addPeopleSelectedPerson);
                                      }}
                                      disabled={
                                        busy
                                        || !addPeopleSelectedPerson
                                        || (
                                          addPeopleSelectedPerson.id != null
                                          && skillId != null
                                          && assignmentSet.has(`${addPeopleSelectedPerson.id}:${skillId}`)
                                        )
                                      }
                                    >
                                      Add Selected
                                    </button>
                                    <button
                                      type="button"
                                      className="px-2 py-1 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors"
                                      onClick={closeAddPeoplePanel}
                                      disabled={busy}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                                <div id={skillId ? `skill-person-search-help-${skillId}` : undefined} className="sr-only">
                                  Search for people to add to this skill. Use arrow keys to navigate results.
                                </div>
                                <div aria-live="polite" aria-atomic="true" className="sr-only">
                                  {addPeopleSrAnnouncement}
                                </div>
                                {isAddPeopleSearchOpen && (
                                  <div className={`absolute left-0 right-0 z-50 ${addPeopleDropdownAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                                    <div
                                      id={skillId ? `skill-person-search-results-${skillId}` : undefined}
                                      role="listbox"
                                      className="bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg max-h-56 overflow-y-auto"
                                    >
                                      <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                                        People
                                      </div>
                                      {addPeopleResults.map((person, index) => {
                                        const alreadyAssigned =
                                          person.id != null && skillId != null
                                            ? assignmentSet.has(`${person.id}:${skillId}`)
                                            : false;
                                        return (
                                          <button
                                            key={person.id}
                                            type="button"
                                            onClick={() => selectAddPeoplePerson(person)}
                                            className={`w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
                                              addPeopleSelectedIndex === index ? 'bg-[var(--surfaceOverlay)] border-[var(--primary)]' : ''
                                            }`}
                                          >
                                            <div className="flex items-center justify-between">
                                              <div className="font-medium truncate">{person.name}</div>
                                              {alreadyAssigned && (
                                                <span className="text-[10px] px-1 py-0.5 rounded border border-[var(--border)] text-[var(--muted)]">
                                                  Added
                                                </span>
                                              )}
                                            </div>
                                            <div className="truncate text-[var(--muted)]">
                                              {deptById.get(person.department || -1)?.name || 'Department'} | {person.roleName || 'No role'}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="mt-2 min-h-[16px] text-xs text-[var(--muted)]">
                                {addPeopleLoading
                                  ? 'Searching people...'
                                  : addPeopleSelectedPerson
                                    ? `Selected: ${addPeopleSelectedPerson.name}`
                                    : addPeopleQuery.trim()
                                      ? 'Select a person from the results.'
                                      : 'Type a name to search.'}
                              </div>
                            </div>
                          </div>
                        )}
                        {expanded && (
                          <div className="border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                            {assignedPeople.length === 0 ? (
                              <div className="text-xs text-[var(--muted)]">
                                No people currently have this skill as a strength.
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {assignedPeople.map((person) => (
                                  <div key={person.id} className="flex items-center justify-between gap-2 text-sm">
                                    <span className="truncate text-[var(--text)]">{person.name}</span>
                                    <span className="text-xs text-[var(--muted)]">
                                      {deptById.get(person.department || -1)?.name || 'Department'} | {person.roleName || 'No role'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {skills.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                      No skills found for this scope.
                    </div>
                  )}
                </div>

                {skillsHasNext && (
                  <Button variant="ghost" onClick={() => void loadSkills(skillsPage + 1, true)}>
                    Load More Skills
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[var(--text)]">People ({selectedDepartmentName})</h2>
                  <div className="text-xs text-[var(--muted)]">{people.length} loaded</div>
                </div>
                <Input
                  value={peopleSearch}
                  onChange={(e) => setPeopleSearch(e.target.value)}
                  placeholder="Search people..."
                />

                <div className="max-h-[620px] overflow-auto rounded border border-[var(--border)]">
                  {people.map((person) => {
                    const personSkills = person.id ? (skillsForPerson.get(person.id) || []) : [];
                    return (
                      <div key={person.id} className="border-b border-[var(--border)] px-2 py-2 last:border-b-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm text-[var(--text)]">{person.name}</div>
                            <div className="text-xs text-[var(--muted)]">
                              {deptById.get(person.department || -1)?.name || 'Department'} | {person.roleName || 'No role'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                              onClick={() => toggleAddSkillsPanel(person.id)}
                              disabled={busy}
                              aria-label={`Add skill to ${person.name}`}
                            >
                              {addSkillsPersonId === person.id ? '-' : '+'}
                            </button>
                          </div>
                        </div>
                        {addSkillsPersonId === person.id && (
                          <div className="mt-2 rounded border border-[var(--border)] bg-[var(--card)] p-2">
                            <div className="relative">
                              <input
                                type="text"
                                value={addSkillsQuery}
                                onChange={(e) => onAddSkillsQueryChange(e.target.value)}
                                onKeyDown={(e) => onAddSkillsSearchKeyDown(e, person)}
                                placeholder="Search skills to add..."
                                role="combobox"
                                aria-expanded={isAddSkillsSearchOpen}
                                aria-haspopup="listbox"
                                aria-owns={person.id ? `person-skill-search-results-${person.id}` : undefined}
                                className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                                ref={addSkillsInputRef}
                                autoFocus
                              />
                              <div aria-live="polite" aria-atomic="true" className="sr-only">
                                {addSkillsSrAnnouncement}
                              </div>
                              {isAddSkillsSearchOpen && (
                                <div className={`absolute left-0 right-0 z-50 ${addSkillsDropdownAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                                  <div
                                    id={person.id ? `person-skill-search-results-${person.id}` : undefined}
                                    role="listbox"
                                    className="bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg max-h-56 overflow-y-auto"
                                  >
                                    <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                                      Skills
                                    </div>
                                    {addSkillsResults.map((skill, index) => {
                                      const alreadyAssigned =
                                        person.id != null && skill.id != null
                                          ? assignmentSet.has(`${person.id}:${skill.id}`)
                                          : false;
                                      return (
                                        <button
                                          key={skill.id}
                                          type="button"
                                          onClick={() => {
                                            if (alreadyAssigned || busy) return;
                                            void addSkillToPerson(person, skill);
                                          }}
                                          className={`w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
                                            addSkillsSelectedIndex === index ? 'bg-[var(--surfaceOverlay)] border-[var(--primary)]' : ''
                                          } ${alreadyAssigned ? 'opacity-70' : ''}`}
                                          disabled={alreadyAssigned || busy}
                                        >
                                          <div className="flex items-center justify-between">
                                            <div className="truncate font-medium">{skill.name}</div>
                                            {alreadyAssigned && (
                                              <span className="text-[10px] px-1 py-0.5 rounded border border-[var(--border)] text-[var(--muted)]">
                                                Added
                                              </span>
                                            )}
                                          </div>
                                          <div className="truncate text-[var(--muted)]">
                                            {skill.scopeType === 'global'
                                              ? 'Global'
                                              : (skill.departmentName || 'Department')}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="mt-2 min-h-[16px] text-xs text-[var(--muted)]">
                              {addSkillsLoading
                                ? 'Searching skills...'
                                : addSkillsQuery.trim()
                                  ? 'Click a skill to add it.'
                                  : 'Type a skill name to search.'}
                            </div>
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {personSkills.length === 0 ? (
                            <span className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
                              No skills
                            </span>
                          ) : (
                            personSkills.map((skill) => (
                              <span
                                key={skill.id}
                                className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--text)]"
                              >
                                {skill.name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {people.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                      No people found for this scope.
                    </div>
                  )}
                </div>

                {peopleHasNext && (
                  <Button variant="ghost" onClick={() => void loadPeople(peoplePage + 1, true)}>
                    Load More People
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>

        <SkillsAddDrawer open={isAddSkillOpen} onClose={() => setIsAddSkillOpen(false)}>
          <div className="space-y-3">
            <Input
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="New skill name"
            />
            <Input
              value={newSkillCategory}
              onChange={(e) => setNewSkillCategory(e.target.value)}
              placeholder="Category (optional)"
            />
            <select
              className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-sm text-[var(--text)]"
              value={newSkillScope}
              onChange={(e) => setNewSkillScope(e.target.value as 'global' | 'department')}
            >
              <option value="global">Global</option>
              <option value="department" disabled={selectedDepartmentId == null}>
                Selected Department
              </option>
            </select>
            <div className="text-xs text-[var(--muted)]">
              Scope target: {newSkillScope === 'department' ? (selectedDepartmentName || 'Selected Department') : 'Global'}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={createSkill} disabled={!newSkillName.trim() || busy}>
                Add Skill
              </Button>
              <Button variant="ghost" onClick={() => setIsAddSkillOpen(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </SkillsAddDrawer>
      </div>
    </Layout>
  );
};

export default SkillsDashboard;
