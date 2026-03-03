import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAutoHoursSettings } from '@/features/work-planning/auto-hours/useAutoHoursSettings';

describe('useAutoHoursSettings', () => {
  it('hydrates from auto hours bundle', async () => {
    const autoHoursBundle = {
      defaultSettingsByPhase: { sd: [{ roleId: 1, percent: 40 } as any] },
      templates: [{ id: 9, name: 'T1', isActive: true, phaseKeys: ['sd'] } as any],
      phaseMapping: { useDescriptionMatch: true, phases: [] },
      templateSettingsByPhase: { '9': { sd: [{ roleId: 1, percent: 20 } as any] } },
      bundleComplete: true,
    };
    const listDefaultSettings = vi.fn(async () => ({ settings: [] }));
    const listTemplates = vi.fn(async () => []);
    const listTemplateSettings = vi.fn(async () => []);
    const fetchPhaseMapping = vi.fn(async () => null);

    const { result } = renderHook(() => useAutoHoursSettings({
      enabled: true,
      shouldUseLegacyFallback: false,
      defaultPhaseKeys: ['sd', 'dd'],
      autoHoursBundle,
      listDefaultSettings,
      listTemplates,
      listTemplateSettings,
      fetchPhaseMapping,
    }));

    await waitFor(() => {
      expect(result.current.autoHoursSettingsByPhase.sd?.length).toBe(1);
    });
    expect(result.current.autoHoursTemplates[0]?.id).toBe(9);
    expect(result.current.autoHoursTemplateSettings[9]?.sd?.length).toBe(1);
  });

  it('loads legacy defaults and captures phase failures', async () => {
    const listDefaultSettings = vi.fn(async (phase: string) => {
      if (phase === 'dd') throw new Error('boom');
      return { settings: [{ roleId: 1, percent: 40 } as any] };
    });

    const listTemplates = vi.fn(async () => []);
    const listTemplateSettings = vi.fn(async () => []);
    const fetchPhaseMapping = vi.fn(async () => null);

    const { result } = renderHook(() => useAutoHoursSettings({
      enabled: true,
      shouldUseLegacyFallback: true,
      defaultPhaseKeys: ['sd', 'dd'],
      listDefaultSettings,
      listTemplates,
      listTemplateSettings,
      fetchPhaseMapping,
    }));

    await waitFor(() => {
      expect(listDefaultSettings).toHaveBeenCalled();
      expect(result.current.autoHoursSettingsLoading).toBe(false);
    });

    expect(result.current.autoHoursSettingsByPhase.sd?.length).toBe(1);
    expect(result.current.autoHoursSettingsError).toContain('dd');
  });

  it('caches template settings with ensureTemplateSettings', async () => {
    const listTemplateSettings = vi.fn(async () => [{ roleId: 2, percent: 30 } as any]);
    const autoHoursBundle = {
      templates: [{ id: 7, name: 'Template', isActive: true, phaseKeys: ['sd'] } as any],
    };
    const listDefaultSettings = vi.fn(async () => ({ settings: [] }));
    const listTemplates = vi.fn(async () => []);
    const fetchPhaseMapping = vi.fn(async () => null);

    const { result } = renderHook(() => useAutoHoursSettings({
      enabled: true,
      shouldUseLegacyFallback: false,
      defaultPhaseKeys: ['sd'],
      autoHoursBundle,
      listDefaultSettings,
      listTemplates,
      listTemplateSettings,
      fetchPhaseMapping,
    }));

    await act(async () => {
      await result.current.ensureTemplateSettings([7]);
    });

    await waitFor(() => {
      expect(result.current.autoHoursTemplateSettings[7]?.sd?.length).toBe(1);
    });

    await act(async () => {
      await result.current.ensureTemplateSettings([7]);
    });

    expect(listTemplateSettings).toHaveBeenCalledTimes(1);
  });
});
