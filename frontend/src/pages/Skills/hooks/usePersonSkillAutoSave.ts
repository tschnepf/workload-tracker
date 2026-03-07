import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SaveState } from '@/components/ux/SaveStateBadge';
import type { PersonSkill } from '@/types/models';

type SkillDraft = {
  skillType: PersonSkill['skillType'];
  proficiencyLevel: PersonSkill['proficiencyLevel'];
  notes: string;
};

type SkillPatch = Partial<SkillDraft>;

type UsePersonSkillAutoSaveArgs = {
  skills: PersonSkill[];
  debounceMs?: number;
  onPersist: (skillId: number, patch: SkillPatch) => Promise<PersonSkill>;
  onDraftOptimistic?: (skillId: number, patch: SkillPatch) => void;
  onPersistSuccess?: (savedSkill: PersonSkill) => void;
};

function mergePatch(base: SkillPatch | undefined, incoming: SkillPatch): SkillPatch {
  return {
    ...(base || {}),
    ...incoming,
  };
}

export function usePersonSkillAutoSave({
  skills,
  debounceMs = 400,
  onPersist,
  onDraftOptimistic,
  onPersistSuccess,
}: UsePersonSkillAutoSaveArgs) {
  const [draftById, setDraftById] = useState<Record<number, SkillDraft>>({});
  const [saveStateById, setSaveStateById] = useState<Record<number, SaveState>>({});
  const [errorById, setErrorById] = useState<Record<number, string>>({});

  const skillsById = useMemo(() => {
    const map = new Map<number, PersonSkill>();
    skills.forEach((skill) => {
      if (skill.id != null) map.set(skill.id, skill);
    });
    return map;
  }, [skills]);

  const activeSkillIds = useMemo(() => Array.from(skillsById.keys()).sort((a, b) => a - b), [skillsById]);
  const activeSkillIdsKey = useMemo(() => activeSkillIds.join(','), [activeSkillIds]);

  const inFlightRef = useRef<Record<number, boolean>>({});
  const pendingPatchRef = useRef<Record<number, SkillPatch>>({});
  const failedPatchRef = useRef<Record<number, SkillPatch>>({});
  const debounceTimerRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const savedStateTimerRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const clearSkillDebounce = useCallback((skillId: number) => {
    const timer = debounceTimerRef.current[skillId];
    if (!timer) return;
    clearTimeout(timer);
    delete debounceTimerRef.current[skillId];
  }, []);

  const clearSavedStateTimer = useCallback((skillId: number) => {
    const timer = savedStateTimerRef.current[skillId];
    if (!timer) return;
    clearTimeout(timer);
    delete savedStateTimerRef.current[skillId];
  }, []);

  const setSaveState = useCallback((skillId: number, nextState: SaveState) => {
    setSaveStateById((prev) => ({ ...prev, [skillId]: nextState }));
  }, []);

  const setSkillDraft = useCallback((skill: PersonSkill, patch: SkillPatch) => {
    if (skill.id == null) return;
    setDraftById((prev) => {
      const existing = prev[skill.id!];
      const next: SkillDraft = {
        skillType: patch.skillType ?? existing?.skillType ?? skill.skillType ?? 'strength',
        proficiencyLevel: patch.proficiencyLevel ?? existing?.proficiencyLevel ?? skill.proficiencyLevel ?? 'beginner',
        notes: patch.notes ?? existing?.notes ?? skill.notes ?? '',
      };
      return { ...prev, [skill.id!]: next };
    });
  }, []);

  const flushSkillDraft = useCallback(async (skillId: number) => {
    if (!skillId) return;
    clearSkillDebounce(skillId);
    if (inFlightRef.current[skillId]) return;

    const pendingPatch = pendingPatchRef.current[skillId];
    if (!pendingPatch || Object.keys(pendingPatch).length === 0) return;

    delete pendingPatchRef.current[skillId];
    inFlightRef.current[skillId] = true;
    clearSavedStateTimer(skillId);
    setSaveState(skillId, 'saving');
    setErrorById((prev) => {
      if (!(skillId in prev)) return prev;
      const next = { ...prev };
      delete next[skillId];
      return next;
    });

    try {
      const saved = await onPersist(skillId, pendingPatch);
      delete failedPatchRef.current[skillId];
      onPersistSuccess?.(saved);
      setSaveState(skillId, 'saved');
      savedStateTimerRef.current[skillId] = setTimeout(() => {
        setSaveStateById((prev) => {
          if (prev[skillId] !== 'saved') return prev;
          return { ...prev, [skillId]: 'idle' };
        });
        delete savedStateTimerRef.current[skillId];
      }, 1200);
    } catch (err: any) {
      failedPatchRef.current[skillId] = mergePatch(failedPatchRef.current[skillId], pendingPatch);
      setSaveState(skillId, 'error');
      setErrorById((prev) => ({
        ...prev,
        [skillId]: err?.message || 'Failed to save skill changes',
      }));
    } finally {
      inFlightRef.current[skillId] = false;
      if (pendingPatchRef.current[skillId]) {
        void flushSkillDraft(skillId);
      }
    }
  }, [clearSavedStateTimer, clearSkillDebounce, onPersist, onPersistSuccess, setSaveState]);

  const queuePatch = useCallback((skillId: number, patch: SkillPatch) => {
    if (!skillId || Object.keys(patch).length === 0) return;
    pendingPatchRef.current[skillId] = mergePatch(pendingPatchRef.current[skillId], patch);
    clearSkillDebounce(skillId);
    debounceTimerRef.current[skillId] = setTimeout(() => {
      void flushSkillDraft(skillId);
    }, debounceMs);
  }, [clearSkillDebounce, debounceMs, flushSkillDraft]);

  const updateSkillDraft = useCallback((skill: PersonSkill, patch: SkillPatch) => {
    if (!skill.id) return;
    setSkillDraft(skill, patch);
    onDraftOptimistic?.(skill.id, patch);
    queuePatch(skill.id, patch);
  }, [onDraftOptimistic, queuePatch, setSkillDraft]);

  const retrySkillSave = useCallback((skillId: number) => {
    if (!skillId) return;
    const failedPatch = failedPatchRef.current[skillId];
    if (!failedPatch) return;
    pendingPatchRef.current[skillId] = mergePatch(pendingPatchRef.current[skillId], failedPatch);
    void flushSkillDraft(skillId);
  }, [flushSkillDraft]);

  const getDraftForSkill = useCallback((skill: PersonSkill): SkillDraft => {
    if (!skill.id) {
      return {
        skillType: skill.skillType || 'strength',
        proficiencyLevel: skill.proficiencyLevel || 'beginner',
        notes: skill.notes || '',
      };
    }
    const existing = draftById[skill.id];
    if (existing) return existing;
    return {
      skillType: skill.skillType || 'strength',
      proficiencyLevel: skill.proficiencyLevel || 'beginner',
      notes: skill.notes || '',
    };
  }, [draftById]);

  const getSaveStateForSkill = useCallback((skillId?: number): SaveState => {
    if (!skillId) return 'idle';
    return saveStateById[skillId] || 'idle';
  }, [saveStateById]);

  const getErrorForSkill = useCallback((skillId?: number): string | undefined => {
    if (!skillId) return undefined;
    return errorById[skillId];
  }, [errorById]);

  useEffect(() => {
    const activeIds = new Set<number>(
      activeSkillIdsKey
        ? activeSkillIdsKey.split(',').map((raw) => Number(raw)).filter((id) => Number.isFinite(id) && id > 0)
        : []
    );

    const cleanupStateObject = <T extends Record<number, any>>(source: T): T => {
      let changed = false;
      const next: Record<number, any> = {};
      Object.entries(source).forEach(([key, value]) => {
        const id = Number(key);
        if (!Number.isFinite(id) || !activeIds.has(id)) {
          changed = true;
          return;
        }
        next[id] = value;
      });
      return changed ? (next as T) : source;
    };

    const cleanupRefObject = <T extends Record<number, any>>(source: T, disposer?: (skillId: number) => void): T => {
      let changed = false;
      const next: Record<number, any> = {};
      Object.entries(source).forEach(([key, value]) => {
        const id = Number(key);
        if (!Number.isFinite(id) || !activeIds.has(id)) {
          changed = true;
          disposer?.(id);
          return;
        }
        next[id] = value;
      });
      return changed ? (next as T) : source;
    };

    setDraftById((prev) => cleanupStateObject(prev));
    setSaveStateById((prev) => cleanupStateObject(prev));
    setErrorById((prev) => cleanupStateObject(prev));
    pendingPatchRef.current = cleanupRefObject(pendingPatchRef.current);
    failedPatchRef.current = cleanupRefObject(failedPatchRef.current);
    inFlightRef.current = cleanupRefObject(inFlightRef.current);
    debounceTimerRef.current = cleanupRefObject(debounceTimerRef.current, clearSkillDebounce);
    savedStateTimerRef.current = cleanupRefObject(savedStateTimerRef.current, clearSavedStateTimer);
  }, [activeSkillIdsKey, clearSavedStateTimer, clearSkillDebounce]);

  useEffect(() => {
    return () => {
      Object.keys(debounceTimerRef.current).forEach((key) => {
        const id = Number(key);
        clearSkillDebounce(id);
      });
      Object.keys(savedStateTimerRef.current).forEach((key) => {
        const id = Number(key);
        clearSavedStateTimer(id);
      });
    };
  }, [clearSavedStateTimer, clearSkillDebounce]);

  return {
    getDraftForSkill,
    getSaveStateForSkill,
    getErrorForSkill,
    updateSkillDraft,
    flushSkillDraft,
    retrySkillSave,
  } as const;
}
