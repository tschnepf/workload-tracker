/**
 * Deliverables Section - STANDARDS COMPLIANT
 * Follows R2-REBUILD-STANDARDS.md and R2-REBUILD-DELIVERABLES.md
 * Integrates into existing Projects page split-panel layout
 * Sorted by date/percentage with null dates first; manual reordering disabled
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { Project, Deliverable } from '@/types/models';
import { deliverablesApi } from '@/services/api';
import { emitGridRefresh } from '@/lib/gridRefreshBus';
import { createDeliverable, updateDeliverable, deleteDeliverable } from '@/lib/mutations/deliverables';
import { showToast } from '@/lib/toastBus';
import { useQueryClient } from '@tanstack/react-query';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';

// Compact date formatter with year for single-line rows (e.g., "Apr 17, 2026")
const formatDateNoYear = (dateStr: string) => {
  try {
    const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

export interface DeliverablesSectionHandle {
  openAdd: () => void;
}

interface DeliverablesSectionProps {
  project: Project;
  variant?: 'default' | 'embedded';
  appearance?: 'default' | 'presentation';
  showHeader?: boolean;
  onDeliverablesChanged?: () => void;
  refreshToken?: number;
}

const DeliverablesSection = React.forwardRef<DeliverablesSectionHandle, DeliverablesSectionProps>(
  ({ project, variant = 'default', appearance = 'default', showHeader = true, onDeliverablesChanged, refreshToken }, ref) => {
  const queryClient = useQueryClient();
  const isPresentation = appearance === 'presentation';
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datePicker, setDatePicker] = useState<{
    deliverableId: number;
    value: string;
    month: number;
    year: number;
    anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  } | null>(null);
  const datePopoverRef = useRef<HTMLDivElement | null>(null);
  React.useImperativeHandle(ref, () => ({
    openAdd: () => setShowAddForm(true),
  }));
  const sortedDeliverables = useMemo(() => {
    const getDateValue = (date?: string | null) => {
      if (!date) return null;
      const normalized = date.length <= 10 ? `${date}T00:00:00` : date;
      const ts = Date.parse(normalized);
      return Number.isNaN(ts) ? null : ts;
    };
    const getPercentageValue = (percentage?: number | null) =>
      percentage == null ? Number.POSITIVE_INFINITY : percentage;
    return [...deliverables].sort((a, b) => {
      const aDate = getDateValue(a.date);
      const bDate = getDateValue(b.date);
      if (aDate == null && bDate != null) return 1;
      if (aDate != null && bDate == null) return -1;
      if (aDate != null && bDate != null && aDate !== bDate) return aDate - bDate;
      const aPct = getPercentageValue(a.percentage);
      const bPct = getPercentageValue(b.percentage);
      if (aPct !== bPct) return aPct - bPct;
      const aId = a.id ?? 0;
      const bId = b.id ?? 0;
      return aId - bId;
    });
  }, [deliverables]);

  useAuthenticatedEffect(() => {
    if (project.id) {
      loadDeliverables();
    }
  }, [project.id, refreshToken]);

  const loadDeliverables = async () => {
    if (!project.id) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await deliverablesApi.list(project.id);
      setDeliverables(response.results || []);
    } catch (err: any) {
      setError('Failed to load deliverables');
      console.error('Failed to load deliverables:', err);
    } finally {
      setLoading(false);
    }
  };

  const parseYmd = (value: string): { year: number; month: number; day: number } | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [yy, mm, dd] = value.split('-').map(Number);
    if (!yy || !mm || !dd) return null;
    return { year: yy, month: mm - 1, day: dd };
  };

  const formatYmd = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const openDatePicker = (deliverable: Deliverable, anchorEl: HTMLElement) => {
    if (!deliverable?.id) return;
    const parsed = deliverable.date ? parseYmd(deliverable.date) : null;
    const baseDate = parsed ? new Date(parsed.year, parsed.month, parsed.day) : new Date();
    const rect = anchorEl.getBoundingClientRect();
    setDatePicker({
      deliverableId: deliverable.id,
      value: deliverable.date || '',
      month: baseDate.getMonth(),
      year: baseDate.getFullYear(),
      anchorRect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  const handleDatePicked = async (nextValue: string) => {
    if (!datePicker) return;
    const prevValue = datePicker.value || '';
    const value = nextValue || '';
    if (value === prevValue) {
      setDatePicker(null);
      return;
    }
    try {
      await handleUpdateDeliverable(datePicker.deliverableId, { date: value || null });
    } finally {
      setDatePicker(null);
    }
  };

  useEffect(() => {
    if (!datePicker) return;
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (datePopoverRef.current && target && datePopoverRef.current.contains(target)) return;
      setDatePicker(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDatePicker(null);
    };
    const handleScroll = () => setDatePicker(null);
    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [datePicker]);

  const handleAddDeliverable = () => {
    setShowAddForm(true);
  };

  const handleSaveDeliverable = async (deliverableData: Partial<Deliverable>) => {
    if (!project.id) return;

    try {
      await createDeliverable({
        project: project.id,
        ...deliverableData
      }, deliverablesApi);
      await loadDeliverables();
      // Invalidate project filter metadata (future deliverables flags)
      await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
      try { onDeliverablesChanged?.(); } catch {}
      try { emitGridRefresh({ reason: 'deliverable-created' }); } catch {}
      setShowAddForm(false);
    } catch (err: any) {
      setError('Failed to create deliverable');
    }
  };

  const handleUpdateDeliverable = async (id: number, deliverableData: Partial<Deliverable>) => {
    try {
      const updated = await updateDeliverable(id, deliverableData, deliverablesApi);
      try {
        const anyUpdated: any = updated as any;
        const r = anyUpdated && anyUpdated.reallocation;
        if (r && typeof r === 'object') {
          const n = Number(r.assignmentsChanged || 0);
          const w = Array.isArray(r.touchedWeekKeys) ? r.touchedWeekKeys.length : 0;
          const dw = Number(r.deltaWeeks || 0);
          showToast(`Auto-reallocated hours (${dw >= 0 ? '+' : ''}${dw} weeks): ${n} assignments, ${w} weeks touched`, 'info');
          try { emitGridRefresh({ touchedWeekKeys: Array.isArray(r.touchedWeekKeys) ? r.touchedWeekKeys : undefined, reason: 'deliverable-date-change' }); } catch {}
        }
      } catch {}
      await loadDeliverables();
      await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
      try { onDeliverablesChanged?.(); } catch {}
      try { emitGridRefresh({ reason: 'deliverable-updated' }); } catch {}
      setEditingId(null);
    } catch (err: any) {
      setError('Failed to update deliverable');
    }
  };

  const handleDeleteDeliverable = async (id: number) => {
    if (!confirm('Are you sure you want to delete this deliverable?')) {
      return;
    }

    try {
      await deleteDeliverable(id, deliverablesApi);
      await loadDeliverables();
      await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
      try { onDeliverablesChanged?.(); } catch {}
      try { emitGridRefresh({ reason: 'deliverable-deleted' }); } catch {}
    } catch (err: any) {
      setError('Failed to delete deliverable');
    }
  };

  const containerClass = variant === 'embedded' ? '' : 'border-t border-[var(--border)] pt-4';

  const datePickerPopover = datePicker && typeof document !== 'undefined' ? (() => {
    const { anchorRect, month, year, value } = datePicker;
    const popoverWidth = 244;
    const popoverHeight = 260;
    const margin = 8;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
    const spaceBelow = viewportH - anchorRect.bottom;
    const placeBelow = spaceBelow >= popoverHeight || anchorRect.top < popoverHeight;
    const top = placeBelow ? anchorRect.bottom + 6 : anchorRect.top - popoverHeight - 6;
    const left = Math.min(Math.max(anchorRect.left, margin), Math.max(margin, viewportW - popoverWidth - margin));
    const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
    const selected = value ? parseYmd(value) : null;
    const today = new Date();
    const todayYmd = formatYmd(today);
    const start = new Date(year, month, 1);
    const startDay = start.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const cells = Array.from({ length: 42 }).map((_, idx) => {
      const offset = idx - startDay + 1;
      let d: Date;
      let inMonth = true;
      if (offset <= 0) {
        d = new Date(year, month - 1, daysInPrevMonth + offset);
        inMonth = false;
      } else if (offset > daysInMonth) {
        d = new Date(year, month + 1, offset - daysInMonth);
        inMonth = false;
      } else {
        d = new Date(year, month, offset);
      }
      const ymd = formatYmd(d);
      const isSelected = !!(selected && selected.year === d.getFullYear() && selected.month === d.getMonth() && selected.day === d.getDate());
      const isToday = ymd === todayYmd;
      return { date: d, inMonth, isSelected, isToday, ymd };
    });
    const moveMonth = (delta: number) => {
      setDatePicker(prev => {
        if (!prev) return prev;
        const next = new Date(prev.year, prev.month + delta, 1);
        return { ...prev, month: next.getMonth(), year: next.getFullYear() };
      });
    };
    return createPortal(
      <div
        ref={datePopoverRef}
        className="fixed z-[1300]"
        style={{ top, left, width: popoverWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg p-2">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              className="px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="text-sm font-medium text-[var(--text)]">{monthLabel}</div>
            <button
              type="button"
              className="px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)]"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 text-[10px] text-[var(--muted)] mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
              <div key={d} className="text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => (
              <button
                key={cell.ymd}
                type="button"
                className={`h-7 w-7 text-xs rounded-full mx-auto flex items-center justify-center transition-colors ${
                  cell.isSelected
                    ? 'bg-[var(--primary)] text-white'
                    : cell.isToday
                      ? 'border border-[var(--primary)] text-[var(--text)]'
                      : cell.inMonth
                        ? 'text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                        : 'text-[var(--muted)]'
                }`}
                onClick={() => handleDatePicked(cell.ymd)}
              >
                {cell.date.getDate()}
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body
    );
  })() : null;

  return (
    <div className={containerClass}>
      {showHeader && (
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-base font-semibold text-[var(--text)]">Deliverables</h3>
          <button
            data-testid="add-deliverable-btn"
            onClick={handleAddDeliverable}
            className="w-6 h-6 text-xs rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] transition-colors flex items-center justify-center"
            aria-label="Add deliverable"
          >
            +
          </button>
        </div>
      )}

      {/* Column Headers */}
      {deliverables.length > 0 && (
        <div className="flex items-center text-[var(--muted)] text-xs mb-1">
          <div className="grid grid-cols-[6ch_1fr_1fr_1fr_1.5rem] gap-4 flex-1 min-w-0">
            <div className="font-medium text-center">%</div>
            <div className="font-medium text-center">Description</div>
            <div className="font-medium text-center">Date</div>
            <div className="font-medium text-center">Notes</div>
            <div aria-hidden="true" />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-2 p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-[var(--muted)] text-sm">Loading deliverables...</div>
      ) : deliverables.length === 0 && !showAddForm ? (
        <div className="text-center py-8">
          <div className="text-[var(--muted)] text-sm">No deliverables yet</div>
          <div className="text-[var(--muted)] text-xs mt-1">Click "Add Deliverable" to get started</div>
        </div>
      ) : (
        <div className={isPresentation ? 'space-y-0.5' : 'space-y-1'}>
          {sortedDeliverables.map((deliverable) => (
            <DeliverableRow
              key={deliverable.id}
              deliverable={deliverable}
              editing={editingId === deliverable.id}
              onSave={(data) => handleUpdateDeliverable(deliverable.id!, data)}
              onCancel={() => setEditingId(null)}
              onDelete={() => handleDeleteDeliverable(deliverable.id!)}
              onOpenDatePicker={(anchorEl) => openDatePicker(deliverable, anchorEl)}
              focusField={null}
              appearance={appearance}
            />
          ))}
        </div>
      )}

      {showAddForm && (
        <AddDeliverableForm
          onSave={handleSaveDeliverable}
          onCancel={() => setShowAddForm(false)}
        />
      )}
      {datePickerPopover}
    </div>
  );
});

