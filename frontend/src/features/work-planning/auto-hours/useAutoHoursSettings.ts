import * as React from 'react';
import type { AutoHoursTemplate, DeliverablePhaseMappingSettings } from '@/types/models';
import type { AutoHoursRoleSetting } from '@/services/api';

type ToastType = 'info' | 'success' | 'warning' | 'error';

type AutoHoursBundle = {
  defaultSettingsByPhase?: Record<string, AutoHoursRoleSetting[]>;
  templates?: AutoHoursTemplate[];
  phaseMapping?: DeliverablePhaseMappingSettings | null;
  templateSettingsByPhase?: Record<string, Record<string, AutoHoursRoleSetting[]>>;
  bundleComplete?: boolean;
  missingTemplateIds?: number[];
} | null | undefined;

export type UseAutoHoursSettingsOptions = {
  enabled: boolean;
  shouldUseLegacyFallback: boolean;
  defaultPhaseKeys?: string[];
  defaultPhaseMapping?: DeliverablePhaseMappingSettings;
  autoHoursBundle?: AutoHoursBundle;
  listDefaultSettings: (phase: string) => Promise<{ settings?: AutoHoursRoleSetting[] } | AutoHoursRoleSetting[]>;
  listTemplates: () => Promise<AutoHoursTemplate[]>;
  listTemplateSettings: (templateId: number, phase: string) => Promise<AutoHoursRoleSetting[]>;
  fetchPhaseMapping: () => Promise<DeliverablePhaseMappingSettings | null>;
  showToast?: (message: string, type?: ToastType) => void;
};

export type UseAutoHoursSettingsReturn = {
  autoHoursPhases: string[];
  phaseMappingEffective: DeliverablePhaseMappingSettings;
  autoHoursSettingsByPhase: Record<string, AutoHoursRoleSetting[]>;
  autoHoursSettingsLoading: boolean;
  autoHoursSettingsError: string | null;
  autoHoursTemplateSettings: Record<number, Record<string, AutoHoursRoleSetting[]>>;
  autoHoursTemplateSettingsLoading: Set<number>;
  autoHoursTemplates: AutoHoursTemplate[];
  phaseMapping: DeliverablePhaseMappingSettings | null;
  phaseMappingError: string | null;
  autoHoursTemplatePhaseKeysById: Map<number, Set<string>>;
  ensureTemplateSettings: (templateIds: number[]) => Promise<void>;
};

const toSettings = (value: { settings?: AutoHoursRoleSetting[] } | AutoHoursRoleSetting[]) => {
  if (Array.isArray(value)) return value;
  return value?.settings || [];
};

