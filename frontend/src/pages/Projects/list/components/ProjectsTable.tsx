import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project, Deliverable } from '@/types/models';
import StatusBadge, { getStatusColor, formatStatus } from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useDropdownManager } from '@/components/projects/useDropdownManager';
import { useProjectStatus } from '@/components/projects/useProjectStatus';
import { getFlag } from '@/lib/flags';
import { useVirtualRows } from '../hooks/useVirtualRows';
import { deliverablesApi } from '@/services/api';

interface Props {
  projects: Project[];
  selectedProjectId: number | null;
  onSelect: (p: Project, index: number) => void;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  loading?: boolean;
  nextDeliverables?: Map<number, Deliverable | null>;
  prevDeliverables?: Map<number, Deliverable | null>;
  onChangeStatus?: (projectId: number, newStatus: string) => void;
  onRefreshDeliverables?: (projectId: number) => void;
  onDeliverableEdited?: (projectId: number) => void;
  isMobileList?: boolean;
}

const ProjectsTable: React.FC<Props> = ({
  projects,
  selectedProjectId,
  onSelect,
  sortBy,
  sortDirection,
  onSort,
  loading,
  nextDeliverables,
  prevDeliverables,
  onChangeStatus,
  onRefreshDeliverables,
  onDeliverableEdited,
  isMobileList = false,
}) => {
  const enableVirtual = !isMobileList && getFlag('VIRTUALIZED_GRID', false) && projects.length > 200;
  const statusDropdown = useDropdownManager<string>();
  const projectStatus = useProjectStatus({
    onSuccess: (pid, newStatus) => {
      onChangeStatus?.(pid, newStatus);
    },
    getCurrentStatus: (pid) => {
      const p = projects.find(x => x.id === pid);
      return (p?.status as any) || 'active';
    }
  });
  const { parentRef, items, totalSize } = useVirtualRows({ count: projects.length, estimateSize: isMobileList ? 116 : 44, overscan: 6, enableVirtual });
  const groupClients = sortBy === 'client';
  const [openStatusFor, setOpenStatusFor] = useState<number | null>(null);
  const [hoverEnabled, setHoverEnabled] = useState(true);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('.status-dropdown-container')) return;
      if (openStatusFor != null) setOpenStatusFor(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openStatusFor]);

  useEffect(() => {
    if (hoverEnabled) return;
    const onMove = () => setHoverEnabled(true);
    window.addEventListener('mousemove', onMove, { once: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [hoverEnabled]);

  useEffect(() => {
    const disableHover = () => setHoverEnabled(false);
    window.addEventListener('mousedown', disableHover);
    window.addEventListener('mouseup', disableHover);
    window.addEventListener('keydown', disableHover);
    return () => {
      window.removeEventListener('mousedown', disableHover);
      window.removeEventListener('mouseup', disableHover);
      window.removeEventListener('keydown', disableHover);
    };
  }, []);

  const handleRowClick = (project: Project, index: number) => {
    setHoverEnabled(false);
    onSelect(project, index);
  };

  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [deliverableOverrides, setDeliverableOverrides] = useState<Map<number, Partial<Deliverable>>>(new Map());
  const [notesOverrides, setNotesOverrides] = useState<Map<number, string>>(new Map());
  const [notesEditor, setNotesEditor] = useState<{
    projectId: number;
    deliverableId: number;
    value: string;
    initialValue: string;
    saving: boolean;
    error: string | null;
  } | null>(null);
  const [nextEditor, setNextEditor] = useState<{
    projectId: number;
    deliverableId: number;
    field: 'percentage' | 'description';
    value: string;
    initialValue: string;
    saving: boolean;
    error: string | null;
  } | null>(null);
  const [datePicker, setDatePicker] = useState<{
    projectId: number;
    deliverableId: number;
    value: string;
    month: number;
    year: number;
    anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  } | null>(null);
  const datePopoverRef = useRef<HTMLDivElement | null>(null);
  const toggleExpanded = (projectId?: number | null) => {
    if (!projectId) return;
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const header = (
    <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_repeat(2,minmax(0,0.7fr))_repeat(4,minmax(0,1fr))_repeat(2,minmax(0,0.6fr))] gap-2 px-2 py-1.5 text-xs text-[var(--muted)] font-medium border-b border-[var(--border)] bg-[var(--card)]">
      <div className="col-span-2 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('client')}>
        CLIENT<SortIcon column="client" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-3 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('name')}>
        PROJECT<SortIcon column="name" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-1 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('number')}>
        NUMBER<SortIcon column="number" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-2 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('status')}>
        STATUS<SortIcon column="status" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-2 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('lastDue')}>
        LAST DELIVERABLE<SortIcon column="lastDue" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-2 cursor-pointer hover:text-[var(--text)] transition-colors flex items-center" onClick={() => onSort('nextDue')}>
        NEXT DELIVERABLE<SortIcon column="nextDue" sortBy={sortBy} sortDirection={sortDirection} />
      </div>
      <div className="col-span-2 flex items-center">
        NOTES
      </div>
    </div>
  );

  const mergeDeliverable = useMemo(() => {
    return (deliverable: Deliverable | null | undefined) => {
      if (!deliverable?.id) return deliverable ?? null;
      const override = deliverableOverrides.get(deliverable.id);
      const hasNotesOverride = notesOverrides.has(deliverable.id);
      const notesOverride = hasNotesOverride ? notesOverrides.get(deliverable.id) : undefined;
      if (!override && !hasNotesOverride) return deliverable;
      return {
        ...deliverable,
        ...override,
        notes: hasNotesOverride ? notesOverride : (override?.notes ?? deliverable.notes),
      };
    };
  }, [deliverableOverrides, notesOverrides]);

  const getNotesValue = useMemo(() => {
    return (deliverable: Deliverable | null | undefined) => {
      const merged = mergeDeliverable(deliverable);
      return merged?.notes || '';
    };
  }, [mergeDeliverable]);

  const startEditingNotes = (projectId: number, deliverable: Deliverable) => {
    if (!deliverable?.id) return;
    if (nextEditor) setNextEditor(null);
    const initialValue = deliverable.notes || '';
    setNotesEditor({
      projectId,
      deliverableId: deliverable.id,
      value: initialValue,
      initialValue,
      saving: false,
      error: null,
    });
  };

  const saveEditingNotes = async () => {
    if (!notesEditor) return;
    if (!notesEditor.deliverableId) return;
    if (notesEditor.value === notesEditor.initialValue) {
      setNotesEditor(null);
      return;
    }
    setNotesEditor(prev => (prev ? { ...prev, saving: true, error: null } : prev));
    try {
      await deliverablesApi.update(notesEditor.deliverableId, { notes: notesEditor.value });
      setNotesOverrides(prev => {
        const next = new Map(prev);
        next.set(notesEditor.deliverableId, notesEditor.value);
        return next;
      });
      onRefreshDeliverables?.(notesEditor.projectId);
      onDeliverableEdited?.(notesEditor.projectId);
      setNotesEditor(null);
    } catch (e: any) {
      const msg = e?.message || 'Failed to update notes';
      setNotesEditor(prev => (prev ? { ...prev, saving: false, error: msg } : prev));
    }
  };

  const startEditingNextDeliverable = (
    projectId: number,
    deliverable: Deliverable,
    field: 'percentage' | 'description',
    displayValue: string
  ) => {
    if (!deliverable?.id) return;
    if (notesEditor) setNotesEditor(null);
    setNextEditor({
      projectId,
      deliverableId: deliverable.id,
      field,
      value: displayValue,
      initialValue: displayValue,
      saving: false,
      error: null,
    });
  };

  const saveNextDeliverable = async () => {
    if (!nextEditor) return;
    const { field, value, initialValue } = nextEditor;
    const trimmed = value.trim();
    if (trimmed === initialValue) {
      setNextEditor(null);
      return;
    }
    let updatePayload: Partial<Deliverable> = {};
    let overridePayload: Partial<Deliverable> = {};
    if (field === 'percentage') {
      if (trimmed === initialValue) {
        setNextEditor(null);
        return;
      }
      let parsedPercent: number | null | undefined = undefined;
      if (trimmed === '') {
        parsedPercent = null;
      } else {
        const parsed = Number(trimmed);
        if (Number.isNaN(parsed)) {
          setNextEditor(prev => (prev ? { ...prev, error: 'Percent must be a number', saving: false } : prev));
          return;
        }
        parsedPercent = parsed;
      }
      updatePayload = { percentage: parsedPercent };
      overridePayload = { percentage: parsedPercent };
    } else if (field === 'description') {
      if (trimmed === initialValue) {
        setNextEditor(null);
        return;
      }
      updatePayload = { description: trimmed };
      overridePayload = { description: trimmed };
    }
    setNextEditor(prev => (prev ? { ...prev, saving: true, error: null } : prev));
    try {
      await deliverablesApi.update(nextEditor.deliverableId, updatePayload);
      setDeliverableOverrides(prev => {
        const next = new Map(prev);
        const current = next.get(nextEditor.deliverableId) || {};
        next.set(nextEditor.deliverableId, { ...current, ...overridePayload });
        return next;
      });
      onRefreshDeliverables?.(nextEditor.projectId);
      onDeliverableEdited?.(nextEditor.projectId);
      setNextEditor(null);
    } catch (e: any) {
      const msg = e?.message || 'Failed to update deliverable';
      setNextEditor(prev => (prev ? { ...prev, saving: false, error: msg } : prev));
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

  const openDatePicker = (projectId: number, deliverable: Deliverable, anchorEl: HTMLElement) => {
    if (!deliverable?.id) return;
    if (notesEditor) setNotesEditor(null);
    if (nextEditor) setNextEditor(null);
    const parsed = deliverable.date ? parseYmd(deliverable.date) : null;
    const baseDate = parsed ? new Date(parsed.year, parsed.month, parsed.day) : new Date();
    const rect = anchorEl.getBoundingClientRect();
    setDatePicker({
      projectId,
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
      await deliverablesApi.update(datePicker.deliverableId, { date: value || null });
      setDeliverableOverrides(prev => {
        const next = new Map(prev);
        const current = next.get(datePicker.deliverableId) || {};
        next.set(datePicker.deliverableId, { ...current, date: value || null });
        return next;
      });
      onRefreshDeliverables?.(datePicker.projectId);
      onDeliverableEdited?.(datePicker.projectId);
    } catch (e) {
      console.error('Failed to update deliverable date', e);
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

  const nonVirtualBody = (
    <div className="overflow-y-auto h-full pb-12 scrollbar-theme">
      {projects.map((project, index) => {
        const prev = index > 0 ? projects[index - 1] : null;
        const next = index < projects.length - 1 ? projects[index + 1] : null;
        const sameClientAsPrev = groupClients && prev && (prev.client || '') === (project.client || '');
        const sameClientAsNext = groupClients && next && (next.client || '') === (project.client || '');
        const isGroupStart = groupClients && !sameClientAsPrev && index !== 0;
        const hasTopDivider = isGroupStart;
        const showRowBottomDivider = !groupClients || sameClientAsNext;
        const isSelected = selectedProjectId === project.id;
        const highlightInsetTop = hasTopDivider ? 'top-px' : 'top-0';
        const nextDeliverableRaw = (project.id != null && typeof project.id === 'number' && nextDeliverables)
          ? nextDeliverables.get(project.id)
          : null;
        const prevDeliverableRaw = (project.id != null && typeof project.id === 'number' && prevDeliverables)
          ? prevDeliverables.get(project.id)
          : null;
        const nextDeliverable = mergeDeliverable(nextDeliverableRaw);
        const prevDeliverable = mergeDeliverable(prevDeliverableRaw);
        const nextPercentText = nextDeliverable?.percentage != null ? `${nextDeliverable.percentage}%` : '';
        const nextDescriptionText = nextDeliverable?.description || '';
        const showNextTopPlaceholder = !!nextDeliverable && !nextPercentText && !nextDescriptionText;
        const parseLocal = (s: string) => new Date((s || '').slice(0,10) + 'T00:00:00');
        const nextDate = nextDeliverable?.date ? parseLocal(nextDeliverable.date) : null;
        const nextBottom = nextDate ? nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const soonLimit = new Date(); soonLimit.setHours(0,0,0,0); const soonEnd = new Date(soonLimit.getTime() + 13*24*60*60*1000);
        const isSoonNext = !!(nextDate && nextDate >= soonLimit && nextDate <= soonEnd);
        const nextTopClass = isSoonNext ? 'text-[#b22222] font-semibold leading-tight' : 'text-[var(--text)] font-medium leading-tight';
        const nextBottomClass = isSoonNext ? 'text-[#b22222] text-xs leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
        const prevTopRaw = prevDeliverable ? `${prevDeliverable.percentage != null ? `${prevDeliverable.percentage}% ` : ''}${prevDeliverable.description || ''}`.trim() : '';
        const prevTop = prevTopRaw || '-';
        const prevBottom = prevDeliverable?.date ? parseLocal(prevDeliverable.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const today = new Date(); today.setHours(0,0,0,0);
        const prevDate = prevDeliverable?.date ? parseLocal(prevDeliverable.date) : null;
        const isRecentPrev = !!(prevDate && prevDate <= today && (today.getTime() - prevDate.getTime()) <= 8*24*60*60*1000);
        // Recent last deliverable: chocolate tint (#d2691e), italic, still smaller than next deliverable
        const prevTopClass = isRecentPrev ? 'text-[#d2691e] text-xs font-semibold italic leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
        const prevBottomClass = isRecentPrev ? 'text-[#d2691e] text-xs italic leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
        const isEditingNotes = notesEditor?.projectId === project.id && notesEditor?.deliverableId === nextDeliverable?.id;
        const isEditingNextPercent = nextEditor?.projectId === project.id && nextEditor?.deliverableId === nextDeliverable?.id && nextEditor.field === 'percentage';
        const isEditingNextDescription = nextEditor?.projectId === project.id && nextEditor?.deliverableId === nextDeliverable?.id && nextEditor.field === 'description';
        return (
          <div
            key={project.id}
            onClick={() => handleRowClick(project, index)}
            className={`relative grid grid-cols-[repeat(6,minmax(0,1fr))_repeat(2,minmax(0,0.7fr))_repeat(4,minmax(0,1fr))_repeat(2,minmax(0,0.6fr))] gap-2 px-2 py-1.5 text-sm ${hoverEnabled && !isSelected ? 'row-hover-subtle' : ''} transition-colors focus:outline-none ${isGroupStart ? 'border-t border-[var(--border)]' : ''}`}
            tabIndex={0}
          >
            {isSelected && (
              <div className={`absolute inset-x-0 ${highlightInsetTop} bottom-px bg-[var(--surfaceOverlay)] pointer-events-none`} />
            )}
            <div className="col-span-2 text-[var(--muted)] text-xs">
              {sameClientAsPrev ? '' : (project.client || 'No Client')}
            </div>
            <div className="col-span-3">
              <div className="text-[var(--text)] font-medium leading-tight">{project.name}</div>
            </div>
            <div className="col-span-1 text-[var(--muted)] text-xs">{project.projectNumber ?? ''}</div>
            <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
              <div className="relative" data-dropdown>
                <button
                  type="button"
                  className={`${getStatusColor(project.status || '')} whitespace-nowrap text-xs inline-flex items-center gap-1 px-1 py-0.5 rounded hover:text-[var(--text)]`}
                  onClick={() => project.id && statusDropdown.toggle(String(project.id))}
                  aria-haspopup="listbox"
                  aria-expanded={statusDropdown.isOpen(String(project.id))}
                >
                  {formatStatus(project.status || '')}
                  <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {project.id && (
                  <StatusDropdown
                    currentStatus={(project.status as any) || 'active'}
                    isOpen={statusDropdown.isOpen(String(project.id))}
                    onSelect={async (newStatus) => {
                      if (!project.id) return;
                      try {
                        await projectStatus.updateStatus(project.id, newStatus);
                        statusDropdown.close();
                      } catch {}
                    }}
                    onClose={statusDropdown.close}
                    projectId={project.id}
                    disabled={projectStatus.isUpdating(project.id)}
                    closeOnSelect={false}
                  />
                )}
              </div>
            </div>
            <div className="col-span-2">
              {prevDeliverable ? (
                <>
                  <div className={prevTopClass}>{prevTop}</div>
                  <div className={prevBottomClass}>{prevBottom || ''}</div>
                </>
              ) : (
                <div className="text-[var(--muted)] text-xs">-</div>
              )}
            </div>
            <div className="col-span-2">
              {nextDeliverable ? (
                <>
                  <div className={`${nextTopClass} flex items-baseline gap-1`}>
                    {isEditingNextPercent ? (
                      <span className="inline-flex items-baseline gap-0.5">
                        <input
                          autoFocus
                          type="text"
                          inputMode="decimal"
                          className="w-10 bg-transparent border-none p-0 m-0 outline-none focus:outline-none focus:ring-0 text-[inherit]"
                          value={nextEditor?.value ?? ''}
                          onChange={(e) => setNextEditor(prev => (prev ? { ...prev, value: e.target.value } : prev))}
                          onBlur={() => { void saveNextDeliverable(); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                              e.preventDefault();
                              void saveNextDeliverable();
                            }
                          }}
                        />
                        <span>%</span>
                      </span>
                    ) : (
                      nextPercentText && (
                        <span
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingNextDeliverable(project.id!, nextDeliverable, 'percentage', String(nextDeliverable.percentage ?? ''));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              startEditingNextDeliverable(project.id!, nextDeliverable, 'percentage', String(nextDeliverable.percentage ?? ''));
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          {nextPercentText}
                        </span>
                      )
                    )}
                    {isEditingNextDescription ? (
                      <input
                        autoFocus
                        type="text"
                        className="flex-1 min-w-0 bg-transparent border-none p-0 m-0 outline-none focus:outline-none focus:ring-0 text-[inherit]"
                        value={nextEditor?.value ?? ''}
                        onChange={(e) => setNextEditor(prev => (prev ? { ...prev, value: e.target.value } : prev))}
                        onBlur={() => { void saveNextDeliverable(); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                            e.preventDefault();
                            void saveNextDeliverable();
                          }
                        }}
                      />
                    ) : (
                      <>
                        {nextDescriptionText ? (
                          <span
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingNextDeliverable(project.id!, nextDeliverable, 'description', nextDescriptionText);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                startEditingNextDeliverable(project.id!, nextDeliverable, 'description', nextDescriptionText);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            {nextDescriptionText}
                          </span>
                        ) : showNextTopPlaceholder ? (
                          <span className="text-[var(--muted)] text-xs">-</span>
                        ) : (
                          <span
                            className="cursor-pointer text-transparent select-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingNextDeliverable(project.id!, nextDeliverable, 'description', '');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                startEditingNextDeliverable(project.id!, nextDeliverable, 'description', '');
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            .
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className={nextBottomClass}>
                    <span
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDatePicker(project.id!, nextDeliverable, e.currentTarget as HTMLElement);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openDatePicker(project.id!, nextDeliverable, e.currentTarget as HTMLElement);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {nextBottom || ''}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-[var(--muted)] text-xs">-</div>
              )}
            </div>
            <div
              className={`col-span-2 text-[var(--muted)] text-xs whitespace-normal break-words ${nextDeliverable?.id ? 'cursor-pointer' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (nextDeliverable?.id) startEditingNotes(project.id!, nextDeliverable);
              }}
              role={nextDeliverable?.id ? 'button' : undefined}
              tabIndex={nextDeliverable?.id ? 0 : undefined}
              aria-label={nextDeliverable?.id ? 'Edit next deliverable notes' : undefined}
              onKeyDown={(e) => {
                if (!nextDeliverable?.id) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  startEditingNotes(project.id!, nextDeliverable);
                }
              }}
              title={nextDeliverable?.id ? 'Click to edit notes' : undefined}
            >
              {isEditingNotes ? (
                <div className="space-y-1">
                    <textarea
                      autoFocus
                      rows={1}
                      className="w-full text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-2 py-1 h-7 leading-tight outline-none focus:outline-none focus:ring-0"
                      value={notesEditor?.value ?? ''}
                      onChange={(e) => setNotesEditor(prev => (prev ? { ...prev, value: e.target.value } : prev))}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => { void saveEditingNotes(); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                          e.preventDefault();
                          void saveEditingNotes();
                        }
                      }}
                    />
                  {notesEditor?.saving && (
                    <div className="text-[11px] text-[var(--muted)]">Saving…</div>
                  )}
                  {notesEditor?.error && (
                    <div className="text-[11px] text-red-400">{notesEditor.error}</div>
                  )}
                </div>
              ) : (
                getNotesValue(nextDeliverable)
              )}
            </div>
            {showRowBottomDivider && (
              <div className="absolute inset-x-0 bottom-0 px-2 pointer-events-none">
                <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_repeat(2,minmax(0,0.7fr))_repeat(4,minmax(0,1fr))_repeat(2,minmax(0,0.6fr))] gap-2">
                  <div className="col-span-2" />
                  <div className="col-span-12 h-px bg-[var(--border)]" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const virtualBody = (
    <div ref={parentRef} className="overflow-y-auto h-full relative pb-12 scrollbar-theme">
      <div style={{ height: totalSize, position: 'relative' }}>
        {items.map((v) => {
          const project = projects[v.index];
          if (!project) return null;
          const prev = v.index > 0 ? projects[v.index - 1] : null;
          const sameClientAsPrev = groupClients && prev && (prev.client || '') === (project.client || '');
          const isSelected = selectedProjectId === project.id;
          const isGroupStart = groupClients && v.index !== 0 && (!prev || (prev.client || '') !== (project.client || ''));
          const hasTopDivider = isGroupStart;
          const highlightInsetTop = hasTopDivider ? 'top-px' : 'top-0';
          const nextDeliverableRaw = (project.id != null && typeof project.id === 'number' && nextDeliverables)
            ? nextDeliverables.get(project.id)
            : null;
          const prevDeliverableRaw = (project.id != null && typeof project.id === 'number' && prevDeliverables)
            ? prevDeliverables.get(project.id)
            : null;
          const nextDeliverable = mergeDeliverable(nextDeliverableRaw);
          const prevDeliverable = mergeDeliverable(prevDeliverableRaw);
          const nextPercentText = nextDeliverable?.percentage != null ? `${nextDeliverable.percentage}%` : '';
          const nextDescriptionText = nextDeliverable?.description || '';
          const showNextTopPlaceholder = !!nextDeliverable && !nextPercentText && !nextDescriptionText;
          const parseLocal = (s: string) => new Date((s || '').slice(0,10) + 'T00:00:00');
          const nextDate2 = nextDeliverable?.date ? parseLocal(nextDeliverable.date) : null;
          const nextBottom = nextDate2 ? nextDate2.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const soonLimit2 = new Date(); soonLimit2.setHours(0,0,0,0); const soonEnd2 = new Date(soonLimit2.getTime() + 13*24*60*60*1000);
          const isSoonNext2 = !!(nextDate2 && nextDate2 >= soonLimit2 && nextDate2 <= soonEnd2);
          const nextTopClass2 = isSoonNext2 ? 'text-[#b22222] font-semibold leading-tight' : 'text-[var(--text)] font-medium leading-tight';
          const nextBottomClass2 = isSoonNext2 ? 'text-[#b22222] text-xs leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
          const prevTopRaw = prevDeliverable ? `${prevDeliverable.percentage != null ? `${prevDeliverable.percentage}% ` : ''}${prevDeliverable.description || ''}`.trim() : '';
          const prevTop = prevTopRaw || '-';
          const prevBottom = prevDeliverable?.date ? parseLocal(prevDeliverable.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const today2 = new Date(); today2.setHours(0,0,0,0);
          const prevDate2 = prevDeliverable?.date ? parseLocal(prevDeliverable.date) : null;
          const isRecentPrev2 = !!(prevDate2 && prevDate2 <= today2 && (today2.getTime() - prevDate2.getTime()) <= 8*24*60*60*1000);
          const prevTopClass2 = isRecentPrev2 ? 'text-[#d2691e] text-xs font-semibold italic leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
          const prevBottomClass2 = isRecentPrev2 ? 'text-[#d2691e] text-xs italic leading-tight' : 'text-[var(--muted)] text-xs leading-tight';
          const isEditingNotes2 = notesEditor?.projectId === project.id && notesEditor?.deliverableId === nextDeliverable?.id;
          const isEditingNextPercent2 = nextEditor?.projectId === project.id && nextEditor?.deliverableId === nextDeliverable?.id && nextEditor.field === 'percentage';
          const isEditingNextDescription2 = nextEditor?.projectId === project.id && nextEditor?.deliverableId === nextDeliverable?.id && nextEditor.field === 'description';
          return (
            <div
              key={project.id}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
              onClick={() => handleRowClick(project, v.index)}
              className={`relative grid grid-cols-[repeat(6,minmax(0,1fr))_repeat(2,minmax(0,0.7fr))_repeat(4,minmax(0,1fr))_repeat(2,minmax(0,0.6fr))] gap-2 px-2 py-1.5 text-sm ${hoverEnabled && !isSelected ? 'row-hover-subtle' : ''} transition-colors focus:outline-none ${isGroupStart ? 'border-t border-[var(--border)]' : ''}`}
              tabIndex={0}
            >
              {isSelected && (
                <div className={`absolute inset-x-0 ${highlightInsetTop} bottom-px bg-[var(--surfaceOverlay)] pointer-events-none`} />
              )}
              <div className="col-span-2 text-[var(--muted)] text-xs">{sameClientAsPrev ? '' : (project.client || 'No Client')}</div>
              <div className="col-span-3">
                <div className="text-[var(--text)] font-medium leading-tight">{project.name}</div>
              </div>
              <div className="col-span-1 text-[var(--muted)] text-xs">{project.projectNumber ?? ''}</div>
              <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
                <div className="relative" data-dropdown>
                  <button
                    type="button"
                    className={`${getStatusColor(project.status || '')} whitespace-nowrap text-xs inline-flex items-center gap-1 px-1 py-0.5 rounded hover:text-[var(--text)]`}
                    onClick={() => project.id && statusDropdown.toggle(String(project.id))}
                    aria-haspopup="listbox"
                    aria-expanded={statusDropdown.isOpen(String(project.id))}
                  >
                    {formatStatus(project.status || '')}
                    <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {project.id && (
                    <StatusDropdown
                      currentStatus={(project.status as any) || 'active'}
                      isOpen={statusDropdown.isOpen(String(project.id))}
                      onSelect={async (newStatus) => {
                        if (!project.id) return;
                        try {
                          await projectStatus.updateStatus(project.id, newStatus);
                          statusDropdown.close();
                        } catch {}
                      }}
                      onClose={statusDropdown.close}
                      projectId={project.id}
                      disabled={projectStatus.isUpdating(project.id)}
                      closeOnSelect={false}
                    />
                  )}
                </div>
              </div>
              <div className="col-span-2">
                {prevDeliverable ? (
                  <>
                    <div className={prevTopClass2}>{prevTop}</div>
                    <div className={prevBottomClass2}>{prevBottom || ''}</div>
                  </>
                ) : (
                  <div className="text-[var(--muted)] text-xs">-</div>
                )}
              </div>
              <div className="col-span-2">
                {nextDeliverable ? (
                  <>
                    <div className={`${nextTopClass2} flex items-baseline gap-1`}>
                      {isEditingNextPercent2 ? (
                        <span className="inline-flex items-baseline gap-0.5">
                          <input
                            autoFocus
                            type="text"
                            inputMode="decimal"
                            className="w-10 bg-transparent border-none p-0 m-0 outline-none focus:outline-none focus:ring-0 text-[inherit]"
                            value={nextEditor?.value ?? ''}
                            onChange={(e) => setNextEditor(prev => (prev ? { ...prev, value: e.target.value } : prev))}
                            onBlur={() => { void saveNextDeliverable(); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                                e.preventDefault();
                                void saveNextDeliverable();
                              }
                            }}
                          />
                          <span>%</span>
                        </span>
                      ) : (
                        nextPercentText && (
                          <span
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingNextDeliverable(project.id!, nextDeliverable, 'percentage', String(nextDeliverable.percentage ?? ''));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                startEditingNextDeliverable(project.id!, nextDeliverable, 'percentage', String(nextDeliverable.percentage ?? ''));
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            {nextPercentText}
                          </span>
                        )
                      )}
                      {isEditingNextDescription2 ? (
                        <input
                          autoFocus
                          type="text"
                          className="flex-1 min-w-0 bg-transparent border-none p-0 m-0 outline-none focus:outline-none focus:ring-0 text-[inherit]"
                          value={nextEditor?.value ?? ''}
                          onChange={(e) => setNextEditor(prev => (prev ? { ...prev, value: e.target.value } : prev))}
                          onBlur={() => { void saveNextDeliverable(); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                              e.preventDefault();
                              void saveNextDeliverable();
                            }
                          }}
                        />
                      ) : (
                        <>
                          {nextDescriptionText ? (
                            <span
                            className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditingNextDeliverable(project.id!, nextDeliverable, 'description', nextDescriptionText);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  startEditingNextDeliverable(project.id!, nextDeliverable, 'description', nextDescriptionText);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              {nextDescriptionText}
                            </span>
                          ) : showNextTopPlaceholder ? (
                            <span className="text-[var(--muted)] text-xs">-</span>
                          ) : (
                            <span
                              className="cursor-pointer text-transparent select-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditingNextDeliverable(project.id!, nextDeliverable, 'description', '');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  startEditingNextDeliverable(project.id!, nextDeliverable, 'description', '');
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              .
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className={nextBottomClass2}>
                      <span
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDatePicker(project.id!, nextDeliverable, e.currentTarget as HTMLElement);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDatePicker(project.id!, nextDeliverable, e.currentTarget as HTMLElement);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        {nextBottom || ''}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-[var(--muted)] text-xs">-</div>
                )}
              </div>
              <div
                className={`col-span-2 text-[var(--muted)] text-xs whitespace-normal break-words ${nextDeliverable?.id ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (nextDeliverable?.id) startEditingNotes(project.id!, nextDeliverable);
                }}
                role={nextDeliverable?.id ? 'button' : undefined}
                tabIndex={nextDeliverable?.id ? 0 : undefined}
                aria-label={nextDeliverable?.id ? 'Edit next deliverable notes' : undefined}
                onKeyDown={(e) => {
                  if (!nextDeliverable?.id) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    startEditingNotes(project.id!, nextDeliverable);
                  }
                }}
                title={nextDeliverable?.id ? 'Click to edit notes' : undefined}
              >
                {isEditingNotes2 ? (
                  <div className="space-y-1">
                    <textarea
                      autoFocus
                      rows={1}
                      className="w-full text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-2 py-1 h-7 leading-tight outline-none focus:outline-none focus:ring-0"
                      value={notesEditor?.value ?? ''}
                      onChange={(e) => setNotesEditor(prev => (prev ? { ...prev, value: e.target.value } : prev))}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => { void saveEditingNotes(); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                          e.preventDefault();
                          void saveEditingNotes();
                        }
                      }}
                    />
                    {notesEditor?.saving && (
                      <div className="text-[11px] text-[var(--muted)]">Saving…</div>
                    )}
                    {notesEditor?.error && (
                      <div className="text-[11px] text-red-400">{notesEditor.error}</div>
                    )}
                  </div>
                ) : (
                  getNotesValue(nextDeliverable)
                )}
              </div>
              {(!groupClients || (projects[v.index + 1] && (projects[v.index + 1].client || '') === (project.client || ''))) && (
                <div className="absolute inset-x-0 bottom-0 px-2 pointer-events-none">
                  <div className="grid grid-cols-[repeat(6,minmax(0,1fr))_repeat(2,minmax(0,0.7fr))_repeat(4,minmax(0,1fr))_repeat(2,minmax(0,0.6fr))] gap-2">
                    <div className="col-span-2" />
                    <div className="col-span-12 h-px bg-[var(--border)]" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderMobileCard = (project: Project, index: number) => {
    const nextDeliverableRaw = project.id != null && nextDeliverables ? nextDeliverables.get(project.id) : null;
    const prevDeliverableRaw = project.id != null && prevDeliverables ? prevDeliverables.get(project.id) : null;
    const nextDeliverable = mergeDeliverable(nextDeliverableRaw);
    const prevDeliverable = mergeDeliverable(prevDeliverableRaw);
    const formatDate = (dateStr?: string | null) =>
      dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const isExpanded = project.id != null && expandedCards.has(project.id);
    return (
      <div
        key={project.id ?? index}
        className={`p-4 border-b border-[var(--border)] bg-[var(--surface)] ${
          selectedProjectId === project.id ? 'bg-[var(--surfaceOverlay)]' : ''
        }`}
      >
        <button
          type="button"
          className="w-full text-left"
          onClick={() => onSelect(project, index)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                {project.client || 'No Client'}
              </div>
              <div className="text-base font-semibold text-[var(--text)] truncate">
                {project.name}
              </div>
              <div className="text-xs text-[var(--muted)]">{project.projectNumber || '—'}</div>
            </div>
            <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
              <StatusBadge status={(project.status as any) || 'active'} />
              <button
                type="button"
                className="text-[var(--primary)] text-xs font-medium"
                onClick={() => toggleExpanded(project.id)}
              >
                {isExpanded ? 'Hide details' : 'Show details'}
              </button>
            </div>
          </div>
        </button>
        {isExpanded && (
          <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
            <div>
              <div className="font-semibold text-[var(--text)]">Next Deliverable</div>
              <div>{nextDeliverable?.description || '—'}</div>
              <div>{formatDate(nextDeliverable?.date)}</div>
            </div>
            <div>
              <div className="font-semibold text-[var(--text)]">Last Deliverable</div>
              <div>{prevDeliverable?.description || '—'}</div>
              <div>{formatDate(prevDeliverable?.date)}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

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
        className="fixed z-50"
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

  if (isMobileList) {
    return (
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)] pb-12 scrollbar-theme">
        {projects.map((project, index) => renderMobileCard(project, index))}
        {datePickerPopover}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      {header}
      {loading ? (
        <div className="p-3" />
      ) : enableVirtual ? virtualBody : nonVirtualBody}
      {datePickerPopover}
    </div>
  );
};

const SortIcon: React.FC<{ column: string; sortBy: string; sortDirection: 'asc' | 'desc' }> = ({ column, sortBy, sortDirection }) => {
  if (sortBy !== column) return null;
  return <span className="ml-1 text-[var(--primary)]">{sortDirection === 'asc' ? '^' : 'v'}</span>;
};

export default ProjectsTable;