interface DeliverableRowProps {
  deliverable: Deliverable;
  editing: boolean;
  onSave: (data: Partial<Deliverable>) => void;
  onCancel: () => void;
  onDelete: () => void;
  onOpenDatePicker: (anchorEl: HTMLElement) => void;
  focusField: 'percentage'|'description'|'date'|'notes'|null;
  appearance: 'default' | 'presentation';
}

const DeliverableRow: React.FC<DeliverableRowProps> = ({
  deliverable,
  editing,
  onSave,
  onCancel,
  onDelete,
  onOpenDatePicker,
  focusField,
  appearance,
}) => {
  const [editData, setEditData] = useState({
    percentage: deliverable.percentage,
    description: deliverable.description || '',
    date: deliverable.date,
    notes: deliverable.notes || '',
    isCompleted: deliverable.isCompleted || false,
  });

  // Lightweight per-cell inline edit state (no row-level edit chrome)
  const [inlineField, setInlineField] = useState<null | 'percentage' | 'description' | 'date' | 'notes'>(null);
  const [inlineDraft, setInlineDraft] = useState<string>('');

  function startInline(field: 'percentage'|'description'|'date'|'notes') {
    setInlineField(field);
    switch (field) {
      case 'percentage': setInlineDraft(editData.percentage != null ? String(editData.percentage) : ''); break;
      case 'description': setInlineDraft(editData.description || ''); break;
      case 'date': setInlineDraft(editData.date || ''); break;
      case 'notes': setInlineDraft(editData.notes || ''); break;
    }
  }

  async function commitInline() {
    const field = inlineField; if (!field) return;
    let patch: Partial<Deliverable> = {};
    if (field === 'percentage') {
      const n = inlineDraft.trim();
      const parsed = n === '' ? null : Math.max(0, Math.min(100, Math.floor(Number(n))));
      if (n !== '' && Number.isNaN(parsed)) { setInlineField(null); return; }
      patch = { percentage: parsed } as Partial<Deliverable>;
    } else if (field === 'description') {
      patch = { description: inlineDraft } as Partial<Deliverable>;
    } else if (field === 'date') {
      const v = inlineDraft.trim();
      patch = { date: v === '' ? null : v } as Partial<Deliverable>;
    } else if (field === 'notes') {
      patch = { notes: inlineDraft } as Partial<Deliverable>;
    }
    try {
      await onSave(patch);
    } finally {
      setInlineField(null);
    }
  }

  // Update edit data when deliverable changes
  useEffect(() => {
    if (editing) {
      setEditData({
        percentage: deliverable.percentage,
        description: deliverable.description || '',
        date: deliverable.date,
        notes: deliverable.notes || '',
        isCompleted: deliverable.isCompleted || false,
      });
    }
  }, [deliverable, editing]);

  if (editing) {
    return (
      <div className="p-2 bg-[var(--surfaceOverlay)] rounded border border-[var(--border)]" data-testid={`deliverable-row-${deliverable.id}`}>
        <div className="grid grid-cols-5 gap-2 items-center text-xs mb-2">
          <div className="text-[var(--muted)] font-medium">%</div>
          <div className="text-[var(--muted)] font-medium">DESCRIPTION</div>
          <div className="text-[var(--muted)] font-medium">DATE</div>
          <div className="text-[var(--muted)] font-medium">NOTES</div>
          <div className="text-[var(--muted)] font-medium">ACTIONS</div>
        </div>
        
        <div className="grid grid-cols-5 gap-2 items-start">

          {/* Percentage Input */}
          <input
            type="number"
            min="0"
            max="100"
            value={editData.percentage || ''}
            onChange={(e) => setEditData({
              ...editData,
              percentage: e.target.value ? Number(e.target.value) : null
            })}
            placeholder="%"
            className="px-1 py-0.5 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-xs [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
            ref={el => { if (focusField === 'percentage' && el) { setTimeout(() => el.focus(), 0); } }}
          />

          {/* Description Input */}
          <input
            type="text"
            value={editData.description}
            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            placeholder="Description"
            className="px-1 py-0.5 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-xs"
            ref={el => { if (focusField === 'description' && el) { setTimeout(() => el.focus(), 0); } }}
          />

          {/* Date Input with Remove Button */}
          <div className="relative">
            <input
              type="date"
              value={editData.date || ''}
              onChange={(e) => setEditData({ ...editData, date: e.target.value || null })}
              className="px-1 py-0.5 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-xs w-full pr-5"
              ref={el => { if (focusField === 'date' && el) { setTimeout(() => el.focus(), 0); } }}
            />
            {editData.date && (
              <button
                onClick={() => setEditData({ ...editData, date: null })}
                className="absolute right-0.5 top-0 bottom-0 px-1 text-red-400 hover:text-red-300 text-xs"
              >
                ×
              </button>
            )}
          </div>

          {/* Notes Input */}
          <input
            type="text"
            value={editData.notes}
            onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
            placeholder="Notes"
            className="px-1 py-0.5 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-xs"
            ref={el => { if (focusField === 'notes' && el) { setTimeout(() => el.focus(), 0); } }}
          />

          {/* Action Buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => onSave(editData)}
              className="px-1 py-0.5 bg-[var(--primary)] text-white text-xs rounded hover:bg-[var(--primaryHover)] transition-colors"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="px-1 py-0.5 bg-transparent border border-[var(--border)] text-[var(--muted)] text-xs rounded hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Completion Checkbox */}
        <div className="mt-2 flex items-center gap-2 ml-2">
          <input
            type="checkbox"
            id={`completed-${deliverable.id}`}
            checked={editData.isCompleted}
            onChange={(e) => setEditData({ ...editData, isCompleted: e.target.checked })}
            className="w-3 h-3"
          />
          <label htmlFor={`completed-${deliverable.id}`} className="text-xs text-[var(--text)]">
            Mark as completed
          </label>
        </div>
      </div>
    );
  }

  const rowBaseClass = appearance === 'presentation'
    ? 'bg-transparent border border-transparent hover:bg-[var(--surfaceOverlay)]/40'
    : (deliverable.isCompleted
      ? 'bg-[var(--surfaceOverlay)] border border-[var(--border)]'
      : 'bg-[var(--card)] border border-[var(--border)]');
  const parseLocalDate = (value?: string | null) => {
    if (!value) return null;
    return new Date(value.slice(0, 10) + 'T00:00:00');
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deliverableDate = parseLocalDate(deliverable.date);
  const soonEnd = new Date(today.getTime() + 13 * 24 * 60 * 60 * 1000);
  const isSoon = !!(deliverableDate && deliverableDate >= today && deliverableDate <= soonEnd);
  const isRecent = !!(deliverableDate && deliverableDate <= today && (today.getTime() - deliverableDate.getTime()) <= 8 * 24 * 60 * 60 * 1000);
  const dateClass = isSoon
    ? 'text-[#b22222] font-semibold'
    : isRecent
      ? 'text-[#d2691e] italic'
      : 'text-[var(--muted)]';

  const rowPaddingClass = appearance === 'presentation' ? 'py-1.5 px-0' : 'p-2';
  return (
    <div 
      className={`flex items-center rounded text-xs transition-all ${rowPaddingClass} ${rowBaseClass}`}
    >
        {/* Content Grid – per-cell inline editing */}
        <div className="grid grid-cols-[6ch_1fr_1fr_1fr_1.5rem] gap-4 flex-1 min-w-0">
          <div className={`${deliverable.isCompleted ? 'text-[var(--muted)] line-through' : 'text-[var(--text)]'} text-center`}>
            {inlineField === 'percentage' ? (
              <input
                type="number"
                min={0}
                max={100}
                className="w-12 bg-transparent border-none p-0 m-0 text-[inherit] text-xs leading-tight outline-none focus:outline-none focus:ring-0 text-center [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                value={inlineDraft}
                onChange={(e) => setInlineDraft(e.currentTarget.value)}
                onBlur={commitInline}
                onKeyDown={(e) => { if (e.key==='Enter'){ e.preventDefault(); commitInline(); } else if (e.key==='Escape'){ e.preventDefault(); setInlineField(null); } }}
                autoFocus
              />
            ) : (
              <button type="button" className="hover:underline" onClick={() => startInline('percentage')}>
                {deliverable.percentage !== null ? `${deliverable.percentage}%` : '-'}
              </button>
            )}
          </div>
          <div className={`${deliverable.isCompleted ? 'text-[var(--muted)] line-through' : 'text-[var(--text)]'} truncate min-w-0 text-center`}>
            {inlineField === 'description' ? (
              <input
                type="text"
                className="w-full bg-transparent border-none p-0 m-0 text-[inherit] text-xs leading-tight outline-none focus:outline-none focus:ring-0 text-center"
                value={inlineDraft}
                onChange={(e) => setInlineDraft(e.currentTarget.value)}
                onBlur={commitInline}
                onKeyDown={(e) => { if (e.key==='Enter'){ e.preventDefault(); commitInline(); } else if (e.key==='Escape'){ e.preventDefault(); setInlineField(null); } }}
                autoFocus
              />
            ) : (
              <button type="button" className="truncate hover:underline text-center w-full" onClick={() => startInline('description')}>
                {deliverable.description || '-'}
              </button>
            )}
          </div>
          <div className={`${dateClass} whitespace-nowrap text-center`}>
            <button
              type="button"
              className="hover:underline cursor-pointer w-full text-center"
              onClick={(e) => onOpenDatePicker(e.currentTarget as HTMLElement)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenDatePicker(e.currentTarget as HTMLElement);
                }
              }}
            >
              {deliverable.date ? formatDateNoYear(deliverable.date) : '-'}
            </button>
          </div>
          <div className="text-[var(--muted)] truncate min-w-0 text-center">
            {inlineField === 'notes' ? (
              <input
                type="text"
                className="w-full bg-transparent border-none p-0 m-0 text-[inherit] text-xs leading-tight outline-none focus:outline-none focus:ring-0 text-center"
                value={inlineDraft}
                onChange={(e) => setInlineDraft(e.currentTarget.value)}
                onBlur={commitInline}
                onKeyDown={(e) => { if (e.key==='Enter'){ e.preventDefault(); commitInline(); } else if (e.key==='Escape'){ e.preventDefault(); setInlineField(null); } }}
                autoFocus
              />
            ) : (
              <button type="button" className="truncate hover:underline text-center w-full" onClick={() => startInline('notes')}>
                {deliverable.notes || '-'}
              </button>
            )}
          </div>
          <div className="flex items-center justify-center">
            {deliverable.isCompleted && (
              <span className="text-emerald-400 text-xs mr-1">✓</span>
            )}
            <button
              onClick={onDelete}
              className="w-4 h-4 flex items-center justify-center text-red-300 hover:text-red-200 rounded transition-colors"
              title="Delete deliverable"
              aria-label="Delete deliverable"
            >
              ×
            </button>
          </div>
        </div>
    </div>
  );
};

