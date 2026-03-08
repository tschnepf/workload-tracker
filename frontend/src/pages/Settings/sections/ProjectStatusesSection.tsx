import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import Button from '@/components/ui/Button';
import { useSettingsData } from '../SettingsDataContext';
import { isAdminOrManager } from '@/utils/roleAccess';
import { showToast } from '@/lib/toastBus';
import { confirmAction } from '@/lib/confirmAction';
import type { ProjectStatusDefinition } from '@/types/models';
import { projectStatusDefinitionsApi } from '@/services/projectStatusDefinitionsApi';
import { useProjectStatusDefinitions, PROJECT_STATUS_DEFINITIONS_QUERY_KEY } from '@/hooks/useProjectStatusDefinitions';
import { FALLBACK_PROJECT_STATUS_DEFINITIONS } from '@/components/projects/status.catalog';

export const PROJECT_STATUSES_SECTION_ID = 'project-statuses';

type EditState = {
  label: string;
  colorHex: string;
  includeInAnalytics: boolean;
  treatAsCaWhenNoDeliverable: boolean;
  isActive: boolean;
  sortOrder: number;
};

const PRESET_COLORS = Array.from(new Set(FALLBACK_PROJECT_STATUS_DEFINITIONS.map((item) => item.colorHex)));

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value || '');
}

function normalizeHex(value: string): string {
  return (value || '').trim().toLowerCase();
}

function getPickerHex(value: string, fallback = 'var(--chart-neutral)'): string {
  return isHexColor(value) ? normalizeHex(value) : fallback;
}

function toEditState(item: ProjectStatusDefinition): EditState {
  return {
    label: item.label,
    colorHex: item.colorHex,
    includeInAnalytics: !!item.includeInAnalytics,
    treatAsCaWhenNoDeliverable: !!item.treatAsCaWhenNoDeliverable,
    isActive: item.isActive,
    sortOrder: Number(item.sortOrder || 0),
  };
}