export function useAutoHoursSettings(options: UseAutoHoursSettingsOptions): UseAutoHoursSettingsReturn {
  const {
    enabled,
    shouldUseLegacyFallback,
    defaultPhaseKeys,
    defaultPhaseMapping,
    autoHoursBundle,
    listDefaultSettings,
    listTemplates,
    listTemplateSettings,
    fetchPhaseMapping,
    showToast,
  } = options;

  const [autoHoursSettingsByPhase, setAutoHoursSettingsByPhase] = React.useState<Record<string, AutoHoursRoleSetting[]>>({});
  const [autoHoursSettingsLoading, setAutoHoursSettingsLoading] = React.useState(false);
  const [autoHoursSettingsError, setAutoHoursSettingsError] = React.useState<string | null>(null);
  const [autoHoursTemplateSettings, setAutoHoursTemplateSettings] = React.useState<Record<number, Record<string, AutoHoursRoleSetting[]>>>({});
  const [autoHoursTemplateSettingsLoading, setAutoHoursTemplateSettingsLoading] = React.useState<Set<number>>(new Set());
  const [autoHoursTemplates, setAutoHoursTemplates] = React.useState<AutoHoursTemplate[]>([]);
  const [phaseMapping, setPhaseMapping] = React.useState<DeliverablePhaseMappingSettings | null>(null);
  const [phaseMappingError, setPhaseMappingError] = React.useState<string | null>(null);
  const listDefaultSettingsRef = React.useRef(listDefaultSettings);
  const listTemplatesRef = React.useRef(listTemplates);
  const listTemplateSettingsRef = React.useRef(listTemplateSettings);
  const fetchPhaseMappingRef = React.useRef(fetchPhaseMapping);
  const showToastRef = React.useRef(showToast);

  React.useEffect(() => { listDefaultSettingsRef.current = listDefaultSettings; }, [listDefaultSettings]);
  React.useEffect(() => { listTemplatesRef.current = listTemplates; }, [listTemplates]);
  React.useEffect(() => { listTemplateSettingsRef.current = listTemplateSettings; }, [listTemplateSettings]);
  React.useEffect(() => { fetchPhaseMappingRef.current = fetchPhaseMapping; }, [fetchPhaseMapping]);
  React.useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  const fallbackPhaseKeysRef = React.useRef<string[]>(
    defaultPhaseKeys && defaultPhaseKeys.length ? [...defaultPhaseKeys] : ['sd', 'dd', 'ifp', 'ifc']
  );
  const fallbackPhaseMappingRef = React.useRef<DeliverablePhaseMappingSettings>(
    defaultPhaseMapping || {
      useDescriptionMatch: true,
      phases: fallbackPhaseKeysRef.current.map((key, index) => ({
        key,
        label: String(key).toUpperCase(),
        descriptionTokens: [key],
        rangeMin: 0,
        rangeMax: 100,
        sortOrder: index,
      })),
    }
  );
  const fallbackPhaseKeys = fallbackPhaseKeysRef.current;
  const fallbackPhaseMapping = fallbackPhaseMappingRef.current;
  const phaseMappingEffective = React.useMemo(() => phaseMapping || fallbackPhaseMapping, [fallbackPhaseMapping, phaseMapping]);
  const autoHoursPhases = React.useMemo(() => {
    const keys = (phaseMappingEffective.phases || []).map((phase) => phase.key).filter(Boolean);
    return keys.length > 0 ? keys : Array.from(fallbackPhaseKeys);
  }, [fallbackPhaseKeys, phaseMappingEffective]);

  React.useEffect(() => {
    if (enabled) return;
    setAutoHoursSettingsByPhase({});
    setAutoHoursSettingsLoading(false);
    setAutoHoursSettingsError(null);
    setAutoHoursTemplateSettings({});
    setAutoHoursTemplateSettingsLoading(new Set());
    setAutoHoursTemplates([]);
    setPhaseMapping(null);
    setPhaseMappingError(null);
  }, [enabled]);

  const autoHoursTemplatePhaseKeysById = React.useMemo(() => {
    const map = new Map<number, Set<string>>();
    (autoHoursTemplates || []).forEach((template) => {
      const milestoneKeys = (template.milestones || [])
        .map((milestone) => String(milestone?.key || '').trim().toLowerCase())
        .filter((key, idx, arr) => key && arr.indexOf(key) === idx);
      const keys = milestoneKeys.length > 0
        ? milestoneKeys
        : (template.phaseKeys && template.phaseKeys.length ? template.phaseKeys : autoHoursPhases);
      map.set(template.id, new Set(keys));
    });
    return map;
  }, [autoHoursPhases, autoHoursTemplates]);

  React.useEffect(() => {
    if (!enabled) return;
    if (!shouldUseLegacyFallback) {
      setAutoHoursSettingsLoading(false);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        setAutoHoursSettingsLoading(true);
        setAutoHoursSettingsError(null);
        const results = await Promise.allSettled(
          autoHoursPhases.map((phase) => listDefaultSettingsRef.current(phase))
        );
        if (!mounted) return;
        const next: Record<string, AutoHoursRoleSetting[]> = {};
        const failures: string[] = [];
        results.forEach((result, idx) => {
          const phase = autoHoursPhases[idx];
          if (result.status === 'fulfilled') {
            next[phase] = toSettings(result.value);
          } else {
            failures.push(phase);
          }
        });
        setAutoHoursSettingsByPhase(next);
        if (failures.length > 0) {
          setAutoHoursSettingsError(`Failed to load auto hours for: ${failures.join(', ')}`);
        }
      } catch (e: any) {
        if (!mounted) return;
        setAutoHoursSettingsError(e?.message || 'Failed to load auto hours settings');
      } finally {
        if (mounted) {
          setAutoHoursSettingsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [autoHoursPhases, enabled, shouldUseLegacyFallback]);

  React.useEffect(() => {
    if (!enabled) {
      setAutoHoursTemplates([]);
      return;
    }
    if (!shouldUseLegacyFallback) return;

    let mounted = true;
    (async () => {
      try {
        const templates = await listTemplatesRef.current();
        if (mounted) {
          setAutoHoursTemplates(templates || []);
        }
      } catch {
        if (mounted) {
          setAutoHoursTemplates([]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [enabled, shouldUseLegacyFallback]);

  React.useEffect(() => {
    if (!enabled) return;
    if (!shouldUseLegacyFallback) return;

    let mounted = true;
    (async () => {
      try {
        const mapping = await fetchPhaseMappingRef.current();
        if (!mounted) return;
        setPhaseMapping(mapping || null);
        setPhaseMappingError(null);
      } catch (e: any) {
        if (!mounted) return;
        setPhaseMapping(null);
        setPhaseMappingError(e?.message || 'Failed to load deliverable phase mapping');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [enabled, shouldUseLegacyFallback]);

  React.useEffect(() => {
    if (!enabled || !autoHoursBundle) return;

    setAutoHoursSettingsByPhase(autoHoursBundle.defaultSettingsByPhase || {});
    setAutoHoursSettingsLoading(false);
    setAutoHoursSettingsError(null);
    setAutoHoursTemplates((autoHoursBundle.templates || []) as AutoHoursTemplate[]);
    setPhaseMapping((autoHoursBundle.phaseMapping as DeliverablePhaseMappingSettings) || null);
    setPhaseMappingError(null);

    const templateSettingsRaw = autoHoursBundle.templateSettingsByPhase || {};
    const templateSettings: Record<number, Record<string, AutoHoursRoleSetting[]>> = {};
    Object.entries(templateSettingsRaw).forEach(([templateIdRaw, phases]) => {
      const templateId = Number(templateIdRaw);
      if (!Number.isFinite(templateId)) return;
      templateSettings[templateId] = phases || {};
    });
    if (Object.keys(templateSettings).length > 0) {
      setAutoHoursTemplateSettings((prev) => ({ ...prev, ...templateSettings }));
    }

    if (!autoHoursBundle.bundleComplete && (autoHoursBundle.missingTemplateIds || []).length > 0) {
      setAutoHoursSettingsError(
        `Auto hours bundle missing template settings for: ${autoHoursBundle.missingTemplateIds.join(', ')}`
      );
    }
  }, [autoHoursBundle, enabled]);

  const ensureTemplateSettings = React.useCallback(async (templateIds: number[]) => {
    const ids = Array.from(new Set(templateIds.filter((id) => Number.isFinite(id) && id > 0)));
    if (ids.length === 0) return;
    const missing = ids.filter((id) => !autoHoursTemplateSettings[id]);
    if (missing.length === 0) return;

    setAutoHoursTemplateSettingsLoading((prev) => {
      const next = new Set(prev);
      missing.forEach((id) => next.add(id));
      return next;
    });

    try {
      await Promise.all(
        missing.map(async (templateId) => {
          const phasesToFetch = Array.from(autoHoursTemplatePhaseKeysById.get(templateId) ?? autoHoursPhases);
          const results = await Promise.allSettled(
            phasesToFetch.map((phase) => listTemplateSettingsRef.current(templateId, phase))
          );
          const phaseMap: Record<string, AutoHoursRoleSetting[]> = {};
          results.forEach((result, idx) => {
            const phase = phasesToFetch[idx];
            if (result.status === 'fulfilled') {
              phaseMap[phase] = result.value || [];
            }
          });
          setAutoHoursTemplateSettings((prev) => ({ ...prev, [templateId]: phaseMap }));
        })
      );
    } catch (e: any) {
      if (showToastRef.current) {
        showToastRef.current(e?.message || 'Failed to load auto hours templates', 'error');
      }
    } finally {
      setAutoHoursTemplateSettingsLoading((prev) => {
        const next = new Set(prev);
        missing.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [autoHoursPhases, autoHoursTemplatePhaseKeysById, autoHoursTemplateSettings]);

  return {
    autoHoursPhases,
    phaseMappingEffective,
    autoHoursSettingsByPhase,
    autoHoursSettingsLoading,
    autoHoursSettingsError,
    autoHoursTemplateSettings,
    autoHoursTemplateSettingsLoading,
    autoHoursTemplates,
    phaseMapping,
    phaseMappingError,
    autoHoursTemplatePhaseKeysById,
    ensureTemplateSettings,
  };
}