interface AddDeliverableFormProps {
  onSave: (data: Partial<Deliverable>) => void;
  onCancel: () => void;
}

const AddDeliverableForm: React.FC<AddDeliverableFormProps> = ({ onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    percentage: null as number | null,
    description: '',
    date: null as string | null,
    notes: '',
  });

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="p-3 bg-[var(--surfaceOverlay)] rounded border border-[var(--border)] mt-2 overflow-hidden">
      <div className="flex items-start gap-2">
        <div className="w-4 shrink-0"></div>
        <div className="flex-1 space-y-3 max-w-full">
          <div>
            <label className="block text-[var(--muted)] text-xs mb-1">Percentage</label>
            <input
              type="number"
              min="0"
              max="100"
              value={formData.percentage || ''}
              onChange={(e) => setFormData({
                ...formData,
                percentage: e.target.value ? Number(e.target.value) : null
              })}
              placeholder="% (optional)"
              className="w-28 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-sm [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
            />
          </div>
          <div>
            <label className="block text-[var(--muted)] text-xs mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="SD, DD, IFP, etc"
              className="w-full px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--muted)] text-xs mb-1">Date</label>
              <input
                type="date"
                value={formData.date || ''}
                onChange={(e) => setFormData({ ...formData, date: e.target.value || null })}
                className="w-full px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-sm"
              />
            </div>
            <div>
              <label className="block text-[var(--muted)] text-xs mb-1">Notes</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes (optional)"
                className="w-full px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              className="px-2 py-1 bg-[var(--primary)] text-white text-xs rounded hover:bg-[var(--primaryHover)] transition-colors"
            >
              Add
            </button>
            <button
              onClick={onCancel}
              className="px-2 py-1 bg-transparent border border-[var(--border)] text-[var(--muted)] text-xs rounded hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliverablesSection;
