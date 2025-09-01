import React, { useEffect, useState } from 'react';
import { darkTheme } from '../../../theme/tokens';
import { deliverablesApi, deliverableAssignmentsApi } from '../../../services/api';

interface Props { onClose: () => void }

const MilestoneReviewTool: React.FC<Props> = () => {
  const [items, setItems] = useState<any[]>([]);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
        const end = new Date(today.getFullYear(), today.getMonth()+1, 0).toISOString().slice(0,10);
        const data = await deliverablesApi.calendar(start, end);
        setItems(data);
        if (data.length > 0) setSelectedDeliverableId(data[0].id);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  useEffect(() => {
    const loadAssignments = async () => {
      if (!selectedDeliverableId) return;
      const data = await deliverableAssignmentsApi.byDeliverable(selectedDeliverableId);
      setAssignments(data);
    };
    loadAssignments();
  }, [selectedDeliverableId]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: darkTheme.spacing.md }}>
      <div style={{ borderRight: `1px solid ${darkTheme.colors.border.secondary}`, paddingRight: darkTheme.spacing.md }}>
        <div style={{ color: darkTheme.colors.text.secondary, marginBottom: darkTheme.spacing.sm }}>Milestones</div>
        {loading ? (
          <div style={{ color: darkTheme.colors.text.muted }}>Loading…</div>
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
                  {i.title} — {i.date}
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
            {assignments.length === 0 ? (
              <div style={{ color: darkTheme.colors.text.muted }}>No assignments linked</div>
            ) : assignments.map((a) => (
              <div key={a.id} style={{
                padding: darkTheme.spacing.sm,
                background: darkTheme.colors.background.tertiary,
                borderRadius: darkTheme.borderRadius.md,
                border: `1px solid ${darkTheme.colors.border.secondary}`
              }}>
                <div style={{ fontWeight: 600 }}>{a.personName}</div>
                <div style={{ color: darkTheme.colors.text.secondary, fontSize: darkTheme.typography.fontSize.sm }}>
                  Hours: {(Object.values(a.weeklyHours || {}) as number[]).reduce((sum, h) => sum + Number(h), 0)} total
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MilestoneReviewTool;
