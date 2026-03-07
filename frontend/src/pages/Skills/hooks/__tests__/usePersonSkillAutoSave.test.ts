import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PersonSkill } from '@/types/models';
import { usePersonSkillAutoSave } from '@/pages/Skills/hooks/usePersonSkillAutoSave';

const BASE_SKILL: PersonSkill = {
  id: 101,
  person: 7,
  skillTagId: 12,
  skillTagName: 'Heat Calc',
  skillType: 'strength',
  proficiencyLevel: 'beginner',
  notes: '',
  lastUsed: null,
  createdAt: '2026-03-06T00:00:00Z',
  updatedAt: '2026-03-06T00:00:00Z',
};

describe('usePersonSkillAutoSave', () => {
  it('debounces patch persistence and keeps optimistic draft', async () => {
    const onPersist = vi.fn(async (
      _id: number,
      patch: Partial<{
        skillType: PersonSkill['skillType'];
        proficiencyLevel: PersonSkill['proficiencyLevel'];
        notes: string;
      }>
    ) => ({
      ...BASE_SKILL,
      ...patch,
    }));

    const { result, unmount } = renderHook(() =>
      usePersonSkillAutoSave({
        skills: [BASE_SKILL],
        debounceMs: 5,
        onPersist,
      })
    );

    act(() => {
      result.current.updateSkillDraft(BASE_SKILL, { notes: 'Needs mentoring' });
    });

    expect(result.current.getDraftForSkill(BASE_SKILL).notes).toBe('Needs mentoring');
    expect(onPersist).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await waitFor(() => {
      expect(onPersist).toHaveBeenCalledWith(101, { notes: 'Needs mentoring' });
    });
    unmount();
  });

  it('flushes immediately on blur', async () => {
    const onPersist = vi.fn(async (
      _id: number,
      patch: Partial<{
        skillType: PersonSkill['skillType'];
        proficiencyLevel: PersonSkill['proficiencyLevel'];
        notes: string;
      }>
    ) => ({
      ...BASE_SKILL,
      ...patch,
    }));

    const { result, unmount } = renderHook(() =>
      usePersonSkillAutoSave({
        skills: [BASE_SKILL],
        debounceMs: 5,
        onPersist,
      })
    );

    act(() => {
      result.current.updateSkillDraft(BASE_SKILL, { proficiencyLevel: 'intermediate' });
      result.current.flushSkillDraft(101);
    });

    await waitFor(() => {
      expect(onPersist).toHaveBeenCalledWith(101, { proficiencyLevel: 'intermediate' });
    });
    unmount();
  });

  it('supports retry after a failed save', async () => {
    const onPersist = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ...BASE_SKILL, notes: 'Retry succeeded' });

    const { result, unmount } = renderHook(() =>
      usePersonSkillAutoSave({
        skills: [BASE_SKILL],
        debounceMs: 5,
        onPersist,
      })
    );

    act(() => {
      result.current.updateSkillDraft(BASE_SKILL, { notes: 'Retry succeeded' });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    await waitFor(() => {
      expect(result.current.getSaveStateForSkill(101)).toBe('error');
    });

    act(() => {
      result.current.retrySkillSave(101);
    });

    await waitFor(() => {
      expect(onPersist).toHaveBeenCalledTimes(2);
      expect(result.current.getSaveStateForSkill(101)).toBe('saved');
    });
    unmount();
  });
});
