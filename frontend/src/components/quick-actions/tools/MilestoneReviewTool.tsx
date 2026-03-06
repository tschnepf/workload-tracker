import React, { useEffect, useMemo, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { deliverablesApi, deliverableAssignmentsApi, peopleApi } from '../../../services/api';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import InlineAlert from '@/components/ui/InlineAlert';
import PanelHeader from '@/components/ui/PanelHeader';

interface Props { onClose: () => void }

const MilestoneReviewTool: React.FC<Props> = () => {
  const { state: verticalState } = useVerticalFilter();
  const [items, setItems] = useState<any[]>([]);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<number | null>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useAuthenticatedEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
        const data = await deliverablesApi.calendar(start, end, verticalState.selectedVerticalId ?? undefined);
        setItems(data || []);
        if (data.length > 0) setSelectedDeliverableId((prev) => prev ?? data[0].id);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [verticalState.selectedVerticalId]);

  useEffect(() => {
    const loadAssignments = async () => {
      if (!selectedDeliverableId) return;
      try {
        const summary = await deliverablesApi.staffingSummary(selectedDeliverableId);
        setStaff(summary || []);
      } catch (e) {
        console.error('Failed to load staffing summary', e);
      }
    };
    loadAssignments();
  }, [selectedDeliverableId]);

  useEffect(() => {
    const load = async () => {
      try {
        const first = await peopleApi.autocomplete('', 50, verticalState.selectedVerticalId ?? undefined);
        setPeople(first || []);
      } catch (e) {
        console.error('Failed to load people', e);
      }
    };
    load();
  }, [verticalState.selectedVerticalId]);

  const refreshSummary = async () => {
    if (!selectedDeliverableId) return;
    const summary = await deliverablesApi.staffingSummary(selectedDeliverableId);
    setStaff(summary || []);
  };

  const shownIds = useMemo(() => new Set((staff || []).map((s: any) => s.personId)), [staff]);

  const handleAddPerson = async (personId: number) => {
    if (!selectedDeliverableId || !personId) return;
    setSaving(true);
    try {
      await deliverableAssignmentsApi.create({ deliverable: selectedDeliverableId, person: personId, roleOnMilestone: '' } as any);
      await refreshSummary();
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLink = async (linkId: number) => {
    if (!linkId) return;
    setSaving(true);
    try {
      await deliverableAssignmentsApi.delete(linkId);
      await refreshSummary();
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (linkId: number, role: string) => {
    if (!linkId) return;
    setSaving(true);
    try {
      await deliverableAssignmentsApi.update(linkId, { roleOnMilestone: role });
      await refreshSummary();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_2fr]">
      <section className="space-y-3 border-b border-[var(--color-border)] pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <PanelHeader title="Milestones" subtitle="Current month deliverables" />
        {loading ? (
          <InlineAlert tone="info">Loading…</InlineAlert>
        ) : (
          <div className="grid gap-2">
            {items.map((item) => {
              const selected = selectedDeliverableId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedDeliverableId(item.id)}
                  className={[
                    'rounded-[var(--radius-md)] border px-3 py-2 text-left transition-colors',
                    selected
                      ? 'border-[var(--color-action-primary)] bg-[var(--surfaceHover)] text-[var(--color-text-primary)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:bg-[var(--surfaceHover)]',
                  ].join(' ')}
                >
                  <div className="font-semibold">{item.projectName || `Project ${item.project}`}</div>
                  <div className="text-sm text-[var(--color-text-secondary)]">
                    {item.title} — {item.date}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <PanelHeader title="Assignments" subtitle="Link and annotate milestone staffing" />
        {selectedDeliverableId == null ? (
          <InlineAlert tone="info">Select a milestone.</InlineAlert>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-[220px] flex-1">
                <Select
                  aria-label="Add person to milestone"
                  disabled={saving}
                  defaultValue=""
                  onChange={(e) => {
                    const value = Number((e.target as HTMLSelectElement).value);
                    if (value) void handleAddPerson(value);
                    (e.target as HTMLSelectElement).value = '';
                  }}
                >
                  <option value="">+ Add person to milestone…</option>
                  {people.filter((person: any) => !shownIds.has(person.id)).map((person: any) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </Select>
              </div>
              {saving ? <div className="text-sm text-[var(--color-text-secondary)]">Saving…</div> : null}
            </div>

            {(!staff || staff.length === 0) ? (
              <InlineAlert tone="info">No people found in window.</InlineAlert>
            ) : staff.map((entry: any) => (
              <div key={entry.linkId ?? entry.personId} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-semibold text-[var(--color-text-primary)]">{entry.personName}</div>
                    <div className="text-sm text-[var(--color-text-secondary)]">
                      Assigned hours until deliverable: {entry.totalHours}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="text"
                      defaultValue={entry.roleOnMilestone || ''}
                      placeholder={entry.linkId ? 'Role on milestone' : 'Link to edit role'}
                      onBlur={(e) => {
                        if (entry.linkId) void handleRoleChange(entry.linkId, (e.target as HTMLInputElement).value);
                      }}
                      disabled={!entry.linkId}
                      className={!entry.linkId ? 'opacity-60 cursor-not-allowed' : ''}
                    />
                    {entry.linkId ? (
                      <Button variant="danger" onClick={() => void handleRemoveLink(entry.linkId)}>
                        Remove
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => void handleAddPerson(entry.personId)}>
                        Link
                      </Button>
                    )}
                  </div>
                </div>
                {entry.weekBreakdown && Object.keys(entry.weekBreakdown).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(entry.weekBreakdown)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([week, hours]: any) => (
                        <span
                          key={week}
                          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]"
                        >
                          {week}: {Math.round(Number(hours))}h
                        </span>
                      ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default MilestoneReviewTool;
