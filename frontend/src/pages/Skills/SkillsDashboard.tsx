import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PageState from '@/components/ui/PageState';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { Department, Person, PersonSkill, SkillTag } from '@/types/models';
import { departmentsApi, peopleApi, personSkillsApi, skillTagsApi } from '@/services/api';
import { showToast } from '@/lib/toastBus';
import { confirmAction } from '@/lib/confirmAction';
import PersonSkillDetailPanel from '@/pages/Skills/components/PersonSkillDetailPanel';
import { usePersonSkillAutoSave } from '@/pages/Skills/hooks/usePersonSkillAutoSave';

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

function personSkillPillClass(skillType?: string) {
  if (skillType === 'strength') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (skillType === 'in_progress') return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  if (skillType === 'goals') return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  return 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)]';
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

const PersonDetailsDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title = 'Person Details', children }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();
    else panel.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const activeFocusable = panel.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      );
      if (!activeFocusable.length) return;
      const first = activeFocusable[0];
      const last = activeFocusable[activeFocusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1150] bg-black/60 flex justify-end xl:hidden"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md h-full bg-[var(--surface)] text-[var(--text)] shadow-2xl flex flex-col outline-none"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold truncate">{title}</div>
          <button type="button" className="text-xl text-[var(--muted)]" onClick={onClose} aria-label="Close details panel">
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
  const isDesktopPeopleDetails = useMediaQuery('(min-width: 1280px)');

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
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [isMobileSkillDetailOpen, setIsMobileSkillDetailOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [isMobilePersonDetailOpen, setIsMobilePersonDetailOpen] = useState(false);

  const [mode, setMode] = useState<AssignmentMode>('people_to_skills');
  const [isAddSkillOpen, setIsAddSkillOpen] = useState(false);
  const [scopePickerSkillId, setScopePickerSkillId] = useState<number | null>(null);
  const [scopeTargetDepartmentId, setScopeTargetDepartmentId] = useState<number | ''>('');
  const [detailAddPersonQuery, setDetailAddPersonQuery] = useState('');
  const [detailAddPersonResults, setDetailAddPersonResults] = useState<Person[]>([]);
  const [detailAddPersonLoading, setDetailAddPersonLoading] = useState(false);
  const [removingSkillPersonId, setRemovingSkillPersonId] = useState<number | null>(null);
  const [addSkillsPersonId, setAddSkillsPersonId] = useState<number | null>(null);
  const [addSkillsQuery, setAddSkillsQuery] = useState('');
  const [addSkillsResults, setAddSkillsResults] = useState<SkillTag[]>([]);
  const [addSkillsLoading, setAddSkillsLoading] = useState(false);
  const [addSkillsSelectedIndex, setAddSkillsSelectedIndex] = useState(-1);
  const [addSkillsSrAnnouncement, setAddSkillsSrAnnouncement] = useState('');
  const [addSkillsDropdownAbove, setAddSkillsDropdownAbove] = useState(false);
  const addSkillsInputRef = useRef<HTMLInputElement | null>(null);
  const [detailAddSkillQuery, setDetailAddSkillQuery] = useState('');
  const [detailAddSkillResults, setDetailAddSkillResults] = useState<SkillTag[]>([]);
  const [detailAddSkillLoading, setDetailAddSkillLoading] = useState(false);
  const [detailAddSkillType, setDetailAddSkillType] = useState<PersonSkill['skillType']>('strength');
  const [removingPersonSkillId, setRemovingPersonSkillId] = useState<number | null>(null);

  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('');
  const [newSkillScope, setNewSkillScope] = useState<'global' | 'department'>('global');

  const [strengthAssignments, setStrengthAssignments] = useState<PersonSkill[]>([]);
  const [peopleModeSkills, setPeopleModeSkills] = useState<PersonSkill[]>([]);
  const lastSkillSaveToastAtRef = useRef(0);

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

  const loadPeopleModeSkills = useCallback(async () => {
    const personIds = people.map((person) => person.id).filter((id): id is number => typeof id === 'number');
    if (!personIds.length) {
      setPeopleModeSkills([]);
      return;
    }

    const allRows: PersonSkill[] = [];
    let page = 1;
    while (true) {
      const res = await personSkillsApi.list({
        person_ids: personIds,
        page,
        page_size: 200,
      });
      allRows.push(...(res.results || []));
      const nextPage = nextPageFromUrl(res.next);
      if (!nextPage) break;
      page = nextPage;
    }
    setPeopleModeSkills(allRows);
  }, [people]);

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
  }, [verticalState.selectedVerticalId]);

  useEffect(() => {
    void loadSkills(1, false);
    void loadPeople(1, false);
  }, [selectedDepartmentId, skillSearch, peopleSearch, verticalState.selectedVerticalId, loadSkills, loadPeople]);

  useEffect(() => {
    void loadStrengthAssignments();
  }, [loadStrengthAssignments]);

  useEffect(() => {
    if (mode !== 'people_to_skills') return;
    void loadPeopleModeSkills();
  }, [mode, loadPeopleModeSkills]);

  useEffect(() => {
    if (mode !== 'people_to_skills') return;
    if (people.length === 0) {
      setSelectedPersonId(null);
      setIsMobilePersonDetailOpen(false);
      return;
    }
    setSelectedPersonId((prev) => {
      if (prev != null && people.some((person) => person.id === prev)) return prev;
      return people[0]?.id ?? null;
    });
  }, [mode, people]);

  useEffect(() => {
    if (mode !== 'skill_to_people') return;
    if (skills.length === 0) {
      setSelectedSkillId(null);
      setIsMobileSkillDetailOpen(false);
      return;
    }
    setSelectedSkillId((prev) => {
      if (prev != null && skills.some((skill) => skill.id === prev)) return prev;
      return skills[0]?.id ?? null;
    });
  }, [mode, skills]);

  useEffect(() => {
    if (!isDesktopPeopleDetails) return;
    setIsMobilePersonDetailOpen(false);
    setIsMobileSkillDetailOpen(false);
  }, [isDesktopPeopleDetails]);

  useEffect(() => {
    setDetailAddSkillQuery('');
    setDetailAddSkillResults([]);
    setDetailAddSkillLoading(false);
    setDetailAddSkillType('strength');
  }, [selectedPersonId]);

  useEffect(() => {
    setDetailAddPersonQuery('');
    setDetailAddPersonResults([]);
    setDetailAddPersonLoading(false);
  }, [selectedSkillId]);

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
    setDetailAddPersonQuery('');
    setDetailAddPersonResults([]);
    setDetailAddPersonLoading(false);
    setRemovingSkillPersonId(null);
    setAddSkillsPersonId(null);
    setAddSkillsQuery('');
    setAddSkillsResults([]);
    setAddSkillsLoading(false);
    setAddSkillsSelectedIndex(-1);
    setAddSkillsSrAnnouncement('');
    setDetailAddSkillQuery('');
    setDetailAddSkillResults([]);
    setDetailAddSkillLoading(false);
    setDetailAddSkillType('strength');
    setRemovingPersonSkillId(null);
    setIsMobilePersonDetailOpen(false);
    setIsMobileSkillDetailOpen(false);
  }, [selectedDepartmentId, mode]);

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
    if (mode !== 'skill_to_people' || selectedSkillId == null) {
      setDetailAddPersonResults([]);
      setDetailAddPersonLoading(false);
      return;
    }
    if (!detailAddPersonQuery.trim()) {
      setDetailAddPersonResults([]);
      setDetailAddPersonLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setDetailAddPersonLoading(true);
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
        if (detailAddPersonQuery.trim()) {
          payload.search_tokens = [{ term: detailAddPersonQuery.trim(), op: 'and' }];
        }

        const res = await peopleApi.searchList(payload);
        if (cancelled) return;
        const nextResults = (res.results || []).filter((person) => person.department != null);
        setDetailAddPersonResults(nextResults);
      } catch {
        if (!cancelled) {
          setDetailAddPersonResults([]);
        }
      } finally {
        if (!cancelled) setDetailAddPersonLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, selectedSkillId, detailAddPersonQuery, selectedDepartmentId, verticalState.selectedVerticalId]);

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

  useEffect(() => {
    if (mode !== 'people_to_skills' || selectedPersonId == null) {
      setDetailAddSkillResults([]);
      setDetailAddSkillLoading(false);
      return;
    }
    if (!detailAddSkillQuery.trim()) {
      setDetailAddSkillResults([]);
      setDetailAddSkillLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setDetailAddSkillLoading(true);
      try {
        const res = await skillTagsApi.list({
          search: detailAddSkillQuery.trim(),
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
        setDetailAddSkillResults(Array.from(dedup.values()));
      } catch {
        if (!cancelled) {
          setDetailAddSkillResults([]);
        }
      } finally {
        if (!cancelled) setDetailAddSkillLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    detailAddSkillQuery,
    mode,
    selectedPersonId,
    selectedDepartmentId,
    verticalState.selectedVerticalId,
  ]);

  const isAddSkillsSearchOpen = useMemo(
    () =>
      mode === 'people_to_skills'
      && addSkillsPersonId != null
      && addSkillsQuery.trim().length > 0
      && addSkillsResults.length > 0,
    [mode, addSkillsPersonId, addSkillsQuery, addSkillsResults.length]
  );

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

  const sortedPeopleModeSkills = useMemo(() => {
    return [...peopleModeSkills].sort((a, b) => {
      const nameA = (a.skillTagName || '').toLowerCase();
      const nameB = (b.skillTagName || '').toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      const updatedA = a.updatedAt || '';
      const updatedB = b.updatedAt || '';
      return String(updatedB).localeCompare(String(updatedA));
    });
  }, [peopleModeSkills]);

  const peopleModeSkillsByPerson = useMemo(() => {
    const map = new Map<number, PersonSkill[]>();
    sortedPeopleModeSkills.forEach((row) => {
      if (!row.person) return;
      const list = map.get(row.person) || [];
      list.push(row);
      map.set(row.person, list);
    });
    return map;
  }, [sortedPeopleModeSkills]);

  const peopleModeAssignmentSet = useMemo(() => {
    const set = new Set<string>();
    peopleModeSkills.forEach((row) => {
      if (!row.person || !row.skillTagId || !row.skillType) return;
      set.add(`${row.person}:${row.skillTagId}:${row.skillType}`);
    });
    return set;
  }, [peopleModeSkills]);

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) || null,
    [people, selectedPersonId]
  );
  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) || null,
    [skills, selectedSkillId]
  );
  const selectedSkillPeople = useMemo(() => {
    if (!selectedSkill?.id) return [] as Person[];
    return peopleForSkill.get(selectedSkill.id) || [];
  }, [peopleForSkill, selectedSkill?.id]);

  const selectedPersonSkillsGrouped = useMemo(() => {
    const result = {
      strengths: [] as PersonSkill[],
      inProgress: [] as PersonSkill[],
      goals: [] as PersonSkill[],
    };
    if (selectedPersonId == null) return result;
    const rows = peopleModeSkillsByPerson.get(selectedPersonId) || [];
    rows.forEach((row) => {
      if (row.skillType === 'strength') result.strengths.push(row);
      else if (row.skillType === 'in_progress') result.inProgress.push(row);
      else if (row.skillType === 'goals') result.goals.push(row);
    });
    return result;
  }, [peopleModeSkillsByPerson, selectedPersonId]);

  const detailAddSkillFilteredResults = useMemo(() => {
    if (selectedPersonId == null) return [];
    return detailAddSkillResults.filter((skill) => {
      if (!skill.id) return false;
      return !peopleModeAssignmentSet.has(`${selectedPersonId}:${skill.id}:${detailAddSkillType}`);
    });
  }, [detailAddSkillResults, detailAddSkillType, peopleModeAssignmentSet, selectedPersonId]);
  const detailAddPersonFilteredResults = useMemo(() => {
    if (selectedSkillId == null) return [] as Person[];
    return detailAddPersonResults.filter((person) => {
      if (!person.id) return false;
      return !assignmentSet.has(`${person.id}:${selectedSkillId}`);
    });
  }, [assignmentSet, detailAddPersonResults, selectedSkillId]);

  const {
    getDraftForSkill,
    getSaveStateForSkill,
    getErrorForSkill,
    updateSkillDraft,
    flushSkillDraft,
    retrySkillSave,
  } = usePersonSkillAutoSave({
    skills: peopleModeSkills,
    debounceMs: 400,
    onPersist: (skillId, patch) => personSkillsApi.update(skillId, patch),
    onDraftOptimistic: (skillId, patch) => {
      setPeopleModeSkills((prev) =>
        prev.map((row) => (row.id === skillId ? { ...row, ...patch } : row))
      );
    },
    onPersistSuccess: (savedSkill) => {
      if (!savedSkill.id) return;
      setPeopleModeSkills((prev) =>
        prev.map((row) => (row.id === savedSkill.id ? { ...row, ...savedSkill } : row))
      );
      const now = Date.now();
      if (now - lastSkillSaveToastAtRef.current > 1200) {
        showToast('Saved', 'success');
        lastSkillSaveToastAtRef.current = now;
      }
    },
  });

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

  const selectPersonForDetails = (person: Person) => {
    if (!person.id) return;
    setSelectedPersonId(person.id);
    if (!isDesktopPeopleDetails) {
      setIsMobilePersonDetailOpen(true);
    }
  };

  const selectSkillForDetails = (skill: SkillTag) => {
    if (!skill.id) return;
    setSelectedSkillId(skill.id);
    if (!isDesktopPeopleDetails) {
      setIsMobileSkillDetailOpen(true);
    }
  };

  const onAddSkillsQueryChange = (value: string) => {
    setAddSkillsQuery(value);
    setAddSkillsSelectedIndex(-1);
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
      if (mode === 'people_to_skills') {
        await loadPeopleModeSkills();
      }
      if (result.created > 0) {
        showToast(`Added ${person.name} to ${skill.name}`, 'success');
      } else {
        showToast(`${person.name} already has ${skill.name}`, 'info');
      }
      setDetailAddPersonQuery('');
      setDetailAddPersonResults([]);
    } catch (err: any) {
      showToast(err?.message || 'Failed to add person to skill', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addSkillToPerson = async (
    person: Person,
    skill: SkillTag,
    skillType: PersonSkill['skillType'] = 'strength'
  ) => {
    if (!person.id || !skill.id) return;
    if (peopleModeAssignmentSet.has(`${person.id}:${skill.id}:${skillType}`)) {
      showToast(`${person.name} already has ${skill.name} as ${skillType}`, 'info');
      return;
    }
    setBusy(true);
    try {
      await personSkillsApi.bulkAssign({
        operation: 'assign',
        personIds: [person.id],
        skillTagIds: [skill.id],
        skillType,
        proficiencyLevel: 'beginner',
      });
      await Promise.all([loadStrengthAssignments(), loadPeopleModeSkills()]);
      showToast(`Added ${skill.name} to ${person.name}`, 'success');
      setAddSkillsQuery('');
      setAddSkillsResults([]);
      setAddSkillsSelectedIndex(-1);
      setAddSkillsSrAnnouncement('');
      setDetailAddSkillQuery('');
      setDetailAddSkillResults([]);
    } catch (err: any) {
      showToast(err?.message || 'Failed to add skill to person', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeSkillFromPerson = async (skill: PersonSkill) => {
    if (!skill.id) return;
    const label = skill.skillTagName || 'this skill';
    const person = selectedPerson?.name || 'this person';
    const confirmed = await confirmAction({
      title: 'Remove Skill',
      message: `Remove "${label}" from ${person}?`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    setRemovingPersonSkillId(skill.id);
    setBusy(true);
    try {
      await personSkillsApi.delete(skill.id);
      await Promise.all([loadPeopleModeSkills(), loadStrengthAssignments()]);
      showToast(`Removed ${label} from ${person}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to remove skill', 'error');
    } finally {
      setRemovingPersonSkillId(null);
      setBusy(false);
    }
  };

  const removePersonFromSkill = async (skill: SkillTag, person: Person) => {
    if (!skill.id || !person.id) return;
    const confirmed = await confirmAction({
      title: 'Remove Person',
      message: `Remove ${person.name} from "${skill.name}"?`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    setRemovingSkillPersonId(person.id);
    setBusy(true);
    try {
      await personSkillsApi.bulkAssign({
        operation: 'unassign',
        personIds: [person.id],
        skillTagIds: [skill.id],
        skillType: 'strength',
      });
      await loadStrengthAssignments();
      showToast(`Removed ${person.name} from ${skill.name}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to remove person from skill', 'error');
    } finally {
      setRemovingSkillPersonId(null);
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
      setScopePickerSkillId((prev) => (prev === skill.id ? null : prev));
      setSelectedSkillId((prev) => (prev === skill.id ? null : prev));
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

  const skillPeopleDetailPaneContent = !selectedSkill ? (
    <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
      Select a skill to view people.
    </div>
  ) : (
    <div className="space-y-3">
      <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="text-base font-semibold text-[var(--text)]">{selectedSkill.name}</div>
        <div className="text-xs text-[var(--muted)]">
          {selectedSkill.scopeType === 'global' ? 'Global' : (selectedSkill.departmentName || 'Department')}
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">{selectedSkillPeople.length} assigned people</div>
      </div>

      <section className="rounded border border-[var(--border)] bg-[var(--surface)] p-3">
        <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">Add Person</h4>
        <input
          type="text"
          value={detailAddPersonQuery}
          onChange={(event) => setDetailAddPersonQuery(event.target.value)}
          className="h-8 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] placeholder-[var(--muted)]"
          placeholder="Type to search and click a person..."
          disabled={busy}
        />
        {detailAddPersonQuery.trim().length > 0 ? (
          <div className="mt-2 rounded border border-[var(--border)] bg-[var(--card)]">
            {detailAddPersonLoading ? (
              <div className="px-2 py-2 text-xs text-[var(--muted)]">Searching people...</div>
            ) : detailAddPersonFilteredResults.length === 0 ? (
              <div className="px-2 py-2 text-xs text-[var(--muted)]">No people found.</div>
            ) : (
              <div className="max-h-56 overflow-y-auto">
                {detailAddPersonFilteredResults.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="w-full border-b border-[var(--border)] px-2 py-1 text-left text-xs text-[var(--text)] transition-colors hover:bg-[var(--cardHover)] last:border-b-0"
                    onClick={() => void addPersonToSkill(selectedSkill, person)}
                    disabled={busy}
                  >
                    <div className="truncate font-medium">{person.name}</div>
                    <div className="truncate text-[var(--muted)]">
                      {deptById.get(person.department || -1)?.name || 'Department'} | {person.roleName || 'No role'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded border border-[var(--border)] bg-[var(--surface)] p-3">
        <h4 className="mb-2 text-sm font-semibold text-[var(--text)]">People</h4>
        {selectedSkillPeople.length === 0 ? (
          <div className="text-xs text-[var(--muted)]">
            No people currently have this skill as a strength.
          </div>
        ) : (
          <div className="space-y-2">
            {selectedSkillPeople.map((person) => (
              <div
                key={person.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text)]">{person.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {deptById.get(person.department || -1)?.name || 'Department'} | {person.roleName || 'No role'}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded border border-red-400/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void removePersonFromSkill(selectedSkill, person)}
                  disabled={busy || removingSkillPersonId === person.id}
                >
                  {removingSkillPersonId === person.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

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
      <div className="flex h-full min-h-0 w-full flex-col gap-4">
        <div className="ux-page-hero flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Skills Workspace</h1>
            <p className="text-sm text-[var(--muted)]">
              Browse strength skills by department, or browse people with their current skills.
            </p>
            <p className="text-xs text-[var(--muted)]">
              {mode === 'skill_to_people'
                ? 'Mode 1: select a skill row to view and manage people in the detail pane.'
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

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="ux-panel h-full min-h-0 p-3">
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

          <Card className="ux-panel h-full min-h-0 p-3">
            {mode === 'skill_to_people' ? (
              <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="flex h-full min-h-0 flex-col gap-3 rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                  <div className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surfaceHover)] px-2 py-1.5">
                    <h2 className="text-sm font-semibold text-[var(--text)]">Skills ({selectedDepartmentName})</h2>
                    <div className="text-xs text-[var(--muted)]">{skills.length} loaded</div>
                  </div>
                  <Input
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    placeholder="Search skills..."
                  />

                  <div className="flex-1 min-h-0 overflow-auto rounded border border-[var(--border)] bg-[var(--card)]">
                    {skills.map((skill) => {
                      const assignedPeople = skill.id ? (peopleForSkill.get(skill.id) || []) : [];
                      const isSelected = skill.id != null && selectedSkillId === skill.id;
                      return (
                        <div
                          key={skill.id}
                          className={`cursor-pointer border-b border-[var(--border)] px-2 py-2 last:border-b-0 ${
                            isSelected
                              ? 'border-l-4 border-l-[var(--focus)] bg-[var(--surfaceHover)]'
                              : 'border-l-4 border-l-transparent hover:bg-[var(--surfaceHover)]'
                          }`}
                          onClick={() => selectSkillForDetails(skill)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-[var(--text)]">{skill.name}</div>
                              <div className="text-xs text-[var(--muted)]">
                                {skill.scopeType === 'global' ? 'Global' : (skill.departmentName || 'Department')} | {assignedPeople.length} people
                              </div>
                            </div>
                            <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                              {skill.scopeType === 'global' && selectedDepartmentId == null && scopePickerSkillId === skill.id ? (
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
                          <div className="mt-2 flex flex-wrap gap-1">
                            {assignedPeople.length === 0 ? (
                              <span className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
                                No people
                              </span>
                            ) : (
                              <>
                                {assignedPeople.slice(0, 6).map((person) => (
                                  <span
                                    key={person.id}
                                    className="rounded border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300"
                                  >
                                    {person.name}
                                  </span>
                                ))}
                                {assignedPeople.length > 6 ? (
                                  <span className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
                                    +{assignedPeople.length - 6} more
                                  </span>
                                ) : null}
                              </>
                            )}
                          </div>
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

                <div className="hidden xl:block min-h-0 overflow-y-auto rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                  {skillPeopleDetailPaneContent}
                </div>
              </div>
            ) : (
              <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="flex h-full min-h-0 flex-col gap-3 rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                  <div className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surfaceHover)] px-2 py-1.5">
                    <h2 className="text-sm font-semibold text-[var(--text)]">People ({selectedDepartmentName})</h2>
                    <div className="text-xs text-[var(--muted)]">{people.length} loaded</div>
                  </div>
                  <Input
                    value={peopleSearch}
                    onChange={(e) => setPeopleSearch(e.target.value)}
                    placeholder="Search people..."
                  />

                  <div className="flex-1 min-h-0 overflow-auto rounded border border-[var(--border)] bg-[var(--card)]">
                    {people.map((person) => {
                      const personSkills = person.id ? (peopleModeSkillsByPerson.get(person.id) || []) : [];
                      const isSelected = person.id != null && selectedPersonId === person.id;
                      return (
                        <div
                          key={person.id}
                          className={`border-b border-[var(--border)] px-2 py-2 last:border-b-0 ${
                            isSelected
                              ? 'border-l-4 border-l-[var(--focus)] bg-[var(--surfaceHover)]'
                              : 'border-l-4 border-l-transparent hover:bg-[var(--surfaceHover)]'
                          }`}
                          onClick={() => selectPersonForDetails(person)}
                        >
                          <div
                            className="flex cursor-pointer items-center justify-between gap-2"
                          >
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
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (person.id != null) setSelectedPersonId(person.id);
                                  toggleAddSkillsPanel(person.id);
                                }}
                                disabled={busy}
                                aria-label={`Add skill to ${person.name}`}
                              >
                                {addSkillsPersonId === person.id ? '-' : '+'}
                              </button>
                            </div>
                          </div>
                          {addSkillsPersonId === person.id && (
                            <div
                              className="mt-2 rounded border border-[var(--border)] bg-[var(--card)] p-2"
                              onClick={(event) => event.stopPropagation()}
                            >
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
                                  className={`rounded border px-2 py-0.5 text-xs ${personSkillPillClass(skill.skillType)}`}
                                >
                                  {skill.skillTagName || 'Skill'}
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

                <div className="hidden xl:block min-h-0 overflow-y-auto rounded border border-[var(--border)] bg-[var(--surface)] p-2">
                  <PersonSkillDetailPanel
                    person={selectedPerson}
                    groupedSkills={selectedPersonSkillsGrouped}
                    getDraftForSkill={getDraftForSkill}
                    getSaveStateForSkill={getSaveStateForSkill}
                    getErrorForSkill={getErrorForSkill}
                    onSkillDraftChange={updateSkillDraft}
                    onSkillDraftBlur={flushSkillDraft}
                    onRetrySkillSave={retrySkillSave}
                    onRemoveSkill={removeSkillFromPerson}
                    removingSkillId={removingPersonSkillId}
                    addSkillQuery={detailAddSkillQuery}
                    addSkillType={detailAddSkillType}
                    addSkillResults={detailAddSkillFilteredResults}
                    addSkillLoading={detailAddSkillLoading}
                    onAddSkillQueryChange={setDetailAddSkillQuery}
                    onAddSkillTypeChange={(value) => setDetailAddSkillType(value)}
                    onAddSkill={(skill) => {
                      if (!selectedPerson) return;
                      void addSkillToPerson(selectedPerson, skill, detailAddSkillType);
                    }}
                    addSkillDisabled={busy || !selectedPerson}
                  />
                </div>
              </div>
            )}
          </Card>
        </div>

        <PersonDetailsDrawer
          open={mode === 'people_to_skills' && !isDesktopPeopleDetails && isMobilePersonDetailOpen}
          onClose={() => setIsMobilePersonDetailOpen(false)}
          title={selectedPerson?.name ? `${selectedPerson.name} Details` : 'Person Details'}
        >
          <PersonSkillDetailPanel
            person={selectedPerson}
            groupedSkills={selectedPersonSkillsGrouped}
            getDraftForSkill={getDraftForSkill}
            getSaveStateForSkill={getSaveStateForSkill}
            getErrorForSkill={getErrorForSkill}
            onSkillDraftChange={updateSkillDraft}
            onSkillDraftBlur={flushSkillDraft}
            onRetrySkillSave={retrySkillSave}
            onRemoveSkill={removeSkillFromPerson}
            removingSkillId={removingPersonSkillId}
            addSkillQuery={detailAddSkillQuery}
            addSkillType={detailAddSkillType}
            addSkillResults={detailAddSkillFilteredResults}
            addSkillLoading={detailAddSkillLoading}
            onAddSkillQueryChange={setDetailAddSkillQuery}
            onAddSkillTypeChange={(value) => setDetailAddSkillType(value)}
            onAddSkill={(skill) => {
              if (!selectedPerson) return;
              void addSkillToPerson(selectedPerson, skill, detailAddSkillType);
            }}
            addSkillDisabled={busy || !selectedPerson}
          />
        </PersonDetailsDrawer>

        <PersonDetailsDrawer
          open={mode === 'skill_to_people' && !isDesktopPeopleDetails && isMobileSkillDetailOpen}
          onClose={() => setIsMobileSkillDetailOpen(false)}
          title={selectedSkill?.name ? `${selectedSkill.name} People` : 'Skill People'}
        >
          {skillPeopleDetailPaneContent}
        </PersonDetailsDrawer>

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