const ProjectStatusesSection: React.FC = () => {
  const { auth } = useSettingsData();
  const queryClient = useQueryClient();
  const canManage = isAdminOrManager(auth.user);
  const { definitions, isLoading, isError, error } = useProjectStatusDefinitions({ enabled: canManage });
  const [newKey, setNewKey] = useState('');
  const [newState, setNewState] = useState<EditState>({
    label: '',
    colorHex: 'var(--chart-neutral)',
    includeInAnalytics: false,
    treatAsCaWhenNoDeliverable: false,
    isActive: true,
    sortOrder: 100,
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<EditState | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: PROJECT_STATUS_DEFINITIONS_QUERY_KEY });
  };

  const createMutation = useMutation({
    mutationFn: projectStatusDefinitionsApi.create,
    onSuccess: async () => {
      showToast('Project status created', 'success');
      setNewKey('');
      setNewState({
        label: '',
        colorHex: 'var(--chart-neutral)',
        includeInAnalytics: false,
        treatAsCaWhenNoDeliverable: false,
        isActive: true,
        sortOrder: 100,
      });
      await invalidate();
    },
    onError: (err: Error) => {
      showToast(err.message || 'Failed to create status', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: Partial<EditState> }) =>
      projectStatusDefinitionsApi.update(key, payload),
    onSuccess: async () => {
      showToast('Project status updated', 'success');
      setEditingKey(null);
      setEditingState(null);
      await invalidate();
    },
    onError: (err: Error) => {
      showToast(err.message || 'Failed to update status', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => projectStatusDefinitionsApi.remove(key),
    onSuccess: async () => {
      showToast('Project status deleted', 'success');
      await invalidate();
    },
    onError: (err: Error) => {
      showToast(err.message || 'Failed to delete status', 'error');
    },
  });

  const rows = useMemo(() => definitions, [definitions]);

  const startEdit = (item: ProjectStatusDefinition) => {
    setEditingKey(item.key);
    setEditingState(toEditState(item));
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingState(null);
  };

  const onCreate = () => {
    const key = (newKey || '').trim().toLowerCase();
    const label = (newState.label || '').trim();
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) {
      showToast('Key must use lowercase letters, numbers, and underscores.', 'error');
      return;
    }
    if (!label) {
      showToast('Label is required.', 'error');
      return;
    }
    if (!isHexColor(newState.colorHex)) {
      showToast('Color must be a valid #RRGGBB value.', 'error');
      return;
    }
    if (newState.treatAsCaWhenNoDeliverable && !newState.includeInAnalytics) {
      showToast('CA override requires Include in analytics to be enabled.', 'error');
      return;
    }
    createMutation.mutate({
      key,
      label,
      colorHex: newState.colorHex.toLowerCase(),
      includeInAnalytics: newState.includeInAnalytics,
      treatAsCaWhenNoDeliverable: newState.treatAsCaWhenNoDeliverable,
      isActive: newState.isActive,
      sortOrder: Number(newState.sortOrder || 0),
    });
  };

  const onSaveEdit = (key: string) => {
    if (!editingState) return;
    const label = (editingState.label || '').trim();
    if (!label) {
      showToast('Label is required.', 'error');
      return;
    }
    if (!isHexColor(editingState.colorHex)) {
      showToast('Color must be a valid #RRGGBB value.', 'error');
      return;
    }
    if (editingState.treatAsCaWhenNoDeliverable && !editingState.includeInAnalytics) {
      showToast('CA override requires Include in analytics to be enabled.', 'error');
      return;
    }
    updateMutation.mutate({
      key,
      payload: {
        label,
        colorHex: editingState.colorHex.toLowerCase(),
        includeInAnalytics: editingState.includeInAnalytics,
        treatAsCaWhenNoDeliverable: editingState.treatAsCaWhenNoDeliverable,
        isActive: editingState.isActive,
        sortOrder: Number(editingState.sortOrder || 0),
      },
    });
  };

  const onDelete = async (item: ProjectStatusDefinition) => {
    const ok = await confirmAction({
      title: 'Delete project status?',
      message: `Delete "${item.label}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    deleteMutation.mutate(item.key);
  };

  if (!canManage) return null;

  return (
    <SettingsSectionFrame
      id={PROJECT_STATUSES_SECTION_ID}
      title="Status and Colors"
      description="Define project statuses used across forms, filters, and analytics. Keys are immutable after creation."
      className="mt-6"
    >
      {isError && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error?.message || 'Failed to load statuses'}
        </div>
      )}

      <div className="mb-5 rounded border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="mb-2 text-sm font-semibold text-[var(--text)]">Add Status</div>
        <div className="grid gap-2 md:grid-cols-7">
          <input
            className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm text-[var(--text)]"
            placeholder="key (e.g. future)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <input
            className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm text-[var(--text)]"
            placeholder="Label"
            value={newState.label}
            onChange={(e) => setNewState((prev) => ({ ...prev, label: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-9 w-12 cursor-pointer rounded border border-[var(--border)] bg-[var(--card)] p-1"
              value={getPickerHex(newState.colorHex)}
              onChange={(e) => setNewState((prev) => ({ ...prev, colorHex: normalizeHex(e.target.value) }))}
              aria-label="Select status color"
            />
            <input
              className="flex-1 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm text-[var(--text)]"
              value={newState.colorHex}
              onChange={(e) => setNewState((prev) => ({ ...prev, colorHex: normalizeHex(e.target.value) }))}
              placeholder="var(--chart-neutral)"
            />
          </div>
          <input
            type="number"
            className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm text-[var(--text)]"
            value={newState.sortOrder}
            onChange={(e) => setNewState((prev) => ({ ...prev, sortOrder: Number(e.target.value || 0) }))}
          />
          <label className="flex items-center gap-1 text-xs text-[var(--text)]">
            <input
              type="checkbox"
              checked={newState.includeInAnalytics}
              onChange={(e) => setNewState((prev) => ({
                ...prev,
                includeInAnalytics: e.target.checked,
                treatAsCaWhenNoDeliverable: e.target.checked ? prev.treatAsCaWhenNoDeliverable : false,
              }))}
            />
            Include in analytics
          </label>
          <label className="flex items-center gap-1 text-xs text-[var(--text)]">
            <input
              type="checkbox"
              checked={newState.treatAsCaWhenNoDeliverable}
              disabled={!newState.includeInAnalytics}
              onChange={(e) => setNewState((prev) => ({ ...prev, treatAsCaWhenNoDeliverable: e.target.checked }))}
            />
            Treat as CA
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-[var(--text)]">
              <input
                type="checkbox"
                checked={newState.isActive}
                onChange={(e) => setNewState((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
            <Button type="button" onClick={onCreate} disabled={createMutation.isPending}>Add</Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESET_COLORS.map((hex) => (
            <button
              key={hex}
              type="button"
              className="h-5 w-5 rounded border border-[var(--border)]"
              style={{ backgroundColor: hex }}
              onClick={() => setNewState((prev) => ({ ...prev, colorHex: hex }))}
              aria-label={`Set color ${hex}`}
              title={hex}
            />
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Key</th>
              <th className="px-2 py-2">Include Analytics</th>
              <th className="px-2 py-2">Treat as CA</th>
              <th className="px-2 py-2">Active</th>
              <th className="px-2 py-2">Sort</th>
              <th className="px-2 py-2">In Use</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="px-2 py-3 text-[var(--muted)]" colSpan={8}>Loading statuses...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-2 py-3 text-[var(--muted)]" colSpan={8}>No statuses found.</td></tr>
            ) : (
              rows.map((item) => {
                const isEditing = editingKey === item.key && !!editingState;
                return (
                  <tr key={item.key} className="border-b border-[var(--border)]">
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm text-[var(--text)]"
                            value={editingState?.label || ''}
                            onChange={(e) => setEditingState((prev) => prev ? { ...prev, label: e.target.value } : prev)}
                          />
                          <span className="inline-block h-4 w-4 rounded border border-[var(--border)]" style={{ backgroundColor: editingState?.colorHex || 'var(--chart-neutral)' }} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-4 w-4 rounded border border-[var(--border)]" style={{ backgroundColor: item.colorHex }} />
                          <span style={{ color: item.colorHex }}>{item.label}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[var(--muted)]">{item.key}</td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={!!editingState?.includeInAnalytics}
                          onChange={(e) => setEditingState((prev) => prev ? {
                            ...prev,
                            includeInAnalytics: e.target.checked,
                            treatAsCaWhenNoDeliverable: e.target.checked ? prev.treatAsCaWhenNoDeliverable : false,
                          } : prev)}
                        />
                      ) : (
                        item.includeInAnalytics ? 'Yes' : 'No'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={!!editingState?.treatAsCaWhenNoDeliverable}
                          disabled={!editingState?.includeInAnalytics}
                          onChange={(e) => setEditingState((prev) => prev ? { ...prev, treatAsCaWhenNoDeliverable: e.target.checked } : prev)}
                        />
                      ) : (
                        item.treatAsCaWhenNoDeliverable ? 'Yes' : 'No'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={!!editingState?.isActive}
                          onChange={(e) => setEditingState((prev) => prev ? { ...prev, isActive: e.target.checked } : prev)}
                        />
                      ) : (
                        item.isActive ? 'Yes' : 'No'
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="number"
                          className="w-20 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm text-[var(--text)]"
                          value={editingState?.sortOrder ?? 0}
                          onChange={(e) => setEditingState((prev) => prev ? { ...prev, sortOrder: Number(e.target.value || 0) } : prev)}
                        />
                      ) : (
                        item.sortOrder
                      )}
                    </td>
                    <td className="px-2 py-2">{item.inUseCount || 0}</td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <input
                            type="color"
                            className="h-7 w-10 cursor-pointer rounded border border-[var(--border)] bg-[var(--card)] p-1"
                            value={getPickerHex(editingState?.colorHex || 'var(--chart-neutral)')}
                            onChange={(e) => setEditingState((prev) => prev ? { ...prev, colorHex: normalizeHex(e.target.value) } : prev)}
                            aria-label={`Select color for ${item.label}`}
                          />
                          <input
                            className="w-28 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--text)]"
                            value={editingState?.colorHex || 'var(--chart-neutral)'}
                            onChange={(e) => setEditingState((prev) => prev ? { ...prev, colorHex: normalizeHex(e.target.value) } : prev)}
                            placeholder="var(--chart-neutral)"
                          />
                          <Button type="button" onClick={() => onSaveEdit(item.key)} disabled={updateMutation.isPending}>Save</Button>
                          <button
                            type="button"
                            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                            onClick={() => startEdit(item)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => onDelete(item)}
                            disabled={!item.canDelete || deleteMutation.isPending}
                            title={
                              item.canDelete
                                ? 'Delete status'
                                : (item.isSystem ? 'System statuses cannot be deleted.' : `In use by ${item.inUseCount || 0} project(s).`)
                            }
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SettingsSectionFrame>
  );
};

export default ProjectStatusesSection;
