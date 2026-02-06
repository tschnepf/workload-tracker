﻿import React, { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { darkTheme } from '../../../theme/tokens';
import { deliverablesApi, deliverableAssignmentsApi, peopleApi } from '../../../services/api';

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
      try {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
        const end = new Date(today.getFullYear(), today.getMonth()+1, 0).toISOString().slice(0,10);
        const data = await deliverablesApi.calendar(start, end, verticalState.selectedVerticalId ?? undefined);
        setItems(data);
        if (data.length > 0) setSelectedDeliverableId(data[0].id);
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
        const [summary] = await Promise.all([
          deliverablesApi.staffingSummary(selectedDeliverableId),
        ]);
        setStaff(summary);
      } catch (e) {
        console.error('Failed to load staffing summary', e);
      }
    };
    loadAssignments();
  }, [selectedDeliverableId]);

  // Load people for linking (lightweight autocomplete seed)
  useEffect(() => {
    const load = async () => {
      try {
        const first = await peopleApi.autocomplete('', 50, verticalState.selectedVerticalId ?? undefined);
        setPeople(first);
      } catch (e) {
        console.error('Failed to load people', e);
      }
    };
    load();
  }, [verticalState.selectedVerticalId]);

  const refreshSummary = async () => {
    if (!selectedDeliverableId) return;
    const summary = await deliverablesApi.staffingSummary(selectedDeliverableId);
    setStaff(summary);
  };

  const shownIds = new Set((staff || []).map((s: any) => s.personId));
  const linkedIds = new Set((staff || []).filter((s: any) => s.linkId != null).map((s: any) => s.personId));

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
    setSaving(true);
    try {
      await deliverableAssignmentsApi.update(linkId, { roleOnMilestone: role });
      await refreshSummary();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: darkTheme.spacing.md }}>
      <div style={{ borderRight: `1px solid ${darkTheme.colors.border.secondary}`, paddingRight: darkTheme.spacing.md }}>
        <div style={{ color: darkTheme.colors.text.secondary, marginBottom: darkTheme.spacing.sm }}>Milestones</div>
        {loading ? (
          <div style={{ color: darkTheme.colors.text.muted }}>Loadingâ€¦</div>
        ) : (
          <div style={{ display: 'grid', gap: darkTheme.spacing.xs }}>
            {items.map((i) => (
              <button key={i.id} onClick={() => setSelectedDeliverableId(i.id)} style={{
                textAlign: 'left',
                padding: darkTheme.spacing.xs,
                borderRadius: darkTheme.borderRadius.sm,
                border: `1px solid ${selectedDeliverableId === i.id ? darkTheme.colors.brand.primary : darkTheme.colors.border.secondary}`,
                background: selectedDeliverableId === i.id ? darkTheme.colors.background.elevated : 'transparent',
                color: darkTheme.colors.text.primary,
                cursor: 'pointer'
              }}>
                <div style={{ fontWeight: 600 }}>{i.projectName || `Project ${i.project}`}</div>
                <div style={{ fontSize: darkTheme.typography.fontSize.sm, color: darkTheme.colors.text.secondary }}>
                  {i.title} â€” {i.date}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <div style={{ color: darkTheme.colors.text.secondary, marginBottom: darkTheme.spacing.sm }}>Assignments</div>
        {selectedDeliverableId == null ? (
          <div style={{ color: darkTheme.colors.text.muted }}>Select a milestone</div>
        ) : (
          <div style={{ display: 'grid', gap: darkTheme.spacing.sm }}>
            {/* Add Person */}
            <div style={{ display: 'flex', gap: darkTheme.spacing.sm, alignItems: 'center' }}>
              <select
                disabled={saving}
                defaultValue=""
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val) handleAddPerson(val);
                  e.currentTarget.value = '';
                }}
                style={{
                  background: darkTheme.colors.background.tertiary,
                  color: darkTheme.colors.text.primary,
                  border: `1px solid ${darkTheme.colors.border.secondary}`,
                  borderRadius: 6,
                  padding: '6px 8px',
                  minWidth: 240,
                }}
              >
                <option value="">+ Add person to milestoneâ€¦</option>
                {people.filter(p => !shownIds.has(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {saving && <span style={{ color: darkTheme.colors.text.muted }}>Savingâ€¦</span>}
            </div>

            {/* Staff list */}
            {(!staff || staff.length === 0) ? (
              <div style={{ color: darkTheme.colors.text.muted }}>No people found in window</div>
            ) : staff.map((s: any) => (
              <div key={s.linkId ?? s.personId} style={{
                padding: darkTheme.spacing.sm,
                background: darkTheme.colors.background.tertiary,
                borderRadius: darkTheme.borderRadius.md,
                border: `1px solid ${darkTheme.colors.border.secondary}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.personName}</div>
                    <div style={{ fontSize: darkTheme.typography.fontSize.sm, color: darkTheme.colors.text.secondary }}>
                      Assigned hours until deliverable: {s.totalHours}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      defaultValue={s.roleOnMilestone || ''}
                      placeholder={s.linkId ? 'Role on milestone' : 'Link to edit role'}
                      onBlur={(e) => s.linkId && handleRoleChange(s.linkId, e.target.value)}
                      disabled={!s.linkId}
                      style={{
                        background: darkTheme.colors.background.tertiary,
                        color: darkTheme.colors.text.primary,
                        border: `1px solid ${darkTheme.colors.border.secondary}`,
                        borderRadius: 6,
                        padding: '6px 8px',
                        minWidth: 180,
                        opacity: s.linkId ? 1 : 0.6,
                        cursor: s.linkId ? 'text' : 'not-allowed',
                      }}
                    />
                    {s.linkId ? (
                      <button
                        onClick={() => handleRemoveLink(s.linkId)}
                        style={{
                          color: '#f87171',
                          border: `1px solid ${darkTheme.colors.border.secondary}`,
                          background: 'transparent',
                          borderRadius: 6,
                          padding: '6px 8px',
                          cursor: 'pointer',
                        }}
                        title="Unlink from milestone"
                      >Remove</button>
                    ) : (
                      <button
                        onClick={() => handleAddPerson(s.personId)}
                        style={{
                          color: darkTheme.colors.text.primary,
                          border: `1px solid ${darkTheme.colors.border.secondary}`,
                          background: 'transparent',
                          borderRadius: 6,
                          padding: '6px 8px',
                          cursor: 'pointer',
                        }}
                        title="Link this person to milestone"
                      >Link</button>
                    )}
                  </div>
                </div>
                {/* Simple week breakdown */}
                {s.weekBreakdown && Object.keys(s.weekBreakdown).length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(s.weekBreakdown).sort(([a],[b]) => a.localeCompare(b)).map(([wk, hrs]: any) => (
                      <div key={wk} style={{
                        fontSize: 12,
                        color: darkTheme.colors.text.secondary,
                        border: `1px solid ${darkTheme.colors.border.secondary}`,
                        borderRadius: 4,
                        padding: '2px 6px'
                      }}>{wk}: {Math.round(Number(hrs))}h</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MilestoneReviewTool;
