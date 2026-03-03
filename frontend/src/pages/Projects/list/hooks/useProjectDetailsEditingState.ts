import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AutoHoursTemplate, Project } from '@/types/models';
import { autoHoursTemplatesApi, projectsApi } from '@/services/api';
import { useInlineProjectUpdate } from '@/hooks/useInlineProjectUpdate';
import { confirmAction } from '@/lib/confirmAction';
import { showToast } from '@/lib/toastBus';

interface Params {
  project: Project;
  verticals: Array<{ id?: number }>;
  onProjectRefetch?: () => Promise<void> | void;
  reloadAssignments: (projectId: number) => Promise<void>;
  invalidateFilterMeta: () => Promise<void>;
}

/**
 * Owns editable project field state and auto-hours template reseed orchestration.
 */
export function useProjectDetailsEditingState({
  project,
  verticals,
  onProjectRefetch,
  reloadAssignments,
  invalidateFilterMeta,
}: Params) {
  const { commit } = useInlineProjectUpdate(project.id!);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [localPatch, setLocalPatch] = useState<Partial<Project>>({});
  const [autoHoursTemplates, setAutoHoursTemplates] = useState<AutoHoursTemplate[]>([]);
  const [autoHoursTemplatesLoading, setAutoHoursTemplatesLoading] = useState(false);
  const [autoHoursTemplatesError, setAutoHoursTemplatesError] = useState<string | null>(null);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  useEffect(() => {
    setLocalPatch({});
  }, [project.id]);

  const currentVerticalId = (localPatch as any).vertical !== undefined
    ? (localPatch as any).vertical
    : (project.vertical ?? null);
  const isVerticalMissing = currentVerticalId != null && !verticals.some((v) => v.id === currentVerticalId);

  const refetchProject = useCallback(async () => {
    try {
      await onProjectRefetch?.();
    } catch {}
  }, [onProjectRefetch]);

  const commitField = useCallback(async (
    field: keyof Project,
    value: any,
    opts?: { onError?: (err: unknown) => void }
  ) => {
    const prevValue = (localPatch as any)[field] !== undefined
      ? (localPatch as any)[field]
      : (project as any)[field];
    setLocalPatch((prev) => ({ ...prev, [field]: value }));

    try {
      await commit(field, value);
      clearFieldError(String(field));
      setLocalPatch((prev) => {
        const next = { ...prev } as Partial<Project>;
        delete (next as any)[field];
        return next;
      });
    } catch (err) {
      setLocalPatch((prev) => {
        const next = { ...prev } as Partial<Project>;
        if (prevValue === undefined || prevValue === null) {
          delete (next as any)[field];
        } else {
          (next as any)[field] = prevValue;
        }
        return next;
      });
      try {
        opts?.onError?.(err);
      } catch {}
      await refetchProject();
      throw err;
    }
  }, [clearFieldError, commit, localPatch, project, refetchProject]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setAutoHoursTemplatesLoading(true);
        setAutoHoursTemplatesError(null);
        const list = await autoHoursTemplatesApi.list();
        if (!mounted) return;
        setAutoHoursTemplates(list || []);
      } catch {
        if (!mounted) return;
        setAutoHoursTemplatesError('Failed to load templates');
      } finally {
        if (mounted) setAutoHoursTemplatesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedAutoHoursTemplateId =
    (localPatch.autoHoursTemplateId !== undefined ? localPatch.autoHoursTemplateId : project.autoHoursTemplateId) ?? null;
  const selectedAutoHoursTemplateName =
    autoHoursTemplates.find((t) => t.id === selectedAutoHoursTemplateId)?.name
    ?? (selectedAutoHoursTemplateId ? `Template #${selectedAutoHoursTemplateId}` : 'Global default');
  const isAutoHoursTemplateMissing =
    !!selectedAutoHoursTemplateId && !autoHoursTemplates.some((t) => t.id === selectedAutoHoursTemplateId);

  const promptAndUpdateHours = useCallback(async (
    reason: 'start_date_changed' | 'template_changed',
    nextStartDate: string | null,
    nextTemplateId: number | null
  ) => {
    if (!project.id) return;
    if (!nextStartDate) {
      showToast('Set a project start date before updating hours from template changes.', 'info');
      return;
    }

    const templateName = nextTemplateId != null
      ? (autoHoursTemplates.find((t) => t.id === nextTemplateId)?.name || `Template #${nextTemplateId}`)
      : 'Global default';

    const ok = await confirmAction({
      title: 'Update Hours and Roles?',
      message: `Do you want to update hours based on the new start date (${nextStartDate}) and template (${templateName})?`,
      confirmLabel: 'Update Hours and Roles',
      tone: 'warning',
    });
    if (!ok) return;

    try {
      const summary = await projectsApi.reseedAutoHours(project.id, { reason });
      await reloadAssignments(project.id);
      await invalidateFilterMeta();
      await refetchProject();
      const updated = Number(summary?.updatedAssignments || 0);
      const created = Number((summary as any)?.createdAssignments || 0);
      if (created > 0) {
        showToast(
          `Added ${created} missing role assignment${created === 1 ? '' : 's'} and updated ${updated} assignment${updated === 1 ? '' : 's'}.`,
          'success'
        );
      } else {
        showToast(`Updated hours for ${updated} assignment${updated === 1 ? '' : 's'}.`, 'success');
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to update assignment hours.', 'error');
    }
  }, [autoHoursTemplates, invalidateFilterMeta, project.id, refetchProject, reloadAssignments]);

  return useMemo(() => ({
    fieldErrors,
    setFieldErrors,
    clearFieldError,
    localPatch,
    currentVerticalId,
    isVerticalMissing,
    commitField,
    autoHoursTemplates,
    autoHoursTemplatesLoading,
    autoHoursTemplatesError,
    selectedAutoHoursTemplateId,
    selectedAutoHoursTemplateName,
    isAutoHoursTemplateMissing,
    promptAndUpdateHours,
  }), [
    autoHoursTemplates,
    autoHoursTemplatesError,
    autoHoursTemplatesLoading,
    clearFieldError,
    commitField,
    currentVerticalId,
    fieldErrors,
    isAutoHoursTemplateMissing,
    isVerticalMissing,
    localPatch,
    promptAndUpdateHours,
    selectedAutoHoursTemplateId,
    selectedAutoHoursTemplateName,
  ]);
}
