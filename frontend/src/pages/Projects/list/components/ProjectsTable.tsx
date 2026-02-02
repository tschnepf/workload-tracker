import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { createPortal } from 'react-dom';
import type { Project, Deliverable, Assignment } from '@/types/models';
import StatusBadge, { getStatusColor, formatStatus } from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useDropdownManager } from '@/components/projects/useDropdownManager';
import { getFlag } from '@/lib/flags';
import { updateDeliverable } from '@/lib/mutations/deliverables';
import { useVirtualRows } from '../hooks/useVirtualRows';
import TooltipPortal from '@/components/ui/TooltipPortal';
import QaAssignmentEditor, { type QaPersonOption } from '@/pages/Projects/list/components/QaAssignmentEditor';
import { deliverablesApi, assignmentsApi, peopleApi } from '@/services/api';
import { createAssignment, deleteAssignment, updateAssignment } from '@/lib/mutations/assignments';
import { useUpdateProject } from '@/hooks/useProjects';
import { useDebounce } from '@/hooks/useDebounce';
import { listProjectRoles } from '@/roles/api';

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
  projectLeads?: Map<number, string>;
  projectQaAssignments?: Map<number, Assignment[]>;
  projectAssignmentDepartments?: Map<number, Set<number>>;
  departmentLabels?: Map<number, string>;
  qaPrefetchByDept?: Map<number, Array<{ id: number; name: string; roleName?: string | null; department?: number | null }>>;
  qaPrefetchAll?: Array<{ id: number; name: string; roleName?: string | null; department?: number | null }>;
  departmentFilterId?: number | null;
  onQaAssignmentUpdated?: (projectId: number) => Promise<void> | void;
  projectAssignmentsTooltip?: Map<number, Array<{ deptLabel: string; items: Array<{ name: string; role: string }> }>>;
  onChangeStatus?: (projectId: number, newStatus: string) => void;
  onRefreshDeliverables?: (projectId: number) => Promise<void> | void;
  onDeliverableEdited?: (projectId: number) => void;
  isMobileList?: boolean;
  autoScrollProjectId?: number | null;
  onAutoScrollComplete?: () => void;
  showDashboardButton?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  loadMoreOffset?: number;
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
  projectLeads,
  projectQaAssignments,
  projectAssignmentsTooltip,
  projectAssignmentDepartments,
  departmentLabels,
  qaPrefetchByDept,
  qaPrefetchAll,
  departmentFilterId,
  onQaAssignmentUpdated,
  onChangeStatus,
  onRefreshDeliverables,
  onDeliverableEdited,
  isMobileList = false,
  autoScrollProjectId,
  onAutoScrollComplete,
  showDashboardButton = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  loadMoreOffset = 160,
}) => {
  const baseGridCols = 'grid-cols-[repeat(2,minmax(0,0.625fr))_repeat(4,minmax(0,1fr))_repeat(2,minmax(0,0.7fr))_repeat(2,minmax(0,0.6fr))_repeat(2,minmax(0,1fr))_repeat(2,minmax(0,0.8fr))_repeat(4,minmax(0,0.9fr))]';
  const gridColsClass = showDashboardButton
    ? 'grid-cols-[repeat(2,minmax(0,0.625fr))_repeat(4,minmax(0,1fr))_repeat(2,minmax(0,0.7fr))_repeat(2,minmax(0,0.6fr))_repeat(2,minmax(0,1fr))_repeat(2,minmax(0,0.8fr))_repeat(4,minmax(0,0.9fr))_minmax(0,0.35fr)]'
    : baseGridCols;
  const enableVirtual = !isMobileList && getFlag('VIRTUALIZED_GRID', false) && projects.length > 200;
  const statusDropdown = useDropdownManager<string>();
  const { parentRef, items, totalSize, virtualizer } = useVirtualRows({ count: projects.length, estimateSize: isMobileList ? 116 : 44, overscan: 6, enableVirtual });
  const groupClients = sortBy === 'client';
  const [hoverEnabled, setHoverEnabled] = useState(true);
  const loadRequestedRef = useRef(false);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('.status-dropdown-container')) return;
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

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

  useEffect(() => {
    if (!selectedProjectId || projects.length === 0) return;
    if (!autoScrollProjectId || autoScrollProjectId !== selectedProjectId) return;
    const idx = projects.findIndex((p) => p.id === selectedProjectId);
    if (idx < 0) return;
    if (enableVirtual) {
      try {
        const targetIndex = Math.max(idx - 2, 0);
        virtualizer.scrollToIndex(targetIndex, { align: 'start' });
      } catch {}
      try { onAutoScrollComplete?.(); } catch {}
      return;
    }
    const container = parentRef.current;
    if (!container) return;
    const row = container.querySelector(`[data-project-id="${selectedProjectId}"]`) as HTMLElement | null;
    if (!row) return;
    try {
      const rowRect = row.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const rowHeight = rowRect.height || (isMobileList ? 116 : 44);
      const desiredTop = container.scrollTop + (rowRect.top - containerRect.top) - rowHeight * 2;
      const maxTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      container.scrollTop = Math.min(desiredTop, maxTop);
    } catch {}
    try { onAutoScrollComplete?.(); } catch {}
  }, [selectedProjectId, projects, enableVirtual, virtualizer, parentRef, autoScrollProjectId, onAutoScrollComplete, isMobileList]);

  useEffect(() => {
    if (!onLoadMore) return;
    const container = parentRef.current;
    if (!container) return;
    let raf = 0;
    const checkAndLoad = () => {
      if (!hasMore || isLoadingMore) return;
      if (loadRequestedRef.current) return;
      const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (remaining <= loadMoreOffset) {
        loadRequestedRef.current = true;
        onLoadMore();
      }
    };
    const handleScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        checkAndLoad();
      });
    };
    container.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [onLoadMore, hasMore, isLoadingMore, loadMoreOffset, isMobileList, enableVirtual, projects.length]);

  useEffect(() => {
    if (!isLoadingMore) loadRequestedRef.current = false;
  }, [isLoadingMore]);

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
  const updateProjectMutation = useUpdateProject();
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Set<number>>(new Set());
  const [projectNumberEditor, setProjectNumberEditor] = useState<{
    projectId: number;
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
  const [qaEditor, setQaEditor] = useState<{
    projectId: number;
    assignmentId: number | null;
    value: string;
    saving: boolean;
    error: string | null;
    departmentId: number | null;
  } | null>(null);
  const qaBoxRef = useRef<HTMLDivElement | null>(null);
  const qaRoleCacheRef = useRef<Map<number, number | null>>(new Map());
  const [qaResults, setQaResults] = useState<QaPersonOption[]>([]);
  const [qaSearching, setQaSearching] = useState(false);
  const debouncedQaSearch = useDebounce(qaEditor?.value ?? '', 150);
  const qaSearchSeq = useRef(0);
  const [qaOverrides, setQaOverrides] = useState<Map<number, { personName: string; deptLabel?: string }>>(new Map());
  const editingDeliverableIds = useMemo(() => {
    const ids = new Set<number>();
    if (notesEditor?.deliverableId) ids.add(notesEditor.deliverableId);
    if (nextEditor?.deliverableId) ids.add(nextEditor.deliverableId);
    if (datePicker?.deliverableId) ids.add(datePicker.deliverableId);
    return ids;
  }, [notesEditor, nextEditor, datePicker]);

  useEffect(() => {
    if (!nextDeliverables && !prevDeliverables) return;
    if (editingDeliverableIds.size === 0) {
      setDeliverableOverrides(new Map());
      setNotesOverrides(new Map());
      return;
    }
    setDeliverableOverrides(prev => {
      const next = new Map<number, Partial<Deliverable>>();
      prev.forEach((value, key) => {
        if (editingDeliverableIds.has(key)) next.set(key, value);
      });
      return next;
    });
    setNotesOverrides(prev => {
      const next = new Map<number, string>();
      prev.forEach((value, key) => {
        if (editingDeliverableIds.has(key)) next.set(key, value);
      });
      return next;
    });
  }, [nextDeliverables, prevDeliverables, editingDeliverableIds]);
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
    <div className={`grid ${gridColsClass} gap-2 px-2 py-1.5 text-xs text-[var(--muted)] font-medium border-b border-[var(--border)] bg-[var(--card)]`}>
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
      <div className="col-span-2 flex items-center">
        PROJECT LEAD
      </div>
      <div className="col-span-2 flex items-center">
        QA
      </div>
      {showDashboardButton ? (
        <div className="col-span-1" />
      ) : null}
    </div>
  );

  const renderAssignmentsTooltip = (projectId?: number | null) => {
    if (projectId == null || !projectAssignmentsTooltip) return null;
    const groups = projectAssignmentsTooltip.get(projectId);
    if (!groups || groups.length === 0) return null;
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        {groups.map((group, groupIndex) => (
          <React.Fragment key={group.deptLabel}>
            <div
              className={`col-span-2 text-[var(--text)] text-xs font-semibold ${
                groupIndex > 0 ? 'mt-1.5' : ''
              }`}
            >
              {group.deptLabel}
            </div>
            {group.items.map((item, idx) => (
              <React.Fragment key={`${group.deptLabel}-${item.name}-${item.role}-${idx}`}>
                <div className="leading-tight truncate text-[var(--muted)] text-xs">{item.name}</div>
                <div className="leading-tight whitespace-nowrap text-left text-[var(--muted)] text-xs">{item.role}</div>
              </React.Fragment>
            ))}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const resolveQaRoleId = async (departmentId: number | null) => {
    if (!departmentId) return null;
    if (qaRoleCacheRef.current.has(departmentId)) {
      return qaRoleCacheRef.current.get(departmentId) ?? null;
    }
    try {
      const roles = await listProjectRoles(departmentId);
      const match = roles.find((role) => {
        const name = (role.name || '').toLowerCase();
        return name.includes('qa') || name.includes('quality');
      });
      const roleId = match?.id ?? null;
      qaRoleCacheRef.current.set(departmentId, roleId);
      return roleId;
    } catch {
      qaRoleCacheRef.current.set(departmentId, null);
      return null;
    }
  };

  const startEditingQa = (projectId: number, assignment?: Assignment | null) => {
    const assignmentId = assignment?.id ?? null;
    const override = assignmentId != null ? qaOverrides.get(assignmentId) : undefined;
    const value = override?.personName ?? assignment?.personName ?? '';
    setQaResults([]);
    setQaEditor({
      projectId,
      assignmentId,
      value,
      saving: false,
      error: null,
      departmentId: departmentFilterId ?? (assignment?.personDepartmentId as number | null | undefined) ?? null,
    });
  };

  const handleSelectQaPerson = async (projectId: number, person: { id: number; name: string; department?: number | null }) => {
    setQaEditor((prev) => (prev ? { ...prev, saving: true, error: null, value: person.name } : prev));
    try {
      const existing = projectQaAssignments?.get(projectId) || [];
      const targetAssignment = qaEditor?.assignmentId
        ? existing.find((item) => item.id === qaEditor.assignmentId)
        : existing[0];
      let assignmentId = targetAssignment?.id ?? null;
      const deptLabel = (person.department != null && departmentLabels?.has(person.department))
        ? (departmentLabels.get(person.department) || undefined)
        : undefined;
      if (assignmentId) {
        await updateAssignment(assignmentId, { person: person.id }, assignmentsApi);
      } else {
        const roleId = await resolveQaRoleId(person.department ?? departmentFilterId ?? null);
        if (!roleId) {
          throw new Error('QA role not found for this department');
        }
        const created = await createAssignment({
          person: person.id,
          project: projectId,
          roleOnProjectId: roleId,
          weeklyHours: {},
          startDate: new Date().toISOString().slice(0, 10),
        } as any, assignmentsApi);
        assignmentId = (created as any)?.id ?? assignmentId;
      }
      setQaOverrides((prev) => {
        const next = new Map(prev);
        if (assignmentId != null) {
          next.set(assignmentId, { personName: person.name, deptLabel });
        }
        return next;
      });
      try { await onQaAssignmentUpdated?.(projectId); } catch {}
      setQaEditor(null);
      setQaResults([]);
    } catch (e: any) {
      const msg = e?.message || 'Failed to update QA assignment';
      setQaEditor((prev) => (prev ? { ...prev, saving: false, error: msg } : prev));
    }
  };

  const handleUnassignQa = async (projectId: number, assignmentId: number) => {
    setQaEditor((prev) => (prev ? { ...prev, saving: true, error: null } : prev));
    try {
      const existing = projectQaAssignments?.get(projectId) || [];
      const assignment = existing.find((item) => item.id === assignmentId);
      await deleteAssignment(assignmentId, assignmentsApi, {
        projectId,
        personId: assignment?.person ?? null,
        updatedAt: assignment?.updatedAt ?? new Date().toISOString(),
      });
      setQaOverrides((prev) => {
        const next = new Map(prev);
        next.delete(assignmentId);
        return next;
      });
      try { await onQaAssignmentUpdated?.(projectId); } catch {}
      setQaEditor(null);
      setQaResults([]);
    } catch (e: any) {
      const msg = e?.message || 'Failed to unassign QA';
      setQaEditor((prev) => (prev ? { ...prev, saving: false, error: msg } : prev));
    }
  };

  const renderQaCell = (projectId?: number | null) => {
    if (!projectId) return null;
    const qaAssignments = projectQaAssignments?.get(projectId) || [];
    const isEditing = qaEditor?.projectId === projectId;
    const renderEditor = () => (
      <div className="relative" ref={qaBoxRef} onClick={(e) => e.stopPropagation()}>
        <QaAssignmentEditor
          value={qaEditor?.value ?? ''}
          onChange={(value) => setQaEditor((prev) => (prev ? { ...prev, value, error: null } : prev))}
          onClose={() => {
            setQaEditor(null);
            setQaResults([]);
          }}
          onSelect={(person: QaPersonOption) => handleSelectQaPerson(projectId, person)}
          onUnassign={
            qaEditor?.assignmentId
              ? () => handleUnassignQa(projectId, qaEditor.assignmentId as number)
              : undefined
          }
          showUnassign={Boolean(qaEditor?.assignmentId)}
          results={qaResults}
          searching={qaSearching}
          saving={qaEditor?.saving}
          error={qaEditor?.error ?? null}
        />
      </div>
    );
    const assignmentDeptIds = projectAssignmentDepartments?.get(projectId) ?? new Set<number>();
    const qaDeptIds = new Set<number>();
    qaAssignments.forEach((assignment) => {
      if (assignment.personDepartmentId != null) qaDeptIds.add(assignment.personDepartmentId);
    });
    const shouldShowAddQa = departmentFilterId != null
      ? (assignmentDeptIds.has(departmentFilterId) && !qaDeptIds.has(departmentFilterId))
      : Array.from(assignmentDeptIds).some((deptId) => !qaDeptIds.has(deptId));

    if (qaAssignments.length === 0 && !isEditing) {
      return (
        <button
          type="button"
          className="w-full text-left text-[var(--muted)] text-xs whitespace-pre-line break-words hover:text-[var(--text)]"
          onClick={(e) => {
            e.stopPropagation();
            startEditingQa(projectId, null);
          }}
          aria-label="Add QA assignment"
          title="Click to assign QA"
        >
          —
        </button>
      );
    }
    return (
      <div className="space-y-0.5">
        {qaAssignments.map((assignment) => {
          const override = assignment.id != null ? qaOverrides.get(assignment.id) : undefined;
          const name = override?.personName
            || assignment.personName
            || (assignment.person == null && assignment.roleName ? `<${assignment.roleName}>` : 'Unknown');
          const deptLabel = override?.deptLabel
            ?? (assignment.personDepartmentId != null ? departmentLabels?.get(assignment.personDepartmentId) : undefined);
          const label = deptLabel ? `${name} (${deptLabel})` : name;
          const isEditingLine = isEditing && qaEditor?.assignmentId === assignment.id;
          if (isEditingLine) {
            return (
              <div key={assignment.id ?? name}>
                {renderEditor()}
              </div>
            );
          }
          return (
            <button
              key={assignment.id ?? name}
              type="button"
              className="w-full text-left text-[var(--muted)] text-xs whitespace-pre-line break-words hover:text-[var(--text)]"
              onClick={(e) => {
                e.stopPropagation();
                startEditingQa(projectId, assignment);
              }}
              aria-label="Edit QA assignment"
              title="Click to change QA assignment"
            >
              {label}
            </button>
          );
        })}
        {isEditing && qaEditor?.assignmentId == null ? (
          <div>{renderEditor()}</div>
        ) : null}
        {!isEditing && shouldShowAddQa ? (
          <button
            type="button"
            className="w-full text-left text-[10px] text-[var(--muted)] hover:text-[var(--text)]"
            onClick={(e) => {
              e.stopPropagation();
              startEditingQa(projectId, null);
            }}
            aria-label="Add another QA assignment"
            title="Add another QA assignment"
          >
            + Add QA
          </button>
        ) : null}
      </div>
    );
  };

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
    if (projectNumberEditor) setProjectNumberEditor(null);
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
      await updateDeliverable(notesEditor.deliverableId, { notes: notesEditor.value }, deliverablesApi);
      setNotesOverrides(prev => {
        const next = new Map(prev);
        next.set(notesEditor.deliverableId, notesEditor.value);
        return next;
      });
      try { await onRefreshDeliverables?.(notesEditor.projectId); } catch {}
      try { onDeliverableEdited?.(notesEditor.projectId); } catch {}
      setNotesEditor(null);
    } catch (e: any) {
      const msg = e?.message || 'Failed to update notes';
      setNotesEditor(prev => (prev ? { ...prev, saving: false, error: msg } : prev));
    }
  };

  const startEditingProjectNumber = (projectId: number, currentValue: string | null | undefined) => {
    setProjectNumberEditor({
      projectId,
      value: currentValue ?? '',
      initialValue: currentValue ?? '',
      saving: false,
      error: null,
    });
  };

  const setStatusUpdating = (projectId: number, isUpdating: boolean) => {
    setStatusUpdatingIds(prev => {
      const next = new Set(prev);
      if (isUpdating) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  };

  const saveEditingProjectNumber = async () => {
    if (!projectNumberEditor) return;
    if (projectNumberEditor.value === projectNumberEditor.initialValue) {
      setProjectNumberEditor(null);
      return;
    }
    setProjectNumberEditor(prev => (prev ? { ...prev, saving: true, error: null } : prev));
    try {
      await updateProjectMutation.mutateAsync({
        id: projectNumberEditor.projectId,
        data: { projectNumber: projectNumberEditor.value || '' },
      });
      setProjectNumberEditor(null);
    } catch (e: any) {
      const msg = e?.message || 'Failed to update project number';
      setProjectNumberEditor(prev => (prev ? { ...prev, saving: false, error: msg } : prev));
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
      await updateDeliverable(nextEditor.deliverableId, updatePayload, deliverablesApi);
      setDeliverableOverrides(prev => {
        const next = new Map(prev);
        const current = next.get(nextEditor.deliverableId) || {};
        next.set(nextEditor.deliverableId, { ...current, ...overridePayload });
        return next;
      });
      try { await onRefreshDeliverables?.(nextEditor.projectId); } catch {}
      try { onDeliverableEdited?.(nextEditor.projectId); } catch {}
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
      await updateDeliverable(datePicker.deliverableId, { date: value || null }, deliverablesApi);
      setDeliverableOverrides(prev => {
        const next = new Map(prev);
        const current = next.get(datePicker.deliverableId) || {};
        next.set(datePicker.deliverableId, { ...current, date: value || null });
        return next;
      });
      try { await onRefreshDeliverables?.(datePicker.projectId); } catch {}
      try { onDeliverableEdited?.(datePicker.projectId); } catch {}
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

  useEffect(() => {
    if (!qaEditor) return;
    const term = debouncedQaSearch.trim();
    if (term.length < 2) {
      setQaSearching(false);
      setQaResults([]);
      return;
    }
    const seq = ++qaSearchSeq.current;
    setQaSearching(true);
    peopleApi.search(term, 20, qaEditor.departmentId != null ? { department: qaEditor.departmentId } : undefined)
      .then((results) => {
        if (qaSearchSeq.current === seq) setQaResults(results || []);
      })
      .catch(() => {
        if (qaSearchSeq.current === seq) setQaResults([]);
      })
      .finally(() => {
        if (qaSearchSeq.current === seq) setQaSearching(false);
      });
  }, [debouncedQaSearch, qaEditor]);

  useEffect(() => {
    if (!qaEditor) return;
    const term = (qaEditor.value || '').trim().toLowerCase();
    if (term.length < 2) return;
    const pool = qaEditor.departmentId != null
      ? qaPrefetchByDept?.get(qaEditor.departmentId)
      : qaPrefetchAll;
    if (!pool || pool.length === 0) return;
    const matches = pool
      .filter((person) => person.name.toLowerCase().includes(term))
      .slice(0, 6)
      .map((person) => ({
        id: person.id,
        name: person.name,
        roleName: person.roleName ?? null,
        department: person.department ?? null,
      }));
    if (matches.length > 0) {
      setQaResults(matches);
    }
  }, [qaEditor?.value, qaEditor?.departmentId, qaPrefetchByDept, qaPrefetchAll]);

  useEffect(() => {
    if (!qaEditor) return;
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (qaBoxRef.current && target && qaBoxRef.current.contains(target)) return;
      setQaEditor(null);
      setQaResults([]);
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [qaEditor]);

  useEffect(() => {
    if (!projectQaAssignments || qaOverrides.size === 0) return;
    setQaOverrides((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      const assignmentById = new Map<number, Assignment>();
      projectQaAssignments.forEach((items) => {
        items.forEach((item) => {
          if (item.id != null) assignmentById.set(item.id, item);
        });
      });
      next.forEach((override, assignmentId) => {
        const item = assignmentById.get(assignmentId);
        if (!item) {
          next.delete(assignmentId);
          return;
        }
        if (!override.personName || item.personName === override.personName) {
          next.delete(assignmentId);
        }
      });
      return next;
    });
  }, [projectQaAssignments, qaOverrides.size]);

  const nonVirtualBody = (
    <div ref={parentRef} className="overflow-y-auto h-full pb-12 scrollbar-theme">
      {projects.map((project, index) => {
        const prev = index > 0 ? projects[index - 1] : null;
        const sameClientAsPrev = groupClients && prev && (prev.client || '') === (project.client || '');
        const next = index < projects.length - 1 ? projects[index + 1] : null;
        const sameClientAsNext = groupClients && next && (next.client || '') === (project.client || '');
        const showRowBottomDivider = index < projects.length - 1;
        const isSelected = selectedProjectId === project.id;
        const highlightInsetTop = 'top-0';
        const nextDeliverableRaw = (project.id != null && typeof project.id === 'number' && nextDeliverables)
          ? nextDeliverables.get(project.id)
          : null;
        const prevDeliverableRaw = (project.id != null && typeof project.id === 'number' && prevDeliverables)
          ? prevDeliverables.get(project.id)
          : null;
        const nextDeliverable = mergeDeliverable(nextDeliverableRaw);
        const prevDeliverable = mergeDeliverable(prevDeliverableRaw);
        const projectLead = project.id != null ? projectLeads?.get(project.id) : '';
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
        const isEditingProjectNumber = projectNumberEditor?.projectId === project.id;
        const projectNumberDisplay = project.projectNumber ?? '';
        const isEditingNextPercent = nextEditor?.projectId === project.id && nextEditor?.deliverableId === nextDeliverable?.id && nextEditor.field === 'percentage';
        const isEditingNextDescription = nextEditor?.projectId === project.id && nextEditor?.deliverableId === nextDeliverable?.id && nextEditor.field === 'description';
        const isStatusUpdating = project.id != null && statusUpdatingIds.has(project.id);
        return (
          <div
            key={project.id}
            data-project-id={project.id}
            onClick={() => handleRowClick(project, index)}
            className={`relative grid ${gridColsClass} gap-2 px-2 py-1.5 text-sm ${hoverEnabled && !isSelected ? 'row-hover-subtle' : ''} transition-colors focus:outline-none`}
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
            <div
              className={`col-span-1 text-[var(--muted)] text-xs ${project.id ? 'cursor-pointer' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (project.id) startEditingProjectNumber(project.id, project.projectNumber ?? '');
              }}
              role={project.id ? 'button' : undefined}
              tabIndex={project.id ? 0 : undefined}
              aria-label={project.id ? 'Edit project number' : undefined}
              onKeyDown={(e) => {
                if (!project.id) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  startEditingProjectNumber(project.id, project.projectNumber ?? '');
                }
              }}
              title={project.id ? 'Click to edit project number' : undefined}
            >
              {isEditingProjectNumber ? (
                <input
                  autoFocus
                  type="text"
                  className="w-full bg-transparent border-none p-0 m-0 text-[inherit] text-xs leading-tight outline-none focus:outline-none focus:ring-0"
                  value={projectNumberEditor?.value ?? ''}
                  onChange={(e) => setProjectNumberEditor(prev => (prev ? { ...prev, value: e.target.value } : prev))}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => { void saveEditingProjectNumber(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                      e.preventDefault();
                      void saveEditingProjectNumber();
                    }
                  }}
                />
              ) : (
                projectNumberDisplay
              )}
            </div>
            <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
              <div className="relative" data-dropdown>
                <button
                  type="button"
                  className={`${getStatusColor(project.status || '')} whitespace-nowrap text-xs inline-flex items-center gap-1 px-1 py-0.5 rounded hover:text-[var(--text)] ${isStatusUpdating ? 'opacity-70 cursor-not-allowed' : ''}`}
                  onClick={() => !isStatusUpdating && project.id && statusDropdown.toggle(String(project.id))}
                  aria-haspopup="listbox"
                  aria-expanded={statusDropdown.isOpen(String(project.id))}
                  disabled={isStatusUpdating}
                >
                  {formatStatus(project.status || '')}
                  {isStatusUpdating && <span className="text-[10px] opacity-70">Updating…</span>}
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
                        setStatusUpdating(project.id, true);
                        await Promise.resolve(onChangeStatus?.(project.id, newStatus));
                        statusDropdown.close();
                      } catch {} finally {
                        setStatusUpdating(project.id, false);
                      }
                    }}
                    onClose={statusDropdown.close}
                    projectId={project.id}
                    disabled={statusUpdatingIds.has(project.id)}
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
                if (isEditingNotes) return;
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
            <div className="col-span-2 text-[var(--muted)] text-xs whitespace-pre-line break-words">
              {(() => {
                if (!projectLead) return '';
                const tooltip = renderAssignmentsTooltip(project.id);
                if (!tooltip) return projectLead;
                return (
                  <TooltipPortal title="Assignments" description={tooltip} placement="bottom">
                    <span>{projectLead}</span>
                  </TooltipPortal>
                );
              })()}
            </div>
            <div className="col-span-2 text-[var(--muted)] text-xs whitespace-pre-line break-words">
              {renderQaCell(project.id)}
            </div>
            {showDashboardButton && project.id ? (
              <div className="col-span-1 flex justify-end">
                <Link
                  to={`/projects/${project.id}/dashboard`}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)]"
                  aria-label="Open project dashboard"
                  title="Open project dashboard"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="3" y="4" width="7" height="7" rx="1.2" />
                    <rect x="14" y="4" width="7" height="7" rx="1.2" />
                    <rect x="3" y="15" width="18" height="5" rx="1.2" />
                  </svg>
                </Link>
              </div>
            ) : null}
            {showRowBottomDivider && (
              <div className="absolute inset-x-0 bottom-0 px-2 pointer-events-none">
                <div className={`grid ${gridColsClass} gap-2`}>
                  <div
                    className="h-px bg-[var(--border)]"
                    style={{ gridColumn: (groupClients && !sameClientAsNext) ? '1 / -1' : '3 / -1' }}
                  />
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
          const next = v.index < projects.length - 1 ? projects[v.index + 1] : null;
          const sameClientAsNext = groupClients && next && (next.client || '') === (project.client || '');
          const isSelected = selectedProjectId === project.id;
          const showRowBottomDivider = v.index < projects.length - 1;
          const highlightInsetTop = 'top-0';
          const nextDeliverableRaw = (project.id != null && typeof project.id === 'number' && nextDeliverables)
            ? nextDeliverables.get(project.id)
            : null;
          const prevDeliverableRaw = (project.id != null && typeof project.id === 'number' && prevDeliverables)
            ? prevDeliverables.get(project.id)
            : null;
          const nextDeliverable = mergeDeliverable(nextDeliverableRaw);
          const prevDeliverable = mergeDeliverable(prevDeliverableRaw);
          const projectLead = project.id != null ? projectLeads?.get(project.id) : '';
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
          const isEditingProjectNumber2 = projectNumberEditor?.projectId === project.id;
          const projectNumberDisplay2 = project.projectNumber ?? '';
          const isEditingNextPercent2 = nextEditor?.projectId === project.id && nextEditor?.deliverableId === nextDeliverable?.id && nextEditor.field === 'percentage';
          const isEditingNextDescription2 = nextEditor?.projectId === project.id && nextEditor?.deliverableId === nextDeliverable?.id && nextEditor.field === 'description';
          const isStatusUpdating2 = project.id != null && statusUpdatingIds.has(project.id);
          return (
            <div
              key={project.id}
              data-project-id={project.id}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
              onClick={() => handleRowClick(project, v.index)}
              className={`relative grid ${gridColsClass} gap-2 px-2 py-1.5 text-sm ${hoverEnabled && !isSelected ? 'row-hover-subtle' : ''} transition-colors focus:outline-none`}
              tabIndex={0}
            >
              {isSelected && (
                <div className={`absolute inset-x-0 ${highlightInsetTop} bottom-px bg-[var(--surfaceOverlay)] pointer-events-none`} />
              )}
              <div className="col-span-2 text-[var(--muted)] text-xs">{sameClientAsPrev ? '' : (project.client || 'No Client')}</div>
              <div className="col-span-3">
                <div className="text-[var(--text)] font-medium leading-tight">{project.name}</div>
              </div>
              <div
                className={`col-span-1 text-[var(--muted)] text-xs ${project.id ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (project.id) startEditingProjectNumber(project.id, project.projectNumber ?? '');
                }}
                role={project.id ? 'button' : undefined}
                tabIndex={project.id ? 0 : undefined}
                aria-label={project.id ? 'Edit project number' : undefined}
                onKeyDown={(e) => {
                  if (!project.id) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    startEditingProjectNumber(project.id, project.projectNumber ?? '');
                  }
                }}
                title={project.id ? 'Click to edit project number' : undefined}
              >
                {isEditingProjectNumber2 ? (
                  <input
                    autoFocus
                    type="text"
                    className="w-full bg-transparent border-none p-0 m-0 text-[inherit] text-xs leading-tight outline-none focus:outline-none focus:ring-0"
                    value={projectNumberEditor?.value ?? ''}
                    onChange={(e) => setProjectNumberEditor(prev => (prev ? { ...prev, value: e.target.value } : prev))}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => { void saveEditingProjectNumber(); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                        e.preventDefault();
                        void saveEditingProjectNumber();
                      }
                    }}
                  />
                ) : (
                  projectNumberDisplay2
                )}
              </div>
              <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
                <div className="relative" data-dropdown>
                  <button
                    type="button"
                    className={`${getStatusColor(project.status || '')} whitespace-nowrap text-xs inline-flex items-center gap-1 px-1 py-0.5 rounded hover:text-[var(--text)] ${isStatusUpdating2 ? 'opacity-70 cursor-not-allowed' : ''}`}
                    onClick={() => !isStatusUpdating2 && project.id && statusDropdown.toggle(String(project.id))}
                    aria-haspopup="listbox"
                    aria-expanded={statusDropdown.isOpen(String(project.id))}
                    disabled={isStatusUpdating2}
                  >
                    {formatStatus(project.status || '')}
                    {isStatusUpdating2 && <span className="text-[10px] opacity-70">Updating…</span>}
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
                          setStatusUpdating(project.id, true);
                          await Promise.resolve(onChangeStatus?.(project.id, newStatus));
                          statusDropdown.close();
                        } catch {} finally {
                          setStatusUpdating(project.id, false);
                        }
                      }}
                      onClose={statusDropdown.close}
                      projectId={project.id}
                      disabled={statusUpdatingIds.has(project.id)}
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
                  if (isEditingNotes2) return;
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
              <div className="col-span-2 text-[var(--muted)] text-xs whitespace-pre-line break-words">
                {(() => {
                  if (!projectLead) return '';
                  const tooltip = renderAssignmentsTooltip(project.id);
                  if (!tooltip) return projectLead;
                  return (
                    <TooltipPortal title="Assignments" description={tooltip} placement="bottom">
                      <span>{projectLead}</span>
                    </TooltipPortal>
                  );
                })()}
              </div>
              <div className="col-span-2 text-[var(--muted)] text-xs whitespace-pre-line break-words">
                {renderQaCell(project.id)}
              </div>
              {showDashboardButton && project.id ? (
                <div className="col-span-1 flex justify-end">
                  <Link
                    to={`/projects/${project.id}/dashboard`}
                    onClick={(e) => e.stopPropagation()}
                  className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)]"
                  aria-label="Open project dashboard"
                  title="Open project dashboard"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="3" y="4" width="7" height="7" rx="1.2" />
                    <rect x="14" y="4" width="7" height="7" rx="1.2" />
                    <rect x="3" y="15" width="18" height="5" rx="1.2" />
                  </svg>
                  </Link>
                </div>
              ) : null}
              {showRowBottomDivider && (
                <div className="absolute inset-x-0 bottom-0 px-2 pointer-events-none">
                  <div className={`grid ${gridColsClass} gap-2`}>
                    <div
                      className="h-px bg-[var(--border)]"
                      style={{ gridColumn: (groupClients && !sameClientAsNext) ? '1 / -1' : '3 / -1' }}
                    />
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
      <div ref={parentRef} className="flex-1 overflow-y-auto divide-y divide-[var(--border)] pb-12 scrollbar-theme">
        {projects.map((project, index) => (
          <div key={project.id} data-project-id={project.id}>
            {renderMobileCard(project, index)}
          </div>
        ))}
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
