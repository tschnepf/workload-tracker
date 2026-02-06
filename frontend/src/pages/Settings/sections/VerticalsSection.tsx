import React, { useCallback, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { verticalsApi } from '@/services/api';
import type { Vertical } from '@/types/models';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { useSettingsData } from '../SettingsDataContext';
import { showToast } from '@/lib/toastBus';

export const VERTICALS_SECTION_ID = 'verticals';

type VerticalFormState = {
  name: string;
  shortName: string;
  description: string;
  isActive: boolean;
};

const blankForm: VerticalFormState = {
  name: '',
  shortName: '',
  description: '',
  isActive: true,
};

const VerticalsSection: React.FC = () => {
  const { auth } = useSettingsData();
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingVertical, setEditingVertical] = useState<Vertical | null>(null);
  const [formState, setFormState] = useState<VerticalFormState>(blankForm);

  const loadVerticals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const page = await verticalsApi.list({ page: 1, page_size: 500, include_inactive: 1 });
      setVerticals(page.results || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load verticals');
    } finally {
      setLoading(false);
    }
  }, []);

  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    loadVerticals();
  }, [auth.accessToken, loadVerticals]);

  const sortedVerticals = useMemo(() => {
    return [...(verticals || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [verticals]);

  const openCreate = () => {
    setEditingVertical(null);
    setFormState(blankForm);
    setFormOpen(true);
  };

  const openEdit = (vertical: Vertical) => {
    setEditingVertical(vertical);
    setFormState({
      name: vertical.name || '',
      shortName: vertical.shortName || '',
      description: vertical.description || '',
      isActive: vertical.isActive !== false,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingVertical(null);
    setFormState(blankForm);
  };

  const handleSave = async () => {
    if (!formState.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formState.name.trim(),
        shortName: formState.shortName.trim(),
        description: formState.description.trim(),
        isActive: formState.isActive,
      };
      if (editingVertical?.id) {
        await verticalsApi.update(editingVertical.id, payload);
        showToast('Vertical updated', 'success');
      } else {
        await verticalsApi.create(payload as any);
        showToast('Vertical created', 'success');
      }
      closeForm();
      await loadVerticals();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save vertical', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (vertical: Vertical) => {
    if (!vertical?.id) return;
    try {
      await verticalsApi.update(vertical.id, { isActive: !vertical.isActive });
      await loadVerticals();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update vertical', 'error');
    }
  };

  return (
    <SettingsSectionFrame
      id={VERTICALS_SECTION_ID}
      title="Verticals"
      description="Manage the vertical categories used to organize departments and projects."
      actions={(
        <Button type="button" onClick={openCreate}>
          Add Vertical
        </Button>
      )}
    >
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {formOpen && (
        <div className="border border-[var(--border)] rounded-lg p-4 mb-4 bg-[var(--surface)]">
          <div className="grid grid-cols-1 gap-3">
            <Input
              label="Name"
              value={formState.name}
              onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Healthcare"
            />
            <Input
              label="Short Name"
              value={formState.shortName}
              onChange={(e) => setFormState(prev => ({ ...prev, shortName: e.target.value }))}
              placeholder="e.g. HC"
            />
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">Description</label>
              <textarea
                value={formState.description}
                onChange={(e) => setFormState(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-md border text-sm transition-colors bg-[var(--surface)] border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--focus)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-none resize-none"
                rows={3}
                placeholder="Optional description"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={formState.isActive}
                onChange={(e) => setFormState(prev => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-[var(--muted)]">Loading verticals…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                <th className="py-2">Name</th>
                <th className="py-2">Short</th>
                <th className="py-2">Description</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedVerticals.map((v) => (
                <tr key={v.id} className="border-b border-[var(--border)]">
                  <td className="py-2 text-[var(--text)]">{v.name}</td>
                  <td className="py-2 text-[var(--muted)]">{v.shortName || '-'}</td>
                  <td className="py-2 text-[var(--muted)]">{v.description || '-'}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-1 rounded ${v.isActive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}`}>
                      {v.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 text-right space-x-2">
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                      onClick={() => openEdit(v)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                      onClick={() => toggleActive(v)}
                    >
                      {v.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {sortedVerticals.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[var(--muted)]">
                    No verticals found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </SettingsSectionFrame>
  );
};

export default VerticalsSection;
